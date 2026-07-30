/**
 * Source / GoldSource `server.cfg` - one console command per line:
 * `convar value` or `convar "quoted value"`, `//` line comments, executed at
 * boot/map-change. Covers CS2/CS:GO/CS:S, TF2, Garry's Mod, L4D/L4D2, DoD:S,
 * HL2:DM, and (via the optional `set`/`seta` keyword) idTech/FiveM dialects.
 *
 * Booleans in convar-land are `1`/`0`. Strings are double-quoted. A line model
 * preserves comments, ordering, indentation, and any leading keyword; only the
 * value of an edited convar is rewritten, new convars are appended.
 */
import type { ConfigDoc, Format } from './types';
import { makeCodec, quoteDouble, unquoteDouble, type CodecOptions } from './shared';

export interface ConvarOptions {
    /** Codec overrides - e.g. SA-MP writes bare values with no quotes. */
    codec?: Partial<CodecOptions>;
}

// set/seta/sets/setr/setu <name> <value> - idTech/FiveM; Source uses bare lines.
const KEYWORDS = new Set(['set', 'seta', 'sets', 'setr', 'setu']);

type Line =
    | { kind: 'raw'; text: string }
    | { kind: 'kv'; indent: string; keyword: string; name: string; separator: string; value: string; suffix: string };

/** Split a trailing // comment outside a quoted value, preserving its padding. */
function splitInlineComment(value: string): [string, string] {
    let quoted = false;
    let escaped = false;
    for (let i = 0; i < value.length - 1; i++) {
        const c = value[i];
        if (c === '"' && !escaped) quoted = !quoted;
        if (!quoted && c === '/' && value[i + 1] === '/' && (i === 0 || /\s/.test(value[i - 1]))) {
            let start = i;
            while (start > 0 && /[ \t]/.test(value[start - 1])) start--;
            return [value.slice(0, start), value.slice(start)];
        }
        escaped = c === '\\' && !escaped;
        if (c !== '\\') escaped = false;
    }
    return [value, ''];
}

function parseLine(text: string): Extract<Line, { kind: 'kv' }> | null {
    const indent = (text.match(/^(\s*)/) as RegExpMatchArray)[1];
    const rest = text.slice(indent.length);
    if (rest === '' || rest.startsWith('//')) return null;

    const m = rest.match(/^(\S+)(\s*)([\s\S]*)$/);
    if (!m) return null;
    let name = m[1];
    let separator = m[2];
    let value = m[3];
    let keyword = '';
    if (KEYWORDS.has(name.toLowerCase()) && value) {
        const m2 = value.match(/^(\S+)(\s*)([\s\S]*)$/);
        if (m2) {
            keyword = name;
            name = m2[1];
            separator = m2[2];
            value = m2[3];
        }
    }
    const [cleanValue, suffix] = splitInlineComment(value);
    return { kind: 'kv', indent, keyword, name, separator, value: cleanValue, suffix };
}

function emit(l: Line): string {
    if (l.kind === 'raw') return l.text;
    const kw = l.keyword ? l.keyword + ' ' : '';
    return l.value === ''
        ? `${l.indent}${kw}${l.name}${l.suffix ? l.separator : ''}${l.suffix}`
        : `${l.indent}${kw}${l.name}${l.separator || ' '}${l.value}${l.suffix}`;
}

function parse(text: string): ConfigDoc | null {
    const nl = text.includes('\r\n') ? '\r\n' : '\n';
    const lines: Line[] = text.split(/\r?\n/).map((t) => {
        const kv = parseLine(t);
        return kv ?? { kind: 'raw', text: t };
    });
    const idx: Record<string, number> = {};
    const order: string[] = [];

    const reindex = () => {
        for (const k of Object.keys(idx)) delete idx[k];
        order.length = 0;
        lines.forEach((l, i) => {
            if (l.kind !== 'kv') return;
            if (!(l.name in idx)) order.push(l.name);
            idx[l.name] = i;
        });
    };
    reindex();
    if (order.length === 0) return null; // no convar lines -> not a server.cfg we can edit

    return {
        keys: () => order,
        has: (a) => a in idx,
        getRaw: (a) => {
            const i = idx[a];
            return i === undefined ? undefined : (lines[i] as Extract<Line, { kind: 'kv' }>).value;
        },
        setRaw: (a, val) => {
            const i = idx[a];
            if (i !== undefined) {
                (lines[i] as Extract<Line, { kind: 'kv' }>).value = val;
                return true;
            }
            lines.push({ kind: 'kv', indent: '', keyword: '', name: a, separator: val === '' ? '' : ' ', value: val, suffix: '' });
            order.push(a);
            idx[a] = lines.length - 1;
            return true;
        },
        remove: (a) => {
            const i = idx[a];
            if (i === undefined) return;
            lines.splice(i, 1);
            reindex();
        },
        sectionOf: () => '',
        labelOf: (a) => a,
        serialize: () => lines.map(emit).join(nl),
    };
}

export function makeConvarFormat(id: string, opts: ConvarOptions = {}): Format {
    const codec = makeCodec({
        boolTrue: '1',
        boolFalse: '0',
        isTruthy: (raw) => {
            const s = unquoteDouble(raw.trim()).toLowerCase();
            return s !== '0' && s !== '' && s !== 'false';
        },
        quoteText: quoteDouble,
        unquoteText: unquoteDouble,
        ...opts.codec,
    });
    return { id, codec, parse };
}

/** Source / GoldSource / idTech server.cfg (double-quoted strings, 1/0 bools). */
export const convarFormat = makeConvarFormat('convar');

/**
 * SA-MP `server.cfg`. Same `name value` lines, but SA-MP does not use quotes -
 * `hostname My Server` is correct and `hostname "My Server"` would include the
 * quotes in the browser name.
 */
export const sampFormat = makeConvarFormat('samp', {
    codec: { quoteText: (v) => v, unquoteText: (raw) => raw },
});
