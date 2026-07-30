/**
 * Arma 2 / 2 OA / 3 server config - `key = value;` per line, C-style comments.
 *
 *     hostname = "My Server";
 *     password = "";
 *     maxPlayers = 40;
 *     verifySignatures = 2;
 *     admins[] = {"76561198000000000"};
 *     motd[] = {"line one","line two"};
 *
 * Strings are double-quoted, booleans are written 1/0, and array keys carry a
 * literal `[]` suffix which is kept as part of the address so `admins` and
 * `admins[]` could never collide. Arrays are exposed as their raw `{...}` text -
 * there is no attempt to model list editing.
 *
 * Only single-line assignments are addressable. `class Missions { ... };` blocks
 * and arrays broken across lines are left exactly as found, which is the safe
 * outcome: Arma's mission and difficulty blocks are structured data that a line
 * model has no business rewriting.
 *
 * Note Arma has no default config filename - the server reads whatever `-config`
 * points at - so the registry's path is a convention, not a guarantee.
 */
import type { ConfigDoc, Format } from './types';
import { makeCodec } from './shared';

const quoteArma = (v: string) => `"${v.replace(/"/g, '""')}"`;
const unquoteArma = (raw: string) => {
    const m = raw.match(/^"([\s\S]*)"$/);
    return m ? m[1].replace(/""/g, '"') : raw;
};

const codec = makeCodec({
    boolTrue: '1',
    boolFalse: '0',
    isTruthy: (raw) => {
        const s = raw.trim();
        return s !== '0' && s !== '' && s.toLowerCase() !== 'false';
    },
    quoteText: quoteArma,
    unquoteText: unquoteArma,
});

// key = value;   with optional [] on the key. Value must not span lines, and a
// trailing `//` comment after the semicolon is left alone.
const ASSIGN = /^(\s*)([A-Za-z_][A-Za-z0-9_]*(?:\[\])?)(\s*=\s*)([^;]*);(.*)$/;
const COMMENT = /^\s*(\/\/|\/\*|\*)/;

/** Strip comments and count structural braces while carrying block-comment state across lines. */
function scanStructure(line: string, inBlockComment: boolean): { code: string; delta: number; inBlockComment: boolean } {
    let code = '';
    let delta = 0;
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (inBlockComment) {
            if (c === '*' && line[i + 1] === '/') {
                inBlockComment = false;
                i++;
            }
            continue;
        }
        if (c === '"') {
            // Arma escapes a quote inside a string by doubling it.
            if (quoted && line[i + 1] === '"') {
                code += '""';
                i++;
                continue;
            }
            quoted = !quoted;
            code += c;
            continue;
        }
        if (quoted) {
            code += c;
            continue;
        }
        if (c === '/' && line[i + 1] === '/') break;
        if (c === '/' && line[i + 1] === '*') {
            inBlockComment = true;
            i++;
            continue;
        }
        code += c;
        if (c === '{') delta++;
        else if (c === '}') delta--;
    }
    return { code, delta, inBlockComment };
}

function parse(text: string): ConfigDoc | null {
    const nl = text.includes('\r\n') ? '\r\n' : '\n';
    const lines = text.split(/\r?\n/);
    const idx: Record<string, number> = {};
    const order: string[] = [];

    const entry = (line: string) => (COMMENT.test(line) ? null : ASSIGN.exec(line));

    const reindex = () => {
        for (const k of Object.keys(idx)) delete idx[k];
        order.length = 0;
        let depth = 0;
        let inBlockComment = false;
        lines.forEach((line, i) => {
            const scan = scanStructure(line, inBlockComment);
            inBlockComment = scan.inBlockComment;
            const m = depth === 0 ? ASSIGN.exec(scan.code) : null;
            if (m) {
                const key = m[2];
                if (!(key in idx)) order.push(key);
                idx[key] = i;
            }
            depth = Math.max(0, depth + scan.delta);
        });
    };
    reindex();
    if (order.length === 0) return null; // no assignments -> not an Arma config

    return {
        keys: () => order,
        has: (a) => a in idx,
        getRaw: (a) => {
            const i = idx[a];
            if (i === undefined) return undefined;
            const m = entry(lines[i]);
            return m ? m[4].trim() : undefined;
        },
        setRaw: (a, val) => {
            const i = idx[a];
            if (i === undefined) {
                order.push(a);
                idx[a] = lines.push(`${a} = ${val};`) - 1;
                return true;
            }
            const m = entry(lines[i]);
            if (!m) return false;
            // Keep indentation, the key's spelling, the spacing around `=` and
            // anything trailing the semicolon; replace only the value.
            lines[i] = `${m[1]}${m[2]}${m[3]}${val};${m[5]}`;
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
        serialize: () => lines.join(nl),
    };
}

export const armaFormat: Format = { id: 'arma', codec, parse };
