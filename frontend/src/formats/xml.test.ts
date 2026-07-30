/**
 * XML format tests. The point of this format is that it edits one value in place
 * and leaves the rest of the document alone, so most of these assert on exact
 * bytes rather than on a reparsed structure.
 */
import { describe, expect, it } from 'vitest';
import { elementXmlFormat, escapeXml, propertyXmlFormat, unescapeXml } from './xml';

const SDTD = [
    '<?xml version="1.0"?>',
    '<ServerSettings>',
    '  <!-- GENERAL SERVER SETTINGS -->',
    '  <property name="ServerName" value="My Game Host" />',
    '  <property name="ServerDescription" value="A 7 Days to Die server" />',
    '  <property name="ServerPassword" value="" />',
    '  <property name="ServerMaxPlayerCount" value="8" />',
    '  <property name="GameDifficulty" value="1" />',
    '  <property name="EnemySpawnMode"   value="3"   />',
    '  <!-- <property name="Commented" value="ignored" /> -->',
    '</ServerSettings>',
    '',
].join('\n');

const MTA = [
    '<config>',
    '  <servername>My MTA Server</servername>',
    '  <serverport>22003</serverport>',
    '  <httpport>22005</httpport>',
    '  <maxplayers>32</maxplayers>',
    '  <ase>1</ase>',
    '  <scriptdebuglogfile>logs/scripts.log</scriptdebuglogfile>',
    '  <module src="ml_sockets.so" />',
    '  <resource src="admin" startup="1" protected="0" />',
    '  <resource src="webadmin" startup="1" protected="0" />',
    '</config>',
    '',
].join('\n');

describe('escaping helpers', () => {
    it('round-trips the five predefined entities', () => {
        const raw = `a & b < c > d " e ' f`;
        expect(unescapeXml(escapeXml(raw))).toBe(raw);
    });

    it('escapes what would break an attribute', () => {
        expect(escapeXml('Tom & Jerry')).toBe('Tom &amp; Jerry');
        expect(escapeXml('a<b>c')).toBe('a&lt;b&gt;c');
        expect(escapeXml('say "hi"')).toBe('say &quot;hi&quot;');
    });

    it('leaves unknown entities alone when unescaping', () => {
        expect(unescapeXml('&nbsp;')).toBe('&nbsp;');
        expect(unescapeXml('&amp;nbsp;')).toBe('&nbsp;');
    });
});

describe('property-shaped XML (7 Days to Die)', () => {
    it('round-trips an untouched file byte-for-byte', () => {
        const doc = propertyXmlFormat.parse(SDTD)!;
        expect(doc).not.toBeNull();
        expect(doc.serialize()).toBe(SDTD);
    });

    it('addresses entries by their name attribute, ignoring commented-out ones', () => {
        const doc = propertyXmlFormat.parse(SDTD)!;
        expect(doc.keys()).toEqual([
            'ServerName',
            'ServerDescription',
            'ServerPassword',
            'ServerMaxPlayerCount',
            'GameDifficulty',
            'EnemySpawnMode',
        ]);
        expect(doc.has('Commented')).toBe(false);
    });

    it('reads the value attribute', () => {
        const doc = propertyXmlFormat.parse(SDTD)!;
        expect(doc.getRaw('ServerName')).toBe('My Game Host');
        expect(doc.getRaw('ServerPassword')).toBe('');
        expect(doc.getRaw('ServerMaxPlayerCount')).toBe('8');
        expect(doc.getRaw('nope')).toBeUndefined();
    });

    it('rewrites only the value, touching exactly one line', () => {
        const doc = propertyXmlFormat.parse(SDTD)!;
        doc.setRaw('ServerMaxPlayerCount', '16');
        const out = doc.serialize();
        expect(out).toContain('<property name="ServerMaxPlayerCount" value="16" />');
        const before = SDTD.split('\n');
        const after = out.split('\n');
        expect(after.filter((l, i) => l !== before[i])).toHaveLength(1);
    });

    it('preserves odd attribute spacing on the edited line', () => {
        const doc = propertyXmlFormat.parse(SDTD)!;
        doc.setRaw('EnemySpawnMode', '5');
        expect(doc.serialize()).toContain('<property name="EnemySpawnMode"   value="5"   />');
    });

    it('escapes a value that would otherwise break the document', () => {
        const doc = propertyXmlFormat.parse(SDTD)!;
        doc.setRaw('ServerName', 'Tom & Jerry <best> "server"');
        const out = doc.serialize();
        expect(out).toContain('value="Tom &amp; Jerry &lt;best&gt; &quot;server&quot;"');
        // and reads back as written
        expect(propertyXmlFormat.parse(out)!.getRaw('ServerName')).toBe('Tom & Jerry <best> "server"');
    });

    it('writes into an empty value', () => {
        const doc = propertyXmlFormat.parse(SDTD)!;
        doc.setRaw('ServerPassword', 'hunter2');
        expect(doc.serialize()).toContain('<property name="ServerPassword" value="hunter2" />');
    });

    it('handles single-quoted attributes and reversed attribute order', () => {
        const text = `<ServerSettings>\n  <property value='old' name='Thing' />\n</ServerSettings>\n`;
        const doc = propertyXmlFormat.parse(text)!;
        expect(doc.keys()).toEqual(['Thing']);
        expect(doc.getRaw('Thing')).toBe('old');
        doc.setRaw('Thing', 'new');
        expect(doc.serialize()).toContain(`<property value='new' name='Thing' />`);
    });

    it('will not invent an entry that is not already in the document', () => {
        const doc = propertyXmlFormat.parse(SDTD)!;
        doc.setRaw('BrandNewProperty', 'x');
        expect(doc.serialize()).toBe(SDTD);
        expect(doc.has('BrandNewProperty')).toBe(false);
    });

    it('removes an entry line', () => {
        const doc = propertyXmlFormat.parse(SDTD)!;
        doc.remove('GameDifficulty');
        const out = doc.serialize();
        expect(out).not.toContain('GameDifficulty');
        expect(out).toContain('ServerMaxPlayerCount');
        expect(doc.has('GameDifficulty')).toBe(false);
    });

    it('preserves CRLF', () => {
        const crlf = SDTD.replace(/\n/g, '\r\n');
        expect(propertyXmlFormat.parse(crlf)!.serialize()).toBe(crlf);
    });

    it('returns null when there is nothing of its shape to edit', () => {
        expect(propertyXmlFormat.parse('')).toBeNull();
        expect(propertyXmlFormat.parse('<config><servername>x</servername></config>')).toBeNull();
        expect(propertyXmlFormat.parse('not xml at all')).toBeNull();
    });

    it('uses lowercase booleans, as 7 Days to Die writes them', () => {
        const { codec } = propertyXmlFormat;
        expect(codec.toRaw(true, 'bool')).toBe('true');
        expect(codec.fromRaw('true', 'bool')).toBe(true);
        expect(codec.fromRaw('false', 'bool')).toBe(false);
    });
});

