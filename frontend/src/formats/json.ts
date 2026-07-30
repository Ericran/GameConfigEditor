/**
 * JSON config format - parses a JSON object into a ConfigDoc addressed by
 * dotted paths (e.g. `Rcon.Port`). Nested objects recurse into more dotted
 * paths; arrays and any non-scalar leaf are exposed as a raw JSON string so the
 * generic editor can still show/edit them. On write, the raw string is coerced
 * back to the JSON type of the value it replaces, so `"Port": 9876` stays a
 * number and `"Secure": true` stays a boolean.
 *
 * JSON has no comments, so round-tripping is parse -> mutate-in-place ->
 * re-stringify. Key order and untouched values are preserved by JS object
 * semantics; the file's original indentation and trailing newline are detected
 * and reused. (Unlike the line-based formats it does normalize whitespace and
 * number spelling on save - acceptable for JSON, which the game rewrites anyway.)
 *
 * Used by V Rising (ServerHostSettings.json / ServerGameSettings.json).
 */
import type { ConfigDoc, Format } from './types';
import { makeCodec } from './shared';

type J = any;

const isPlainObject = (v: J): v is Record<string, J> =>
    v !== null && typeof v === 'object' && !Array.isArray(v);

/** Dotted addresses stay readable while escaping literal dots/backslashes in keys. */
const escapeSegment = (segment: string): string => segment.replace(/\\/g, '\\\\').replace(/\./g, '\\.');
function splitAddress(address: string): string[] {
    const parts: string[] = [];
    let part = '';
    let escaped = false;
    for (const c of address) {
        if (escaped) {
            part += c;
            escaped = false;
        } else if (c === '\\') {
            escaped = true;
        } else if (c === '.') {
            parts.push(part);
            part = '';
        } else {
            part += c;
        }
    }
    if (escaped) part += '\\';
    parts.push(part);
    return parts;
}

/** Indentation of the first indented line (tab or N spaces); 4 spaces if none. */
function detectIndent(text: string): string {
    const m = text.match(/\n([ \t]+)\S/);
    if (!m) return '    ';
    return m[1][0] === '\t' ? '\t' : ' '.repeat(m[1].length);
}

/** A scalar becomes its bare string; an array/object leaf becomes a JSON string. */
function rawOf(v: J): string {
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (typeof v === 'number') return String(v);
    if (typeof v === 'string') return v;
    if (v === null) return '';
    return JSON.stringify(v);
}

/** Coerce a raw string back to the JSON type of the value it replaces. */
function coerce(raw: string, existing: J): { ok: boolean; value: J } {
    if (typeof existing === 'boolean') return { ok: true, value: raw.trim().toLowerCase() === 'true' };
    if (typeof existing === 'number') {
        const n = Number(raw);
        return { ok: Number.isFinite(n), value: Number.isFinite(n) ? n : existing };
    }
    if (Array.isArray(existing) || isPlainObject(existing)) {
        try {
            return { ok: true, value: JSON.parse(raw) };
        } catch {
            return { ok: false, value: existing };
        }
    }
    return { ok: true, value: raw }; // string / null / brand-new key
}

export function makeJsonFormat(id: string): Format {
    const codec = makeCodec({ boolTrue: 'true', boolFalse: 'false' });

    function parse(text: string): ConfigDoc | null {
        let root: J;
        try {
            root = JSON.parse(text);
        } catch {
            return null; // not JSON -> editor falls back to raw text
        }
        if (!isPlainObject(root)) return null;

        const indent = detectIndent(text);
        const trailing = text.endsWith('\n') ? '\n' : '';

        /** Resolve an address to [parentObject, lastKey], or undefined if the path is broken. */
        const locate = (address: string): [Record<string, J>, string] | undefined => {
            const parts = splitAddress(address);
            let node: J = root;
            for (let i = 0; i < parts.length - 1; i++) {
                if (!isPlainObject(node) || !(parts[i] in node)) return undefined;
                node = node[parts[i]];
            }
            return isPlainObject(node) ? [node, parts[parts.length - 1]] : undefined;
        };

        const leaves = (): string[] => {
            const out: string[] = [];
            const walk = (obj: Record<string, J>, prefix: string) => {
                for (const k of Object.keys(obj)) {
                    const path = prefix ? `${prefix}.${escapeSegment(k)}` : escapeSegment(k);
                    if (isPlainObject(obj[k])) walk(obj[k], path);
                    else out.push(path);
                }
            };
            walk(root, '');
            return out;
        };

        return {
            keys: leaves,
            has: (a) => {
                const loc = locate(a);
                return !!loc && loc[1] in loc[0];
            },
            getRaw: (a) => {
                const loc = locate(a);
                return loc && loc[1] in loc[0] ? rawOf(loc[0][loc[1]]) : undefined;
            },
            setRaw: (a, val) => {
                const loc = locate(a);
                if (!loc) return false; // won't invent missing nested parents
                const result = coerce(val, loc[0][loc[1]]);
                if (!result.ok) return false;
                loc[0][loc[1]] = result.value;
                return true;
            },
            remove: (a) => {
                const loc = locate(a);
                if (loc && loc[1] in loc[0]) delete loc[0][loc[1]];
            },
            sectionOf: (a) => {
                const parts = splitAddress(a);
                return parts.length <= 1 ? '' : parts.slice(0, -1).map(escapeSegment).join('.');
            },
            labelOf: (a) => {
                const parts = splitAddress(a);
                return parts[parts.length - 1] ?? a;
            },
            serialize: () => JSON.stringify(root, null, indent) + trailing,
        };
    }

    return { id, codec, parse };
}

/** Default JSON format. */
export const jsonFormat = makeJsonFormat('json');
