/**
 * Palworld format - the original, genuinely unique one.
 *
 * `PalWorldSettings.ini` is a header line plus one giant
 * `OptionSettings=(k=v,k=v,...)` line. We keep everything before the inner list
 * and everything from the closing `)` onward verbatim, parse the inner list
 * into an ordered key->raw map with a depth+quote-aware splitter, and always
 * regenerate just that one line on save - so a stray newline can't corrupt the
 * file and untouched keys keep their exact spelling.
 */
import type { ConfigDoc, Format } from './types';
import { makeCodec, quoteDouble, unquoteDouble } from './shared';

const codec = makeCodec({
    boolTrue: 'True',
    boolFalse: 'False',
    quoteText: quoteDouble,
    unquoteText: unquoteDouble,
});

/** Split a comma list at top level only - respects nested parens and escaped quotes. */
function splitTopLevel(s: string): string[] {
    const out: string[] = [];
    let depth = 0;
    let inQ = false;
    let cur = '';
    let escaped = false;
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (c === '"' && !escaped) {
            inQ = !inQ;
            cur += c;
            continue;
        }
        if (!inQ) {
            if (c === '(') depth++;
            else if (c === ')') depth--;
            else if (c === ',' && depth === 0) {
                out.push(cur);
                cur = '';
                escaped = false;
                continue;
            }
        }
        cur += c;
        escaped = c === '\\' && !escaped;
    }
    if (cur.length) out.push(cur);
    return out;
}

function parse(text: string): ConfigDoc | null {
    const marker = 'OptionSettings=(';
    const start = text.indexOf(marker);
    const close = text.lastIndexOf(')');
    if (start === -1 || close <= start + marker.length) return null;

    const open = start + marker.length;
    const before = text.slice(0, open);
    const after = text.slice(close); // keeps the closing ')' + any trailing newline
    const inner = text.slice(open, close);

    interface Token {
        raw: string;
        key?: string;
    }
    const tokens: Token[] = splitTopLevel(inner).map((raw) => {
        const eq = raw.indexOf('=');
        if (eq === -1) return { raw };
        const key = raw.slice(0, eq).trim();
        return key ? { raw, key } : { raw };
    });
    const idx: Record<string, number> = {};
    const order: string[] = [];
    const reindex = () => {
        for (const k of Object.keys(idx)) delete idx[k];
        order.length = 0;
        tokens.forEach((token, i) => {
            if (!token.key) return;
            if (!(token.key in idx)) order.push(token.key);
            idx[token.key] = i; // the game's live value is the last occurrence
        });
    };
    reindex();

    return {
        keys: () => order,
        has: (a) => a in idx,
        getRaw: (a) => {
            const i = idx[a];
            if (i === undefined) return undefined;
            const eq = tokens[i].raw.indexOf('=');
            return eq === -1 ? undefined : tokens[i].raw.slice(eq + 1);
        },
        setRaw: (a, val) => {
            const i = idx[a];
            if (i === undefined) {
                tokens.push({ raw: `${a}=${val}`, key: a });
            } else {
                const eq = tokens[i].raw.indexOf('=');
                tokens[i].raw = (eq === -1 ? `${a}=` : tokens[i].raw.slice(0, eq + 1)) + val;
            }
            reindex();
            return true;
        },
        remove: (a) => {
            let removed = false;
            for (let i = tokens.length - 1; i >= 0; i--) {
                if (tokens[i].key === a) {
                    tokens.splice(i, 1);
                    removed = true;
                }
            }
            reindex();
            return removed;
        },
        removeMany: (addresses) => {
            const wanted = new Set(addresses);
            if ([...wanted].some((address) => !(address in idx))) return false;
            for (let i = tokens.length - 1; i >= 0; i--) {
                if (tokens[i].key && wanted.has(tokens[i].key!)) tokens.splice(i, 1);
            }
            reindex();
            return true;
        },
        sectionOf: () => '',
        labelOf: (a) => a,
        serialize: () => before + tokens.map((token) => token.raw).join(',') + after,
    };
}

export const palworldFormat: Format = { id: 'palworld', codec, parse };
