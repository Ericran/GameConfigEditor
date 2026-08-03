/**
 * Format round-trip tests.
 *
 * The contract that matters: parsing a real config and serializing it back must
 * not change bytes we weren't asked to change, and editing one key must touch
 * exactly that key's line. A regression here silently corrupts a live server's
 * config, so these are the tests to keep honest.
 */
import { describe, expect, it } from 'vitest';
import { palworldFormat } from './palworld';
import { keyvalueFormat, makeKeyValueFormat } from './keyvalue';
import { makeIniFormat, iniFormat } from './ini';
import { convarFormat, idTechConvarFormat, sampFormat } from './convar';
import { jsonFormat, jsonListFormat } from './json';
import { yamlFormat } from './yaml';
import { addr } from './shared';
import type { Format } from './types';

/** Lines that differ between two texts, as [lineNo, before, after]. */
function changedLines(before: string, after: string): Array<[number, string, string]> {
    const a = before.split('\n');
    const b = after.split('\n');
    const out: Array<[number, string, string]> = [];
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        if (a[i] !== b[i]) out.push([i, a[i] ?? '<none>', b[i] ?? '<none>']);
    }
    return out;
}

// ---------------------------------------------------------------- fixtures

const PALWORLD = [
    '[/Script/Pal.PalGameWorldSettings]',
    'OptionSettings=(Difficulty=None,DayTimeSpeedRate=1.000000,ServerName="My Server",' +
        'ServerDescription="",PublicIP="203.0.113.9",PublicPort=8211,bIsPvP=False,' +
        'BaseCampWorkerMaxNum=15,RCONEnabled=True)',
    '',
].join('\n');

const MINECRAFT = [
    '#Minecraft server properties',
    '#Sat Jul 19 00:00:00 UTC 2026',
    'motd=A Minecraft Server',
    'server-port=25565',
    'online-mode=true',
    'max-players=20',
    '',
    '!alternate comment style',
    'enable-rcon=false',
    '',
].join('\n');

const ARK_INI = [
    '[ServerSettings]',
    '; a comment',
    'AllowThirdPersonPlayer=True',
    'XPMultiplier=1.500000',
    'ServerPassword=',
    'OverrideNamedEngramEntries=(EngramClassName="A",EngramHidden=False)',
    'OverrideNamedEngramEntries=(EngramClassName="B",EngramHidden=True)',
    '',
    '[SessionSettings]',
    'SessionName=My ARK Server',
    '',
    '[/Script/Engine.GameSession]',
    'MaxPlayers=70',
    '',
].join('\n');

const CONVAR = [
    '// server.cfg',
    'hostname "My TF2 Server"',
    'sv_password ""',
    'rcon_password "hunter2"',
    'sv_lan 0',
    'mp_timelimit 30',
    '  sv_cheats 0',
    'seta cl_something 5',
    '',
].join('\n');

const SPIGOT_YML = [
    '# This is the main configuration file for Spigot.',
    'settings:',
    '  debug: false',
    '  netty-threads: 4',
    '  attribute:',
    '    maxHealth:',
    '      max: 2048.0',
    '',
    'messages:',
    '  whitelist: You are not whitelisted on this server!',
    '',
].join('\n');

const VRISING = [
    '{',
    '    "Name": "My V Rising Server",',
    '    "Port": 9876,',
    '    "Secure": true,',
    '    "Rcon": {',
    '        "Enabled": false,',
    '        "Port": 25575',
    '    }',
    '}',
    '',
].join('\n');

// ------------------------------------------------- the shared line contract

/**
 * Every line-based format must round-trip an untouched file byte-for-byte. JSON
 * is excluded deliberately: it re-stringifies, which its module documents.
 */
describe.each<[string, Format, string]>([
    ['palworld', palworldFormat, PALWORLD],
    ['keyvalue', keyvalueFormat, MINECRAFT],
    ['ini', makeIniFormat('ark-ini', { caseInsensitive: true }), ARK_INI],
    ['convar', convarFormat, CONVAR],
    ['yaml', yamlFormat, SPIGOT_YML],
])('%s', (_name, format, text) => {
    it('round-trips an untouched file byte-for-byte', () => {
        const doc = format.parse(text);
        expect(doc).not.toBeNull();
        expect(doc!.serialize()).toBe(text);
    });

    it('reports the keys it found, and getRaw agrees with has()', () => {
        const doc = format.parse(text)!;
        expect(doc.keys().length).toBeGreaterThan(0);
        for (const k of doc.keys()) {
            expect(doc.has(k)).toBe(true);
            expect(doc.getRaw(k)).toBeDefined();
        }
        expect(doc.has('definitely-not-a-real-key')).toBe(false);
        expect(doc.getRaw('definitely-not-a-real-key')).toBeUndefined();
    });

    it('rewrites only the edited key, leaving every other byte alone', () => {
        const doc = format.parse(text)!;
        const key = doc.keys()[0];
        doc.setRaw(key, 'ZZZ');
        const changed = changedLines(text, doc.serialize());
        expect(changed).toHaveLength(1);
        expect(doc.getRaw(key)).toBe('ZZZ');
    });

    it('returns null for empty input, so the editor falls back to raw text', () => {
        expect(format.parse('')).toBeNull();
        expect(format.parse('\n\n\n')).toBeNull();
    });
});

