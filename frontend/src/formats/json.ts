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
 * Used by V Rising (ServerHostSettings.json / ServerGameSettings.json) and, in
 * `arrays: 'expand'` mode, by Minecraft's player-list files (ops.json,
 * whitelist.json, allowlist.json) whose root is an array of records.
 */
import type { ConfigDoc, Format, FType } from './types';
import { escapeSegment, makeCodec, splitAddress } from './shared';

type J = any;

const isPlainObject = (v: J): v is Record<string, J> =>
    v !== null && typeof v === 'object' && !Array.isArray(v);

const isContainer = (v: J): boolean => isPlainObject(v) || Array.isArray(v);

/** A segment addresses an array slot only if it is a plain non-negative integer. */
const asIndex = (segment: string): number | undefined => {
    if (!/^\d+$/.test(segment)) return undefined;
    return Number(segment);
};

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

/**
 * Coerce a raw string back to a JSON value.
 *
 * Existing non-null values remain authoritative: generic field inference only
 * sees their raw text, so a JSON string such as `"123"` must not become a
 * number just because it looks numeric. A missing or null property has no
 * usable on-disk type, so a curated schema's optional hint supplies it.
 */
function coerce(raw: string, existing: J, typeHint?: FType): { ok: boolean; value: J } {
    if (existing === undefined || existing === null) {
        if (typeHint === 'bool') {
            const normalized = raw.trim().toLowerCase();
            if (normalized !== 'true' && normalized !== 'false') {
                return { ok: false, value: existing };
            }
            return { ok: true, value: normalized === 'true' };
        }
        if (typeHint === 'number') {
            const n = Number(raw);
            return { ok: Number.isFinite(n), value: Number.isFinite(n) ? n : existing };
        }
        return { ok: true, value: raw };
    }
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
    return { ok: true, value: raw }; // string
}

export interface JsonOptions {
    /**
     * How arrays are surfaced.
     *
     * `'leaf'` (the default) keeps an array a single raw JSON string - right for
     * V Rising, whose settings hold short literal lists that read better as one
     * field than as a group of numbered slots.
     *
     * `'expand'` recurses into arrays, addressing each element by index
     * (`0.name`), and accepts a top-level array as the document root. That is
     * what makes Minecraft's player lists editable at all - they have no root
     * object to hang dotted paths off.
     */
    arrays?: 'leaf' | 'expand';
}

export function makeJsonFormat(id: string, opts: JsonOptions = {}): Format {
    const codec = makeCodec({ boolTrue: 'true', boolFalse: 'false' });
    const expand = opts.arrays === 'expand';

    function parse(text: string): ConfigDoc | null {
        let root: J;
        try {
            root = JSON.parse(text);
        } catch {
            return null; // not JSON -> editor falls back to raw text
        }
        // A scalar root has nothing to address; an array root only works when
        // we are willing to walk into it.
        if (!(expand ? isContainer(root) : isPlainObject(root))) return null;

        const indent = detectIndent(text);
        const trailing = text.endsWith('\n') ? '\n' : '';

        /** Does this container hold `segment`? Arrays only accept in-range integer slots. */
        const holds = (node: J, segment: string): boolean => {
            if (Array.isArray(node)) {
                if (!expand) return false;
                const i = asIndex(segment);
                return i !== undefined && i < node.length;
            }
            return isPlainObject(node) && segment in node;
        };

        /** Resolve an address to [parentContainer, lastKey], or undefined if the path is broken. */
        const locate = (address: string): [J, string] | undefined => {
            const parts = splitAddress(address);
            let node: J = root;
            for (let i = 0; i < parts.length - 1; i++) {
                if (!holds(node, parts[i])) return undefined;
                node = node[parts[i]];
            }
            if (isPlainObject(node)) return [node, parts[parts.length - 1]];
            // An array parent can only be written through an existing slot; we
            // never grow a list from the config form.
            if (expand && Array.isArray(node) && holds(node, parts[parts.length - 1])) {
                return [node, parts[parts.length - 1]];
            }
            return undefined;
        };

        /** Should we descend into this value rather than treat it as a leaf? */
        const descend = (v: J): boolean => isPlainObject(v) || (expand && Array.isArray(v));

        const leaves = (): string[] => {
            const out: string[] = [];
            const walk = (node: J, prefix: string) => {
                const keys = Array.isArray(node) ? node.map((_, i) => String(i)) : Object.keys(node);
                for (const k of keys) {
                    const path = prefix ? `${prefix}.${escapeSegment(k)}` : escapeSegment(k);
                    if (descend(node[k])) walk(node[k], path);
                    else out.push(path);
                }
            };
            walk(root, '');
            return out;
        };

        /**
         * Display path for grouping. Index segments are bracketed (`[0].uuid`
         * groups under `[0]`) so a list of records reads as numbered entries
         * instead of keys that look like ordinary names.
         */
        const displayPath = (parts: string[]): string => {
            let node: J = root;
            let out = '';
            for (const part of parts) {
                if (Array.isArray(node) && asIndex(part) !== undefined) {
                    out += `[${part}]`;
                } else {
                    out += out ? `.${escapeSegment(part)}` : escapeSegment(part);
                }
                if (!isContainer(node) || !(part in node)) return parts.map(escapeSegment).join('.');
                node = node[part];
            }
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
            setRaw: (a, val, typeHint) => {
                const loc = locate(a);
                if (!loc) return false; // won't invent missing nested parents
                const existing = Object.prototype.hasOwnProperty.call(loc[0], loc[1])
                    ? loc[0][loc[1]]
                    : undefined;
                const result = coerce(val, existing, typeHint);
                if (!result.ok) return false;
                loc[0][loc[1]] = result.value;
                return true;
            },
            remove: (a) => {
                const loc = locate(a);
                if (!loc || !(loc[1] in loc[0])) return false;
                // `delete arr[i]` would leave a hole that re-serialises as null,
                // silently corrupting the list; close the gap instead.
                if (Array.isArray(loc[0])) loc[0].splice(Number(loc[1]), 1);
                else delete loc[0][loc[1]];
                return true;
            },
            sectionOf: (a) => {
                const parts = splitAddress(a);
                return parts.length <= 1 ? '' : displayPath(parts.slice(0, -1));
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

/** Default JSON format: objects only, arrays kept whole as raw JSON. */
export const jsonFormat = makeJsonFormat('json');

/** JSON format that walks into arrays and accepts an array root (Minecraft player lists). */
export const jsonListFormat = makeJsonFormat('json-list', { arrays: 'expand' });
