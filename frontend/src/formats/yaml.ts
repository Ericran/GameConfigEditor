/**
 * YAML format for the Bukkit/Spigot/Paper config family (`bukkit.yml`,
 * `spigot.yml`, `config/paper-global.yml`).
 *
 * This is deliberately NOT a general YAML implementation. Those files are
 * block-style mappings of scalars, heavily commented, and the comments are the
 * documentation - a real YAML round-trip (parse to a tree, dump it back) throws
 * every one of them away and reorders the file. So, like the other formats
 * here, this is a LINE MODEL: lines are classified, nested keys get a dotted
 * address, and only the value half of an edited line is ever rewritten.
 * Everything else - comments (including inline ones), blank lines, ordering,
 * indentation, quoting style - comes back byte for byte.
 *
 * What it addresses: block-mapping scalar leaves, at any depth
 * (`world-settings.default.view-distance`), plus keys whose value is empty or a
 * flow collection (`overrides: {}`).
 *
 * What it deliberately does not: sequences (`- item`) and block scalars
 * (`key: |`) are left alone entirely - neither the sequence nor its parent key
 * is offered as a field, so there is no way to overwrite a list with a scalar.
 * They still round-trip untouched. Anchors, aliases, and multi-document files
 * are likewise passed through as plain lines; none of the three configs uses
 * them.
 */
import type { ConfigDoc, Format } from './types';
import {
    escapeSegment,
    makeCodec,
    orderedTable,
    splitAddress,
    splitLines,
    type CodecOptions,
} from './shared';

const BLANK = /^\s*$/;
const COMMENT = /^\s*#/;
/** A sequence entry: `- value`, or a bare `-` opening a nested block. */
const SEQ = /^(\s*)-(\s|$)/;
/**
 * A block-mapping entry. The key is a double-quoted, single-quoted, or plain
 * scalar; a plain key cannot contain `:` (YAML says so), which is what lets the
 * lazy match stop at the right colon in `motd: Hello: there`.
 */
const MAP = /^(\s*)("(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[^\s#][^:]*?)\s*:(?:\s+(.*)|\s*)$/;
/** `|`, `>`, `|-`, `>2+` ... - a block scalar header, whose value is the lines below. */
const BLOCK_SCALAR = /^[|>][-+]?\d*$/;

/**
 * Split a value into the value proper and its trailing comment/whitespace.
 *
 * In YAML a `#` only starts a comment when it follows whitespace (or opens the
 * value), so `motd: red#5` is the string `red#5` while `motd: red # 5` is `red`
 * plus a comment. Quoted regions are skipped so a `#` inside a string stays put.
 * The whitespace before the `#` goes with the comment, so rewriting the value
 * keeps the file's own column alignment.
 */
export function splitComment(text: string): { value: string; comment: string } {
    let inSingle = false;
    let inDouble = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (inSingle) {
            if (c === "'") inSingle = false;
            continue;
        }
        if (inDouble) {
            if (c === '\\') i++;
            else if (c === '"') inDouble = false;
            continue;
        }
        if (c === "'") inSingle = true;
        else if (c === '"') inDouble = true;
        else if (c === '#' && (i === 0 || /\s/.test(text[i - 1]))) {
            let start = i;
            while (start > 0 && /\s/.test(text[start - 1])) start--;
            return { value: text.slice(0, start), comment: text.slice(start) };
        }
    }
    const trailing = text.match(/\s+$/);
    return { value: trailing ? text.slice(0, -trailing[0].length) : text, comment: trailing?.[0] ?? '' };
}