/**
 * What counts as "not this format" differs per format, so it can't live in the
 * shared block above. Returning null is what makes the editor fall back to a raw
 * textarea instead of showing an empty form.
 */
describe('rejecting foreign text', () => {
    const PROSE = 'just some prose with no settings in it at all';

    it('palworld rejects text with no OptionSettings list', () => {
        expect(palworldFormat.parse(PROSE)).toBeNull();
        expect(palworldFormat.parse('[Header]\nSomethingElse=1\n')).toBeNull();
        // Present but empty is still unusable.
        expect(palworldFormat.parse('OptionSettings=()')).toBeNull();
    });

    it('keyvalue and ini reject text with no key=value pair', () => {
        expect(keyvalueFormat.parse(PROSE)).toBeNull();
        expect(iniFormat.parse(PROSE)).toBeNull();
        // A section header alone gives nothing to edit.
        expect(iniFormat.parse('[OnlyASection]\n')).toBeNull();
        // Comments only.
        expect(keyvalueFormat.parse('# just a comment\n! another\n')).toBeNull();
    });

    it('convar rejects comment-only files but accepts any bare line as a command', () => {
        expect(convarFormat.parse('// only comments\n// here\n')).toBeNull();
        // Deliberate: in server.cfg every non-comment line IS a console command,
        // so there is nothing that distinguishes prose from `convar arg arg`.
        // Harmless in practice - this format is only ever handed a server.cfg.
        const doc = convarFormat.parse(PROSE)!;
        expect(doc).not.toBeNull();
        expect(doc.keys()).toEqual(['just']);
        expect(doc.getRaw('just')).toBe('some prose with no settings in it at all');
    });
});

// ------------------------------------------------------------ palworld

describe('palworld', () => {
    it('keeps the header and the closing paren verbatim', () => {
        const doc = palworldFormat.parse(PALWORLD)!;
        doc.setRaw('bIsPvP', 'True');
        const out = doc.serialize();
        expect(out.startsWith('[/Script/Pal.PalGameWorldSettings]\nOptionSettings=(')).toBe(true);
        expect(out.endsWith(')\n')).toBe(true);
    });

    it('does not split a comma inside quotes', () => {
        const text = 'OptionSettings=(ServerName="Comma, inside",MaxPlayers=32)';
        const doc = palworldFormat.parse(text)!;
        expect(doc.keys()).toEqual(['ServerName', 'MaxPlayers']);
        expect(doc.getRaw('ServerName')).toBe('"Comma, inside"');
        expect(doc.serialize()).toBe(text);
    });

    it('does not split commas after backslash-escaped quotes inside a string', () => {
        const text = 'OptionSettings=(ServerName="Bob \\"Best, Ever\\" Server",MaxPlayers=32)';
        const doc = palworldFormat.parse(text)!;
        expect(doc.keys()).toEqual(['ServerName', 'MaxPlayers']);
        expect(doc.getRaw('ServerName')).toBe('"Bob \\"Best, Ever\\" Server"');
        expect(doc.serialize()).toBe(text);
    });

    it('does not split a comma inside nested parens', () => {
        const text = 'OptionSettings=(Outer=(a=1,b=2),MaxPlayers=32)';
        const doc = palworldFormat.parse(text)!;
        expect(doc.keys()).toEqual(['Outer', 'MaxPlayers']);
        expect(doc.getRaw('Outer')).toBe('(a=1,b=2)');
    });

    it('preserves malformed fragments and duplicate keys, editing only the live last occurrence', () => {
        const text = 'OptionSettings=(A=1,broken-fragment,B=2,A=3)';
        const doc = palworldFormat.parse(text)!;
        expect(doc.serialize()).toBe(text);
        expect(doc.keys()).toEqual(['A', 'B']);
        expect(doc.getRaw('A')).toBe('3');
        doc.setRaw('A', '4');
        expect(doc.serialize()).toBe('OptionSettings=(A=1,broken-fragment,B=2,A=4)');
    });

    it('appends a key that was not in the file', () => {
        const doc = palworldFormat.parse(PALWORLD)!;
        doc.setRaw('BrandNewKey', 'True');
        expect(doc.serialize()).toContain(',BrandNewKey=True)');
    });

    it('removes a key entirely', () => {
        const doc = palworldFormat.parse(PALWORLD)!;
        doc.remove('bIsPvP');
        const out = doc.serialize();
        expect(out).not.toContain('bIsPvP');
        expect(doc.has('bIsPvP')).toBe(false);
        // Neighbours survive and the list stays well-formed.
        expect(out).toContain('PublicPort=8211');
        expect(out).toContain('BaseCampWorkerMaxNum=15');
    });

    it('leaves the document unchanged when an atomic multi-remove cannot remove every key', () => {
        const doc = palworldFormat.parse(PALWORLD)!;
        const before = doc.serialize();
        expect(doc.removeMany?.(['PublicIP', 'MissingRelayPort'])).toBe(false);
        expect(doc.serialize()).toBe(before);
    });

    it('quotes text and unquotes it symmetrically', () => {
        const { codec } = palworldFormat;
        expect(codec.toRaw('hello', 'text')).toBe('"hello"');
        expect(codec.fromRaw('"hello"', 'text')).toBe('hello');
        expect(codec.fromRaw('""', 'text')).toBe('');
        expect(codec.toRaw(true, 'bool')).toBe('True');
        expect(codec.fromRaw('False', 'bool')).toBe(false);
    });
});

