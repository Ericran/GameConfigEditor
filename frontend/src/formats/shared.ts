/**
 * Shared building blocks for Format implementations: a configurable Codec
 * factory and the address encoding for sectioned documents.
 */
import type { Codec, ConfigValue, FType } from './types';

export interface CodecOptions {
    /** Raw spelling of boolean true / false for this format. */
    boolTrue: string;
    boolFalse: string;
    /** Recognise a truthy raw value (defaults to matching boolTrue, case-insensitively). */
    isTruthy?: (raw: string) => boolean;
    /** Store a text field's value (e.g. wrap in quotes). Identity by default. */
    quoteText?: (v: string) => string;
    /** Read a text field's value back (e.g. strip quotes). Identity by default. */
    unquoteText?: (raw: string) => string;
}

/**
 * Build a Codec. Number handling is universal (`Number()` / `String()`);
 * boolean and text spellings vary by format and are supplied here. `select`
 * and `raw` pass through verbatim.
 */
export function makeCodec(opts: CodecOptions): Codec {
    const isTruthy =
        opts.isTruthy ?? ((raw: string) => raw.trim().toLowerCase() === opts.boolTrue.toLowerCase());
    const quoteText = opts.quoteText ?? ((v: string) => v);
    const unquoteText = opts.unquoteText ?? ((raw: string) => raw);

    return {
        fromRaw(raw: string | undefined, type: FType): ConfigValue {
            if (raw === undefined) {
                if (type === 'bool') return false;
                if (type === 'number') return 0;
                return '';
            }
            switch (type) {
                case 'bool':
                    return isTruthy(raw);
                case 'number': {
                    const num = Number(raw);
                    return Number.isNaN(num) ? raw : num;
                }
                case 'text':
                    return unquoteText(raw);
                case 'select':
                    return raw.trim();
                default: // 'raw'
                    return raw;
            }
        },
        toRaw(v: ConfigValue, type: FType): string {
            switch (type) {
                case 'bool':
                    return v ? opts.boolTrue : opts.boolFalse;
                case 'number':
                    return String(v);
                case 'text':
                    return quoteText(String(v));
                default: // 'select' | 'raw'
                    return String(v);
            }
        },
    };
}

/**
 * Split a document into lines, remembering its newline style.
 *
 * Every line-based parser has to round-trip CRLF exactly: a Windows-authored
 * config that comes back with bare LF is a diff on every line, and some servers
 * won't read it back. Detect once here, rejoin with the same string.
 */
export function splitLines(text: string): { lines: string[]; nl: string } {
    return { lines: text.split(/\r?\n/), nl: text.includes('\r\n') ? '\r\n' : '\n' };
}

/**
 * The address table every parser builds while scanning a document: first-seen
 * order for display, and a lookup that resolves to the LAST occurrence of a
 * repeated key - the one the game itself reads, so the one we must edit.
 *
 * `V` is whatever an address resolves to: a line index for most formats, a
 * located assignment for Arma. `normalize` folds addresses for formats whose
 * keys are case-insensitive (Unreal/ARK INI); display order keeps the file's
 * own spelling.
 *
 * The backing map is prototype-less on purpose. With a plain object literal,
 * `'constructor' in idx` is true for every document, so a config with a key
 * named `constructor` or `toString` resolved to an inherited function and blew
 * up the lookup that followed.
 */
export interface OrderedTable<V> {
    clear(): void;
    set(address: string, value: V): void;
    get(address: string): V | undefined;
    has(address: string): boolean;
    /** First-seen order, in the file's own spelling. Live array, not a copy. */
    keys(): string[];
    readonly empty: boolean;
}

export function orderedTable<V>(normalize: (address: string) => string = (a) => a): OrderedTable<V> {
    let idx: Record<string, V> = Object.create(null);
    const order: string[] = [];
    return {
        clear() {
            idx = Object.create(null);
            order.length = 0;
        },
        set(address, value) {
            const na = normalize(address);
            if (!(na in idx)) order.push(address);
            idx[na] = value;
        },
        get: (address) => idx[normalize(address)],
        has: (address) => normalize(address) in idx,
        keys: () => order,
        get empty() {
            return order.length === 0;
        },
    };
}

/**
 * Dotted-path addressing for nested formats (JSON, YAML). A path segment may
 * itself contain a dot, so segments are escaped going in and the split honours
 * the escape - `a\.b.c` is two segments, not three.
 */
export const escapeSegment = (segment: string): string =>
    segment.replace(/\\/g, '\\\\').replace(/\./g, '\\.');

export function splitAddress(address: string): string[] {
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

/** Backslash-escaped quote helpers for idTech/Unreal-style strings. */
export const quoteDouble = (v: string) => `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
export const unquoteDouble = (raw: string) => {
    const m = raw.match(/^"([\s\S]*)"$/);
    return m ? m[1].replace(/\\(["\\])/g, '$1') : raw;
};

/**
 * Address encoding for sectioned formats. A flat format uses the bare key as
 * its address; a sectioned format encodes `section` + `key` into one opaque
 * string with a NUL separator (which can't occur in a real key), so the editor
 * can treat every address uniformly. Written as the `\0` escape rather than a
 * literal NUL byte so this stays a text file (git treats an embedded NUL as
 * binary and stops producing diffs for it).
 */
const SEP = '\0';
export const addr = (section: string, key: string): string => (section ? section + SEP + key : key);
export const addrSection = (address: string): string => {
    const i = address.indexOf(SEP);
    return i === -1 ? '' : address.slice(0, i);
};
export const addrKey = (address: string): string => {
    const i = address.indexOf(SEP);
    return i === -1 ? address : address.slice(i + 1);
};