describe('element-shaped XML (MTA)', () => {
    it('round-trips an untouched file byte-for-byte', () => {
        const doc = elementXmlFormat.parse(MTA)!;
        expect(doc).not.toBeNull();
        expect(doc.serialize()).toBe(MTA);
    });

    it('addresses entries by tag name and reads element text', () => {
        const doc = elementXmlFormat.parse(MTA)!;
        expect(doc.keys()).toEqual([
            'servername',
            'serverport',
            'httpport',
            'maxplayers',
            'ase',
            'scriptdebuglogfile',
        ]);
        expect(doc.getRaw('servername')).toBe('My MTA Server');
        expect(doc.getRaw('serverport')).toBe('22003');
    });

    it('does not treat self-closing or attribute-only tags as entries', () => {
        const doc = elementXmlFormat.parse(MTA)!;
        // <module src=".." /> and <resource .. /> have no text content.
        expect(doc.has('module')).toBe(false);
        expect(doc.has('resource')).toBe(false);
    });

    it('rewrites only the text, keeping indentation and the tags', () => {
        const doc = elementXmlFormat.parse(MTA)!;
        doc.setRaw('maxplayers', '64');
        const out = doc.serialize();
        expect(out).toContain('  <maxplayers>64</maxplayers>');
        const before = MTA.split('\n');
        expect(out.split('\n').filter((l, i) => l !== before[i])).toHaveLength(1);
    });

    it('escapes element text', () => {
        const doc = elementXmlFormat.parse(MTA)!;
        doc.setRaw('servername', 'A & B <x>');
        expect(doc.serialize()).toContain('<servername>A &amp; B &lt;x&gt;</servername>');
    });

    it('keeps attributes on the open tag when editing the text', () => {
        const text = `<config>\n  <resource src="admin">yes</resource>\n</config>\n`;
        const doc = elementXmlFormat.parse(text)!;
        expect(doc.getRaw('resource')).toBe('yes');
        doc.setRaw('resource', 'no');
        expect(doc.serialize()).toContain('<resource src="admin">no</resource>');
    });

    it('edits the last of a repeated tag and leaves the earlier ones alone', () => {
        const text = `<config>\n  <a>one</a>\n  <a>two</a>\n</config>\n`;
        const doc = elementXmlFormat.parse(text)!;
        expect(doc.keys()).toEqual(['a']);
        expect(doc.getRaw('a')).toBe('two');
        doc.setRaw('a', 'three');
        expect(doc.serialize()).toBe(`<config>\n  <a>one</a>\n  <a>three</a>\n</config>\n`);
    });

    it('leaves elements spanning several lines untouched and unaddressable', () => {
        const text = `<config>\n  <outer>\n    <inner>x</inner>\n  </outer>\n</config>\n`;
        const doc = elementXmlFormat.parse(text)!;
        expect(doc.has('outer')).toBe(false);
        expect(doc.keys()).toEqual(['inner']); // only the single-line one
        expect(doc.serialize()).toBe(text);
    });

    it('returns null when nothing is addressable', () => {
        expect(elementXmlFormat.parse('')).toBeNull();
        expect(elementXmlFormat.parse('<config>\n  <a />\n</config>')).toBeNull();
    });
});
