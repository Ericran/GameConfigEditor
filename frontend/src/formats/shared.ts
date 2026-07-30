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
