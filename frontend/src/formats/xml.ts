/**
 * XML configs, handled as a line model rather than through a DOM.
 *
 * A real XML parse-and-reserialise would reformat the whole document; these
 * files are hand-edited and full of explanatory comments, so we scan for the one
 * line holding an entry and rewrite just its value. Anything not recognised -
 * the declaration, comments, nested blocks, entries split across lines - is
 * preserved byte for byte and simply isn't addressable.
 *
 * Two shapes are covered, because the two games that need this disagree:
 *
 *   'attribute'  7 Days to Die serverconfig.xml
 *                <property name="ServerName" value="My Server" />
 *                addressed by the name attribute, value lives in an attribute
 *
 *   'element'    MTA mtaserver.conf
 *                <serverport>22003</serverport>
 *                addressed by tag name, value is the element's text
 *
 * Values are XML-escaped on write and unescaped on read, so a server name with
 * an ampersand round-trips instead of corrupting the document.
 */
import type { ConfigDoc, Format } from './types';
import { makeCodec, type CodecOptions } from './shared';

const ENTITIES: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&apos;': "'",
};

export const unescapeXml = (s: string): string =>
    s.replace(/&(amp|lt|gt|quot|apos);/g, (m) => ENTITIES[m] ?? m);

/** Escape for use inside an attribute value or element text. */
export const escapeXml = (s: string): string =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export type XmlShape = 'attribute' | 'element';

export interface XmlOptions {
    shape: XmlShape;
    /** attribute shape: the entry tag, e.g. `property`. */
    tag?: string;
    /** attribute shape: attribute holding the address, e.g. `name`. */
    keyAttr?: string;
    /** attribute shape: attribute holding the value, e.g. `value`. */
    valueAttr?: string;
    codec?: Partial<CodecOptions>;
}

/** Locate `attr="..."` (or `attr='...'`) inside a tag's attribute text. */
function findAttr(attrs: string, name: string): { value: string; start: number; end: number } | null {
    const re = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i');
    const m = re.exec(attrs);
    if (!m) return null;
    const raw = m[2] !== undefined ? m[2] : (m[3] ?? '');
    // Offsets of the quoted contents, relative to `attrs`.
    const quoteOpen = m.index + m[0].length - m[1].length + 1;
    return { value: raw, start: quoteOpen, end: quoteOpen + raw.length };
}

export function makeXmlFormat(id: string, opts: XmlOptions): Format {
    const codec = makeCodec({ boolTrue: 'true', boolFalse: 'false', ...opts.codec });
    const tag = opts.tag ?? 'property';
    const keyAttr = opts.keyAttr ?? 'name';
    const valueAttr = opts.valueAttr ?? 'value';

    // <tag ...attrs.../> or <tag ...attrs...>
    const attrTagRe = new RegExp(`<${tag}\\b([^>]*?)(/?)>`, 'i');
    // <name>text</name> on one line, text containing no markup.
    const elemRe = /^(\s*)<([A-Za-z_][\w.:-]*)(\s[^>]*)?>([^<]*)<\/\2>(\s*)$/;

    function parse(text: string): ConfigDoc | null {
        const nl = text.includes('\r\n') ? '\r\n' : '\n';
        const lines = text.split(/\r?\n/);
        const idx: Record<string, number> = {};
        const order: string[] = [];

        const reindex = () => {
            for (const k of Object.keys(idx)) delete idx[k];
            order.length = 0;
            lines.forEach((line, i) => {
                const key = keyOf(line);
                if (key === undefined) return;
                if (!(key in idx)) order.push(key);
                idx[key] = i; // last occurrence is the editable one
            });
        };

        function keyOf(line: string): string | undefined {
            if (/^\s*<!--/.test(line)) return undefined;
            if (opts.shape === 'attribute') {
                const m = attrTagRe.exec(line);
                if (!m) return undefined;
                const k = findAttr(m[1], keyAttr);
                const v = findAttr(m[1], valueAttr);
                return k && v ? k.value : undefined;
            }
            const m = elemRe.exec(line);
            return m ? m[2] : undefined;
        }

        function rawOf(line: string): string | undefined {
            if (opts.shape === 'attribute') {
                const m = attrTagRe.exec(line);
                if (!m) return undefined;
                const v = findAttr(m[1], valueAttr);
                return v ? unescapeXml(v.value) : undefined;
            }
            const m = elemRe.exec(line);
            return m ? unescapeXml(m[4]) : undefined;
        }

        /** Rewrite just the value portion of an entry line. */
        function withValue(line: string, val: string): string {
            const escaped = escapeXml(val);
            if (opts.shape === 'attribute') {
                const m = attrTagRe.exec(line);
                if (!m) return line;
                const attrsStart = m.index + m[0].indexOf(m[1], 1);
                const v = findAttr(m[1], valueAttr);
                if (!v) return line;
                return (
                    line.slice(0, attrsStart + v.start) + escaped + line.slice(attrsStart + v.end)
                );
            }
            const m = elemRe.exec(line);
            if (!m) return line;
            const open = `${m[1]}<${m[2]}${m[3] ?? ''}>`;
            return `${open}${escaped}</${m[2]}>${m[5]}`;
        }

        reindex();
        if (order.length === 0) return null; // nothing addressable -> not our shape

        return {
            keys: () => order,
            has: (a) => a in idx,
            getRaw: (a) => {
                const i = idx[a];
                return i === undefined ? undefined : rawOf(lines[i]);
            },
            setRaw: (a, val) => {
                const i = idx[a];
                // Deliberately does not invent new entries: where a new node
                // belongs in an XML tree is not something a line model can know,
                // and guessing would risk writing it outside the root element.
                if (i === undefined) return false;
                lines[i] = withValue(lines[i], val);
                return true;
            },
            remove: (a) => {
                const i = idx[a];
                if (i === undefined) return false;
                lines.splice(i, 1);
                reindex();
                return true;
            },
            sectionOf: () => '',
            labelOf: (a) => a,
            serialize: () => lines.join(nl),
        };
    }

    return { id, codec, parse };
}

/** 7 Days to Die `serverconfig.xml` - `<property name=".." value=".." />`. */
export const propertyXmlFormat = makeXmlFormat('xml-property', {
    shape: 'attribute',
    tag: 'property',
    keyAttr: 'name',
    valueAttr: 'value',
});

/** MTA `mtaserver.conf` - values are element text. */
export const elementXmlFormat = makeXmlFormat('xml-element', { shape: 'element' });
