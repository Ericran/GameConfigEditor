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

/** Split a comma list at top level only - respects nested parens and quotes. */
function splitTopLevel(s: string): string[] {
    const out: string[] = [];
    let depth = 0;
    let inQ = false;
    let cur = '';
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (c === '"') {
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
                continue;
            }
        }
        cur += c;
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

    const values: Record<string, string> = {};
    const order: string[] = [];
    for (const part of splitTopLevel(inner)) {
        const eq = part.indexOf('=');
        if (eq === -1) continue;
        const k = part.slice(0, eq).trim();
        const v = part.slice(eq + 1);
        if (!(k in values)) order.push(k);
        values[k] = v;
    }

    return {
        keys: () => order,
        has: (a) => a in values,
        getRaw: (a) => values[a],
        setRaw: (a, val) => {
            if (!(a in values)) order.push(a);
            values[a] = val;
        },
        remove: (a) => {
            if (!(a in values)) return;
            delete values[a];
            const i = order.indexOf(a);
            if (i >= 0) order.splice(i, 1);
        },
        sectionOf: () => '',
        labelOf: (a) => a,
        serialize: () => before + order.map((k) => `${k}=${values[k]}`).join(',') + after,
    };
}

export const palworldFormat: Format = { id: 'palworld', codec, parse };