/** Strip the quotes YAML puts around a scalar, undoing that style's escaping. */
export function unquoteScalar(raw: string): string {
    const s = raw.trim();
    const single = s.match(/^'([\s\S]*)'$/);
    if (single) return single[1].replace(/''/g, "'");
    const double = s.match(/^"([\s\S]*)"$/);
    if (double) return double[1].replace(/\\(["\\/])/g, '$1').replace(/\\n/g, '\n').replace(/\\t/g, '\t');
    return s;
}

/**
 * A plain scalar that would parse as something other than the text the user
 * typed - a bool, a number, null, or a value whose punctuation changes the
 * structure - has to be quoted. Everything else is written bare, so a config
 * edited here still looks hand-written.
 */
const NEEDS_QUOTE =
    /^$|^\s|\s$|^[-?:,[\]{}#&*!|>'"%@`]|:(\s|$)|\s#|^(true|false|yes|no|on|off|y|n|null|~)$|^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$|^0[xob]/i;

export function quoteScalar(v: string): string {
    return NEEDS_QUOTE.test(v) ? `'${v.replace(/'/g, "''")}'` : v;
}

/**
 * SnakeYAML (what Bukkit and Spigot parse with) is YAML 1.1, so `yes`/`no` and
 * `on`/`off` are booleans too. Read all of them; always write the canonical
 * `true`/`false`.
 */
const YAML_CODEC: CodecOptions = {
    boolTrue: 'true',
    boolFalse: 'false',
    isTruthy: (raw) => /^(true|yes|on|y)$/i.test(unquoteScalar(raw)),
    quoteText: quoteScalar,
    unquoteText: unquoteScalar,
};

/** One physical line, classified. `text` stays authoritative for serialisation. */
interface Line {
    text: string;
    indent: number;
    kind: 'map' | 'seq' | 'other';
    /** Key as written, quotes and all; the logical key is its unquoted form. */
    keyRaw?: string;
    /** Dotted address; set on mapping lines that are not inside a sequence. */
    path?: string;
    /** Holds a scalar we can edit (as opposed to opening a nested block). */
    leaf?: boolean;
    /** Everything up to the start of the value - indent, key, colon, padding. */
    prefix?: string;
    value?: string;
    /** Trailing comment and the whitespace in front of it. */
    comment?: string;
}

export function makeYamlFormat(id: string): Format {
    const codec = makeCodec(YAML_CODEC);

    function parse(text: string): ConfigDoc | null {
        const { lines: rawLines, nl } = splitLines(text);
        let lines: Line[] = [];
        const table = orderedTable<number>();

        /** Index of the next line that participates in the structure, or -1. */
        const nextContent = (from: number): number => {
            for (let i = from; i < lines.length; i++) {
                if (lines[i].kind !== 'other') return i;
            }
            return -1;
        };

        function classify(texts: string[]) {
            lines = texts.map((t): Line => {
                if (BLANK.test(t) || COMMENT.test(t)) return { text: t, indent: 0, kind: 'other' };
                const seq = t.match(SEQ);
                if (seq) return { text: t, indent: seq[1].length, kind: 'seq' };
                const m = t.match(MAP);
                if (!m) return { text: t, indent: 0, kind: 'other' };
                const rest = m[3] ?? '';
                const { value, comment } = splitComment(rest);
                return {
                    text: t,
                    indent: m[1].length,
                    kind: 'map',
                    keyRaw: m[2],
                    prefix: t.slice(0, t.length - rest.length),
                    value,
                    comment,
                };
            });
        }

        /**
         * Walk the classified lines once, assigning each mapping line its dotted
         * address and deciding whether it holds a value or opens a block.
         *
         * A mapping line inside a sequence is skipped: its address would be a
         * lie (there is no key path to a list element), and leaving it
         * unaddressed means we can never write to it either.
         */
        function index() {
            table.clear();
            const stack: { indent: number; key: string }[] = [];
            /**
             * Indent of the innermost region we must not look inside: a sequence
             * (list entries have no key path) or a block scalar (its body is
             * literal text that can easily contain something colon-shaped).
             * Anything more-indented than this belongs to that region.
             */
            let opaqueIndent: number | null = null;

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                line.path = undefined;
                line.leaf = false;
                if (line.kind === 'other') continue;

                if (opaqueIndent !== null && line.indent > opaqueIndent) continue;
                opaqueIndent = null;
                if (line.kind === 'seq') {
                    opaqueIndent = line.indent;
                    continue;
                }

                while (stack.length && stack[stack.length - 1].indent >= line.indent) stack.pop();

                const key = unquoteScalar(line.keyRaw!);
                const path = [...stack.map((s) => escapeSegment(s.key)), escapeSegment(key)].join('.');
                line.path = path;

                if (line.value !== '') {
                    // `key: |` - the value is the indented block underneath, so
                    // neither the key nor its body is ours to edit.
                    if (BLOCK_SCALAR.test(line.value!)) {
                        opaqueIndent = line.indent;
                        continue;
                    }
                    line.leaf = true; // an ordinary `key: value`
                } else {
                    // Empty value: a block opener if what follows is nested under
                    // it (a deeper mapping, or a sequence at this level or below).
                    const j = nextContent(i + 1);
                    const child = j === -1 ? null : lines[j];
                    if (child && child.kind === 'map' && child.indent > line.indent) {
                        stack.push({ indent: line.indent, key });
                        continue;
                    }
                    if (child && child.kind === 'seq' && child.indent >= line.indent) continue;
                    line.leaf = true; // genuinely empty scalar - editable
                }

                table.set(path, i);
            }
        }

        /**
         * Re-derive the whole model from the current line texts. Structural
         * edits (insert, remove) shift every path after them, and a line we just
         * spliced in has not been classified at all, so both go through here
         * rather than trying to patch the index in place.
         */
        const reindex = () => {
            classify(lines.map((l) => l.text));
            index();
        };

        classify(rawLines);
        index();
        if (table.empty) return null; // doesn't look like a YAML mapping

        /**
         * Rebuild a leaf line around a new value, keeping its prefix and comment.
         *
         * The separators need a nudge for a key that had no value to begin with:
         * `foo:` parses with an empty value and a prefix of exactly `foo:`, and
         * `foo:bar` is one scalar, not a mapping. Same for a comment that was
         * sitting directly against the colon.
         */
        const write = (i: number, val: string) => {
            const line = lines[i];
            if (!/\s$/.test(line.prefix ?? '')) line.prefix = `${line.prefix ?? ''} `;
            if (line.comment && !/^\s/.test(line.comment)) line.comment = ` ${line.comment}`;
            line.value = val;
            const rebuilt = `${line.prefix}${val}${line.comment ?? ''}`;
            // An empty value would otherwise leave the line padded with a space.
            line.text = val === '' && !line.comment ? rebuilt.replace(/\s+$/, '') : rebuilt;
        };

        /**
         * Create a key the file does not have yet, inside its parent's block.
         *
         * Only ever appends to a block that already exists - we do not invent
         * intermediate mappings, because guessing where a two-level-deep section
         * should go is how a config gets silently restructured.
         */
        const insert = (address: string, val: string): boolean => {
            const parts = splitAddress(address);
            const leafKey = parts[parts.length - 1];
            const parentPath = parts.slice(0, -1).map(escapeSegment).join('.');

            let parentLine = -1;
            if (parentPath !== '') {
                parentLine = lines.findIndex((l) => l.kind === 'map' && !l.leaf && l.path === parentPath);
                if (parentLine === -1) return false;
            }

            const root = parentLine === -1;
            const parentIndent = root ? -1 : lines[parentLine].indent;
            // Match the siblings' indentation where there are any; two spaces is
            // the house style of all three configs otherwise.
            let childIndent = root ? 0 : parentIndent + 2;
            let end = parentLine; // last line of the block, walked forward below
            let first = true;
            for (let i = parentLine + 1; i < lines.length; i++) {
                const l = lines[i];
                if (l.kind === 'other') continue;
                if (!root && l.indent <= parentIndent) break;
                if (first && !root) {
                    childIndent = l.indent;
                    first = false;
                }
                end = i;
            }
            // Blank lines and comments after the block's last entry introduce
            // whatever comes next, so insert above them.
            const at = end + 1;

            lines.splice(at, 0, {
                text: `${' '.repeat(Math.max(0, childIndent))}${quoteScalar(leafKey)}: ${val}`,
                indent: Math.max(0, childIndent),
                kind: 'map',
            });
            reindex();
            return table.has(address);
        };

        return {
            keys: () => table.keys(),
            has: (a) => table.has(a),
            getRaw: (a) => {
                const i = table.get(a);
                return i === undefined ? undefined : lines[i].value;
            },
            setRaw: (a, val) => {
                const i = table.get(a);
                if (i === undefined) return insert(a, val);
                write(i, val);
                return true;
            },
            remove: (a) => {
                const i = table.get(a);
                if (i === undefined) return false;
                lines.splice(i, 1);
                reindex();
                return true;
            },
            sectionOf: (a) => {
                const parts = splitAddress(a);
                return parts.length <= 1 ? '' : parts.slice(0, -1).map(escapeSegment).join('.');
            },
            labelOf: (a) => {
                const parts = splitAddress(a);
                return parts[parts.length - 1] ?? a;
            },
            serialize: () => lines.map((l) => l.text).join(nl),
        };
    }

    return { id, codec, parse };
}

/** Default YAML format (Bukkit / Spigot / Paper). */
export const yamlFormat = makeYamlFormat('yaml');