// ----------------------------------------------------------------- ini

describe('ini', () => {
    it('addresses keys by section, so the same name can repeat across sections', () => {
        const text = ['[A]', 'Port=1', '', '[B]', 'Port=2', ''].join('\n');
        const doc = iniFormat.parse(text)!;
        expect(doc.getRaw(addr('A', 'Port'))).toBe('1');
        expect(doc.getRaw(addr('B', 'Port'))).toBe('2');
        doc.setRaw(addr('B', 'Port'), '9');
        expect(doc.serialize()).toBe(['[A]', 'Port=1', '', '[B]', 'Port=9', ''].join('\n'));
    });

    it('matches a differently-cased key instead of appending a duplicate (caseInsensitive)', () => {
        const ci = makeIniFormat('ci', { caseInsensitive: true });
        const doc = ci.parse(ARK_INI)!;
        // Schema spells it lowercase; the file spells it AllowThirdPersonPlayer.
        const schemaAddr = addr('ServerSettings', 'allowThirdPersonPlayer');
        expect(doc.has(schemaAddr)).toBe(true);
        doc.setRaw(schemaAddr, 'False');
        const out = doc.serialize();
        // The file's original spelling is kept, and no second key appears.
        expect(out).toContain('AllowThirdPersonPlayer=False');
        expect(out).not.toContain('allowThirdPersonPlayer=');
        expect(out.match(/AllowThirdPersonPlayer/gi)).toHaveLength(1);
    });

    it('is case-sensitive when not asked to be', () => {
        const doc = iniFormat.parse(ARK_INI)!;
        expect(doc.has(addr('ServerSettings', 'allowThirdPersonPlayer'))).toBe(false);
        expect(doc.has(addr('ServerSettings', 'AllowThirdPersonPlayer'))).toBe(true);
    });

    it('edits the last of a duplicated key and preserves the others', () => {
        const ci = makeIniFormat('ci', { caseInsensitive: true });
        const doc = ci.parse(ARK_INI)!;
        const a = addr('ServerSettings', 'OverrideNamedEngramEntries');
        expect(doc.getRaw(a)).toContain('EngramClassName="B"');
        doc.setRaw(a, '(EngramClassName="C")');
        const out = doc.serialize();
        expect(out).toContain('EngramClassName="A"'); // first occurrence untouched
        expect(out).toContain('(EngramClassName="C")');
        expect(out).not.toContain('EngramClassName="B"');
    });

    it('inserts a new key at the end of its existing section', () => {
        const doc = iniFormat.parse(ARK_INI)!;
        doc.setRaw(addr('SessionSettings', 'NewKey'), '1');
        const lines = doc.serialize().split('\n');
        const sessionIdx = lines.indexOf('[SessionSettings]');
        // Directly after the section's last key/value line, not at end of file.
        expect(lines[sessionIdx + 2]).toBe('NewKey=1');
    });

    it('appends a brand-new section when the key belongs to one that is absent', () => {
        const doc = iniFormat.parse(ARK_INI)!;
        doc.setRaw(addr('BrandNew', 'Key'), '5');
        const out = doc.serialize();
        expect(out).toContain('[BrandNew]\nKey=5');
        expect(doc.getRaw(addr('BrandNew', 'Key'))).toBe('5');
    });

    it('preserves comments and blank lines', () => {
        const doc = iniFormat.parse(ARK_INI)!;
        doc.setRaw(addr('ServerSettings', 'XPMultiplier'), '2.0');
        const out = doc.serialize();
        expect(out).toContain('; a comment');
        expect(out.split('\n').filter((l) => l === '')).toHaveLength(3);
    });

    it('preserves an empty value and can round-trip through the codec', () => {
        const doc = iniFormat.parse(ARK_INI)!;
        expect(doc.getRaw(addr('ServerSettings', 'ServerPassword'))).toBe('');
        expect(iniFormat.codec.fromRaw('', 'text')).toBe('');
    });

    it('preserves CRLF line endings', () => {
        const crlf = ARK_INI.replace(/\n/g, '\r\n');
        const doc = iniFormat.parse(crlf)!;
        expect(doc.serialize()).toBe(crlf);
    });

    it('removes a key without disturbing its neighbours', () => {
        const doc = iniFormat.parse(ARK_INI)!;
        doc.remove(addr('ServerSettings', 'XPMultiplier'));
        const out = doc.serialize();
        expect(out).not.toContain('XPMultiplier');
        expect(out).toContain('AllowThirdPersonPlayer=True');
        expect(out).toContain('ServerPassword=');
    });
});

