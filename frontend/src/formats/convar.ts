/**
 * Source / GoldSource `server.cfg` — one console command per line:
 * `convar value` or `convar "quoted value"`, `//` line comments, executed at
 * boot/map-change. Covers CS2/CS:GO/CS:S, TF2, Garry's Mod, L4D/L4D2, DoD:S,
 * HL2:DM, and (via the optional `set`/`seta` keyword) idTech/FiveM dialects.
 *
 * Booleans in convar-land are `1`/`0`. Strings are double-quoted. A line model
 * preserves comments, ordering, indentation, and any leading keyword; only the
 * value of an edited convar is rewritten, new convars are appended.
 */
import type { ConfigDoc, Format } from './types';
import { makeCodec, quoteDouble, unquoteDouble } from './shared';

const codec = makeCodec({
    boolTrue: '1',
    boolFalse: '0',
    isTruthy: (raw) => {
        const s = unquoteDouble(raw.trim()).toLowerCase();
        return s !== '0' && s !== '' && s !== 'false';
    },
    quoteText: quoteDouble,
    unquoteText: unquoteDouble,
});

// set/seta/sets/setr/setu <name> <value> — idTech/FiveM; Source uses bare lines.
const KEYWORDS = new Set(['set', 'seta', 'sets', 'setr', 'setu']);

type Line =
    | { kind: 'raw'; text: string }
    | { kind: 'kv'; indent: string; keyword: string; name: string; value: string };

function parseLine(text: string): Extract<Line, { kind: 'kv' }> | null {
    const indent = (text.match(/^(\s*)/) as RegExpMatchArray)[1];
    const rest = text.slice(indent.length);
    if (rest === '' || rest.startsWith('//')) return null;

    const m = rest.match(/^(\S+)\s*([\s\S]*)$/);
    if (!m) return null;
    let name = m[1];
    let value = m[2];
    let keyword = '';
    if (KEYWORDS.has(name.toLowerCase()) && value) {
        const m2 = value.match(/^(\S+)\s*([\s\S]*)$/);
        if (m2) {
            keyword = name;
            name = m2[1];
            value = m2[2];
        }
    }
    return { kind: 'kv', indent, keyword, name, value };
}

function emit(l: Line): string {
    if (l.kind === 'raw') return l.text;
    const kw = l.keyword ? l.keyword + ' ' : '';
    return l.value === '' ? `${l.indent}${kw}${l.name}` : `${l.indent}${kw}${l.name} ${l.value}`;
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
                return;
            }
            lines.push({ kind: 'kv', indent: '', keyword: '', name: a, value: val });
            order.push(a);
            idx[a] = lines.length - 1;
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

export const convarFormat: Format = { id: 'convar', codec, parse };
