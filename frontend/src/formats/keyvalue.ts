/**
 * Flat `key=value` format - no sections. Covers Minecraft `server.properties`,
 * Terraria `serverconfig.txt`, TeamSpeak `ts3server.ini`, and similar
 * java-properties-style files.
 *
 * A line model preserves comments, blank lines, ordering, and untouched keys
 * verbatim; only the value of an edited key is rewritten. The line separator
 * (`\n` vs `\r\n`) is detected and preserved.
 */
import type { ConfigDoc, Format } from './types';
import { makeCodec, type CodecOptions } from './shared';

const COMMENT = /^\s*[#!;]/;
const KV = /^\s*([^=\s][^=]*?)\s*=(.*)$/;
/**
 * Splits an entry into everything up to and including `=` (plus any padding
 * after it) and the value. Editing rewrites only the second half, so a file
 * written `ServerName = 'x'` keeps its spacing instead of collapsing to
 * `ServerName='x'` - which matters for parsers that are strict about it.
 */
const SPLIT = /^([^=]*=[ \t]*)([\s\S]*)$/;

export interface KeyValueOptions {
    /** Codec overrides - e.g. Minecraft/Terraria use lowercase true/false. */
    codec?: Partial<CodecOptions>;
}

export function makeKeyValueFormat(id: string, opts: KeyValueOptions = {}): Format {
    const codec = makeCodec({ boolTrue: 'true', boolFalse: 'false', ...opts.codec });

    function parse(text: string): ConfigDoc | null {
        const nl = text.includes('\r\n') ? '\r\n' : '\n';
        const lines = text.split(/\r?\n/).map((t) => ({ text: t, key: undefined as string | undefined }));
        const idx: Record<string, number> = {};
        const order: string[] = [];
        let kvCount = 0;

        lines.forEach((line, i) => {
            if (COMMENT.test(line.text) || line.text.trim() === '') return;
            const m = line.text.match(KV);
            if (!m) return;
            const key = m[1].trim();
            line.key = key;
            if (!(key in idx)) order.push(key);
            idx[key] = i; // last occurrence is the one we edit
            kvCount++;
        });
        if (kvCount === 0) return null; // doesn't look like a key=value file

        const reindex = () => {
            for (const k of Object.keys(idx)) delete idx[k];
            lines.forEach((l, i) => {
                if (l.key !== undefined) idx[l.key] = i;
            });
        };

        return {
            keys: () => order,
            has: (a) => a in idx,
            getRaw: (a) => {
                const i = idx[a];
                if (i === undefined) return undefined;
                const m = lines[i].text.match(SPLIT);
                return m ? m[2] : undefined;
            },
            setRaw: (a, val) => {
                const i = idx[a];
                if (i === undefined) {
                    order.push(a);
                    idx[a] = lines.push({ text: `${a}=${val}`, key: a }) - 1;
                } else {
                    // Keep the line's own prefix (indentation, key spelling, and
                    // the padding around `=`); replace only the value.
                    const m = lines[i].text.match(SPLIT);
                    lines[i] = { text: (m ? m[1] : `${a}=`) + val, key: a };
                }
                return true;
            },
            remove: (a) => {
                const i = idx[a];
                if (i === undefined) return false;
                lines.splice(i, 1);
                const oi = order.indexOf(a);
                if (oi >= 0) order.splice(oi, 1);
                reindex();
                return true;
            },
            sectionOf: () => '',
            labelOf: (a) => a,
            serialize: () => lines.map((l) => l.text).join(nl),
        };
    }

    return { id, codec, parse };
}

/** Default flat key=value format (lowercase booleans). */
export const keyvalueFormat = makeKeyValueFormat('keyvalue');