// ------------------------------------------------------------- keyvalue

describe('keyvalue', () => {
    it('preserves both comment styles and blank lines', () => {
        const doc = keyvalueFormat.parse(MINECRAFT)!;
        doc.setRaw('motd', 'Changed');
        const out = doc.serialize();
        expect(out).toContain('#Minecraft server properties');
        expect(out).toContain('!alternate comment style');
        expect(out.split('\n').filter((l) => l === '')).toHaveLength(2);
    });

    it('uses lowercase booleans', () => {
        const { codec } = keyvalueFormat;
        expect(codec.toRaw(true, 'bool')).toBe('true');
        expect(codec.toRaw(false, 'bool')).toBe('false');
        expect(codec.fromRaw('true', 'bool')).toBe(true);
        expect(codec.fromRaw('TRUE', 'bool')).toBe(true);
        expect(codec.fromRaw('false', 'bool')).toBe(false);
    });

    it('appends an unknown key at the end', () => {
        const doc = keyvalueFormat.parse(MINECRAFT)!;
        doc.setRaw('brand-new', 'yes');
        expect(doc.keys()).toContain('brand-new');
        expect(doc.serialize()).toContain('brand-new=yes');
    });

    it('drops a removed key from keys() as well as the text', () => {
        const doc = keyvalueFormat.parse(MINECRAFT)!;
        doc.remove('motd');
        expect(doc.keys()).not.toContain('motd');
        expect(doc.serialize()).not.toContain('motd=');
        expect(doc.has('motd')).toBe(false);
    });

    it('preserves CRLF line endings', () => {
        const crlf = MINECRAFT.replace(/\n/g, '\r\n');
        const doc = keyvalueFormat.parse(crlf)!;
        expect(doc.serialize()).toBe(crlf);
    });

    it('edits the last of a duplicated key, which is the one the game reads', () => {
        const dup = 'motd=first\nport=1\nmotd=second\n';
        const doc = keyvalueFormat.parse(dup)!;
        // Listed once, in first-seen order, but the live value is the last one.
        expect(doc.keys()).toEqual(['motd', 'port']);
        expect(doc.getRaw('motd')).toBe('second');
        doc.setRaw('motd', 'third');
        expect(doc.serialize()).toBe('motd=first\nport=1\nmotd=third\n');
    });

    it('is flat - every key reports the empty section', () => {
        const doc = keyvalueFormat.parse(MINECRAFT)!;
        for (const k of doc.keys()) {
            expect(doc.sectionOf(k)).toBe('');
            expect(doc.labelOf(k)).toBe(k);
        }
    });

    it('accepts a codec override for formats that spell booleans differently', () => {
        const upper = makeKeyValueFormat('upper', { codec: { boolTrue: 'True', boolFalse: 'False' } });
        expect(upper.codec.toRaw(true, 'bool')).toBe('True');
        expect(upper.codec.fromRaw('True', 'bool')).toBe(true);
    });

    it('preserves indentation and the padding around = when editing', () => {
        const doc = keyvalueFormat.parse('  spaced-key = value\nother=1\n')!;
        // The value is exposed without the padding, so codecs see a clean value.
        expect(doc.getRaw('spaced-key')).toBe('value');
        doc.setRaw('spaced-key', 'x');
        expect(doc.serialize()).toBe('  spaced-key = x\nother=1\n');
        // A key with no padding stays that way.
        doc.setRaw('other', '2');
        expect(doc.serialize()).toBe('  spaced-key = x\nother=2\n');
    });

    it('handles single-quoted values with padding (Reign Of Kings style)', () => {
        const text = "# comment\nServerName = 'My Realm'\nMaxPlayers = '32'\n";
        const doc = keyvalueFormat.parse(text)!;
        expect(doc.serialize()).toBe(text);
        expect(doc.getRaw('ServerName')).toBe("'My Realm'");
        doc.setRaw('ServerName', "'Other Realm'");
        expect(doc.serialize()).toBe("# comment\nServerName = 'Other Realm'\nMaxPlayers = '32'\n");
    });
});

