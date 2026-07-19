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
                const m = lines[i].text.match(KV);
                return m ? m[2] : undefined;
            },
            setRaw: (a, val) => {
                const i = idx[a];
                if (i === undefined) {
                    order.push(a);
                    idx[a] = lines.push({ text: `${a}=${val}`, key: a }) - 1;
                } else {
                    lines[i] = { text: `${a}=${val}`, key: a };
                }
            },
            remove: (a) => {
                const i = idx[a];
                if (i === undefined) return;
                lines.splice(i, 1);
                const oi = order.indexOf(a);
                if (oi >= 0) order.splice(oi, 1);
                reindex();
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