// --------------------------------------------------------------- convar

describe('convar', () => {
    it('uses 1/0 booleans and treats anything else as truthy', () => {
        const { codec } = convarFormat;
        expect(codec.toRaw(true, 'bool')).toBe('1');
        expect(codec.toRaw(false, 'bool')).toBe('0');
        expect(codec.fromRaw('1', 'bool')).toBe(true);
        expect(codec.fromRaw('0', 'bool')).toBe(false);
        expect(codec.fromRaw('"0"', 'bool')).toBe(false);
        expect(codec.fromRaw('', 'bool')).toBe(false);
        expect(codec.fromRaw('false', 'bool')).toBe(false);
        expect(codec.fromRaw('2', 'bool')).toBe(true);
    });

    it('keeps quotes on values and strips them for text fields', () => {
        const doc = convarFormat.parse(CONVAR)!;
        expect(doc.getRaw('hostname')).toBe('"My TF2 Server"');
        expect(convarFormat.codec.fromRaw(doc.getRaw('hostname'), 'text')).toBe('My TF2 Server');
    });

    it('does not double literal backslashes in Source convar strings', () => {
        const doc = convarFormat.parse('hostname "C:\\games\\server"\n')!;
        expect(convarFormat.codec.fromRaw(doc.getRaw('hostname'), 'text')).toBe('C:\\games\\server');
        const raw = convarFormat.codec.toRaw('D:\\servers\\cs2', 'text');
        expect(raw).toBe('"D:\\servers\\cs2"');
        expect(doc.setRaw('hostname', raw)).toBe(true);
        expect(doc.serialize()).toBe('hostname "D:\\servers\\cs2"\n');
    });

    it('uses Source quote semantics when locating an inline comment', () => {
        const doc = convarFormat.parse('hostname "old\\" // keep this comment\n')!;
        expect(doc.getRaw('hostname')).not.toContain('//');
        expect(doc.setRaw('hostname', '"new"')).toBe(true);
        expect(doc.serialize()).toBe('hostname "new" // keep this comment\n');
    });

    it('rejects a Source string containing an unrepresentable quote', () => {
        const doc = convarFormat.parse('hostname "before"\n')!;
        const raw = convarFormat.codec.toRaw('say "hello"', 'text');
        expect(doc.setRaw('hostname', raw)).toBe(false);
        expect(doc.serialize()).toBe('hostname "before"\n');
    });

    it('keeps backslash escaping for idTech strings', () => {
        const doc = idTechConvarFormat.parse('seta sv_hostname "before"\n')!;
        const raw = idTechConvarFormat.codec.toRaw('say "hello" at C:\\games', 'text');
        expect(raw).toBe('"say \\"hello\\" at C:\\\\games"');
        expect(doc.setRaw('sv_hostname', raw)).toBe(true);
        expect(idTechConvarFormat.codec.fromRaw(raw, 'text')).toBe('say "hello" at C:\\games');
    });

    it('allows literal quotes in bare-value convar dialects', () => {
        const doc = sampFormat.parse('hostname before\n')!;
        const raw = sampFormat.codec.toRaw('My "Server"', 'text');
        expect(raw).toBe('My "Server"');
        expect(doc.setRaw('hostname', raw)).toBe(true);
        expect(doc.serialize()).toBe('hostname My "Server"\n');
    });

    it('preserves // comments and leading indentation', () => {
        const doc = convarFormat.parse(CONVAR)!;
        doc.setRaw('sv_cheats', '1');
        const out = doc.serialize();
        expect(out).toContain('// server.cfg');
        expect(out).toContain('  sv_cheats 1'); // indent kept
    });

    it('preserves an inline comment when editing a convar value', () => {
        const text = 'sv_cheats 0 // disabled on public servers\nhostname "https://example.test/a//b"\n';
        const doc = convarFormat.parse(text)!;
        expect(doc.getRaw('sv_cheats')).toBe('0');
        expect(doc.getRaw('hostname')).toBe('"https://example.test/a//b"');
        doc.setRaw('sv_cheats', '1');
        expect(doc.serialize()).toBe(
            'sv_cheats 1 // disabled on public servers\nhostname "https://example.test/a//b"\n',
        );
    });

    it('round-trips the separator before a comment on a value-less command', () => {
        const text = 'exec // run the default config\n';
        const doc = convarFormat.parse(text)!;
        expect(doc.getRaw('exec')).toBe('');
        expect(doc.serialize()).toBe(text);
    });

    it('preserves a set/seta keyword and addresses the convar by name', () => {
        const doc = convarFormat.parse(CONVAR)!;
        expect(doc.has('cl_something')).toBe(true);
        expect(doc.has('seta')).toBe(false);
        doc.setRaw('cl_something', '9');
        expect(doc.serialize()).toContain('seta cl_something 9');
    });

    it('appends a new convar at the end', () => {
        const doc = convarFormat.parse(CONVAR)!;
        doc.setRaw('sv_newconvar', '1');
        expect(doc.serialize()).toContain('sv_newconvar 1');
    });

    it('emits a bare convar when its value is cleared', () => {
        const doc = convarFormat.parse(CONVAR)!;
        doc.setRaw('sv_lan', '');
        expect(doc.serialize()).toContain('\nsv_lan\n');
    });

    it('removes a convar line', () => {
        const doc = convarFormat.parse(CONVAR)!;
        doc.remove('mp_timelimit');
        expect(doc.serialize()).not.toContain('mp_timelimit');
        expect(doc.keys()).not.toContain('mp_timelimit');
    });

    it('preserves CRLF line endings', () => {
        const crlf = CONVAR.replace(/\n/g, '\r\n');
        const doc = convarFormat.parse(crlf)!;
        expect(doc.serialize()).toBe(crlf);
    });
});

// ----------------------------------------------------------------- json

describe('json', () => {
    it('round-trips an untouched file (this fixture has no arrays to reflow)', () => {
        const doc = jsonFormat.parse(VRISING)!;
        expect(doc.serialize()).toBe(VRISING);
    });

    it('is semantically lossless even when it reflows', () => {
        const withArray = '{\n    "A": 1,\n    "L": [1, 2, 3]\n}\n';
        const doc = jsonFormat.parse(withArray)!;
        expect(JSON.parse(doc.serialize())).toEqual(JSON.parse(withArray));
    });

    it('addresses nested keys by dotted path', () => {
        const doc = jsonFormat.parse(VRISING)!;
        expect(doc.keys()).toEqual(['Name', 'Port', 'Secure', 'Rcon.Enabled', 'Rcon.Port']);
        expect(doc.getRaw('Rcon.Port')).toBe('25575');
        expect(doc.sectionOf('Rcon.Port')).toBe('Rcon');
        expect(doc.labelOf('Rcon.Port')).toBe('Port');
        expect(doc.sectionOf('Name')).toBe('');
    });

    it('escapes literal dots and backslashes in JSON property names so addresses cannot collide', () => {
        const doc = jsonFormat.parse('{"A.B":1,"A":{"B":2},"C\\\\D":3}')!;
        expect(doc.keys()).toEqual(['A\\.B', 'A.B', 'C\\\\D']);
        expect(doc.getRaw('A\\.B')).toBe('1');
        expect(doc.getRaw('A.B')).toBe('2');
        expect(doc.getRaw('C\\\\D')).toBe('3');
        doc.setRaw('A\\.B', '9');
        expect(JSON.parse(doc.serialize())).toEqual({ 'A.B': 9, A: { B: 2 }, 'C\\D': 3 });
    });

    it('keeps a number a number and a boolean a boolean', () => {
        const doc = jsonFormat.parse(VRISING)!;
        doc.setRaw('Port', '7777');
        doc.setRaw('Secure', 'false');
        const parsed = JSON.parse(doc.serialize());
        expect(parsed.Port).toBe(7777);
        expect(parsed.Secure).toBe(false);
        expect(typeof parsed.Port).toBe('number');
        expect(typeof parsed.Secure).toBe('boolean');
    });

    it('uses a type hint when creating a property with no existing JSON type', () => {
        const doc = jsonFormat.parse('{}')!;
        expect(doc.setRaw('Port', '9876', 'number')).toBe(true);
        expect(doc.setRaw('Secure', 'true', 'bool')).toBe(true);
        expect(doc.setRaw('Name', '007', 'text')).toBe(true);

        const parsed = JSON.parse(doc.serialize());
        expect(parsed).toEqual({ Port: 9876, Secure: true, Name: '007' });
        expect(typeof parsed.Port).toBe('number');
        expect(typeof parsed.Secure).toBe('boolean');
        expect(typeof parsed.Name).toBe('string');
    });

    it('uses a type hint when replacing null, but preserves existing non-null types', () => {
        const doc = jsonFormat.parse('{"NullPort":null,"TextPort":"123","NumericName":123,"Enabled":true}')!;
        expect(doc.setRaw('NullPort', '9876', 'number')).toBe(true);
        expect(doc.setRaw('TextPort', '456', 'number')).toBe(true);
        expect(doc.setRaw('NumericName', '456', 'text')).toBe(true);
        expect(doc.setRaw('Enabled', 'false', 'text')).toBe(true);

        const parsed = JSON.parse(doc.serialize());
        expect(parsed.NullPort).toBe(9876);
        expect(parsed.TextPort).toBe('456');
        expect(parsed.NumericName).toBe(456);
        expect(parsed.Enabled).toBe(false);
    });

    it('rejects an invalid hinted value without creating the property', () => {
        const doc = jsonFormat.parse('{}')!;
        expect(doc.setRaw('Port', 'Infinity', 'number')).toBe(false);
        expect(doc.setRaw('Secure', 'not-a-boolean', 'bool')).toBe(false);
        expect(JSON.parse(doc.serialize())).toEqual({});
    });

    it('rejects non-finite numbers rather than serializing them as null', () => {
        const doc = jsonFormat.parse(VRISING)!;
        expect(doc.setRaw('Port', 'Infinity')).toBe(false);
        expect(doc.setRaw('Port', '-Infinity')).toBe(false);
        expect(JSON.parse(doc.serialize()).Port).toBe(9876);
    });

    it('exposes an array leaf as a JSON string and writes it back as an array', () => {
        const doc = jsonFormat.parse('{\n    "L": [1, 2]\n}\n')!;
        expect(doc.getRaw('L')).toBe('[1,2]');
        doc.setRaw('L', '[3,4,5]');
        expect(JSON.parse(doc.serialize()).L).toEqual([3, 4, 5]);
    });

    it('keeps the old value rather than corrupting the file on invalid JSON', () => {
        const doc = jsonFormat.parse('{\n    "L": [1, 2]\n}\n')!;
        doc.setRaw('L', 'not json at all');
        expect(JSON.parse(doc.serialize()).L).toEqual([1, 2]);
    });

    it('will not invent missing nested parents', () => {
        const doc = jsonFormat.parse(VRISING)!;
        doc.setRaw('Nope.Missing.Deep', '1');
        expect(doc.serialize()).toBe(VRISING);
        expect(doc.has('Nope.Missing.Deep')).toBe(false);
    });

    it('detects and reuses the original indentation', () => {
        const twoSpace = '{\n  "A": 1,\n  "B": 2\n}\n';
        expect(jsonFormat.parse(twoSpace)!.serialize()).toBe(twoSpace);
        const tabbed = '{\n\t"A": 1,\n\t"B": 2\n}\n';
        expect(jsonFormat.parse(tabbed)!.serialize()).toBe(tabbed);
        const eightSpace = '{\n        "A": 1\n}\n';
        expect(jsonFormat.parse(eightSpace)!.serialize()).toBe(eightSpace);
    });

    it('falls back to four spaces when the file has nothing to copy', () => {
        // A one-liner (as a game may write it) gives detectIndent no sample.
        expect(jsonFormat.parse('{"A":1,"B":2}')!.serialize()).toBe('{\n    "A": 1,\n    "B": 2\n}');
        expect(jsonFormat.parse('{}')).not.toBeNull();
    });

    it('preserves the absence of a trailing newline', () => {
        const noNewline = '{\n    "A": 1\n}';
        expect(jsonFormat.parse(noNewline)!.serialize()).toBe(noNewline);
    });

    it('rejects non-JSON and non-object JSON', () => {
        expect(jsonFormat.parse('not json')).toBeNull();
        expect(jsonFormat.parse('[1,2,3]')).toBeNull();
        expect(jsonFormat.parse('"a string"')).toBeNull();
        expect(jsonFormat.parse('null')).toBeNull();
    });

    it('removes a nested key', () => {
        const doc = jsonFormat.parse(VRISING)!;
        doc.remove('Rcon.Enabled');
        const parsed = JSON.parse(doc.serialize());
        expect('Enabled' in parsed.Rcon).toBe(false);
        expect(parsed.Rcon.Port).toBe(25575);
    });
});

// ------------------------------------------------------------ json (lists)

const OPS = [
    '[',
    '    {',
    '        "uuid": "069a79f4-44e9-4726-a5be-fca90e38aaf5",',
    '        "name": "Notch",',
    '        "level": 4,',
    '        "bypassesPlayerLimit": false',
    '    }',
    ']',
    '',
].join('\n');

describe('json list mode', () => {
    it('accepts an array root, which the default format refuses', () => {
        expect(jsonFormat.parse(OPS)).toBeNull();
        expect(jsonListFormat.parse(OPS)).not.toBeNull();
        expect(jsonListFormat.parse(OPS)!.serialize()).toBe(OPS);
    });

    it('addresses each element by index and groups it under a bracketed section', () => {
        const doc = jsonListFormat.parse(OPS)!;
        expect(doc.keys()).toEqual(['0.uuid', '0.name', '0.level', '0.bypassesPlayerLimit']);
        expect(doc.getRaw('0.name')).toBe('Notch');
        expect(doc.getRaw('0.level')).toBe('4');
        // `[0]` rather than `0`, so a list of records reads as numbered entries
        // instead of a section that looks like an ordinary key.
        expect(doc.sectionOf('0.name')).toBe('[0]');
        expect(doc.labelOf('0.name')).toBe('name');
    });

    it('writes through an element while keeping its JSON types', () => {
        const doc = jsonListFormat.parse(OPS)!;
        expect(doc.setRaw('0.name', 'jeb_')).toBe(true);
        expect(doc.setRaw('0.level', '3')).toBe(true);
        expect(doc.setRaw('0.bypassesPlayerLimit', 'true')).toBe(true);
        const parsed = JSON.parse(doc.serialize());
        expect(parsed[0]).toEqual({
            uuid: '069a79f4-44e9-4726-a5be-fca90e38aaf5',
            name: 'jeb_',
            level: 3,
            bypassesPlayerLimit: true,
        });
    });

    it('closes the gap when a list element is removed, rather than leaving a null', () => {
        // `delete arr[1]` would serialize as [..., null, ...] and corrupt the list.
        const doc = jsonListFormat.parse('["a","b","c"]')!;
        expect(doc.keys()).toEqual(['0', '1', '2']);
        expect(doc.remove('1')).toBe(true);
        expect(JSON.parse(doc.serialize())).toEqual(['a', 'c']);
    });

    it('removes a property of a record without disturbing the list', () => {
        const doc = jsonListFormat.parse('[{"n":"a","x":1},{"n":"b"}]')!;
        expect(doc.remove('0.x')).toBe(true);
        expect(JSON.parse(doc.serialize())).toEqual([{ n: 'a' }, { n: 'b' }]);
    });

    it('will not grow a list from the form', () => {
        const doc = jsonListFormat.parse(OPS)!;
        expect(doc.setRaw('1.name', 'someone')).toBe(false);
        expect(doc.serialize()).toBe(OPS);
    });

    it('still rejects a scalar root', () => {
        expect(jsonListFormat.parse('"a string"')).toBeNull();
        expect(jsonListFormat.parse('null')).toBeNull();
        expect(jsonListFormat.parse('not json')).toBeNull();
    });

    it('handles an object root with nested arrays too', () => {
        const doc = jsonListFormat.parse('{"a":{"b":[10,20]}}')!;
        expect(doc.keys()).toEqual(['a.b.0', 'a.b.1']);
        // The index is the leaf here, so the section is the path down to the list.
        expect(doc.sectionOf('a.b.0')).toBe('a.b');
        expect(doc.setRaw('a.b.1', '30')).toBe(true);
        expect(JSON.parse(doc.serialize())).toEqual({ a: { b: [10, 30] } });
    });
});
