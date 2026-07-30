/**
 * Arma server-config tests. The engine's config mixes plain assignments with
 * `class` blocks; the parser must edit the former and never disturb the latter.
 */
import { describe, expect, it } from 'vitest';
import { armaFormat } from './arma';

const ARMA = [
    '// Arma 3 server config',
    'hostname = "My Arma Server";',
    'password = "";',
    'passwordAdmin = "changeme";',
    'maxPlayers = 40;',
    'persistent = 1;',
    'verifySignatures = 2;',
    'admins[] = {"76561198000000000","76561198000000001"};',
    'motd[] = {"Welcome","Have fun"};',
    'kickDuplicate = 1;   // no duplicate ids',
    '',
    'class Missions',
    '{',
    '    class Mission1',
    '    {',
    '        template = "MyMission.Altis";',
    '        difficulty = "Regular";',
    '    };',
    '};',
    '',
].join('\n');

describe('arma', () => {
    it('round-trips an untouched file byte-for-byte', () => {
        const doc = armaFormat.parse(ARMA)!;
        expect(doc).not.toBeNull();
        expect(doc.serialize()).toBe(ARMA);
    });

    it('addresses only top-level assignments, keeping [] as part of array keys', () => {
        const doc = armaFormat.parse(ARMA)!;
        expect(doc.keys()).toEqual([
            'hostname',
            'password',
            'passwordAdmin',
            'maxPlayers',
            'persistent',
            'verifySignatures',
            'admins[]',
            'motd[]',
            'kickDuplicate',
        ]);
        expect(doc.has('template')).toBe(false);
        expect(doc.has('difficulty')).toBe(false);
    });

    it('reads values without the trailing semicolon', () => {
        const doc = armaFormat.parse(ARMA)!;
        expect(doc.getRaw('hostname')).toBe('"My Arma Server"');
        expect(doc.getRaw('maxPlayers')).toBe('40');
        expect(doc.getRaw('password')).toBe('""');
        expect(doc.getRaw('admins[]')).toBe('{"76561198000000000","76561198000000001"}');
        expect(doc.getRaw('missing')).toBeUndefined();
    });

    it('unquotes strings with Arma doubled-quote escaping and writes 1/0 booleans', () => {
        const { codec } = armaFormat;
        expect(codec.fromRaw('"My Arma Server"', 'text')).toBe('My Arma Server');
        expect(codec.toRaw('New Name', 'text')).toBe('"New Name"');
        expect(codec.toRaw('Bob "Best" Server', 'text')).toBe('"Bob ""Best"" Server"');
        expect(codec.fromRaw('"Bob ""Best"" Server"', 'text')).toBe('Bob "Best" Server');
        expect(codec.toRaw(true, 'bool')).toBe('1');
        expect(codec.toRaw(false, 'bool')).toBe('0');
        expect(codec.fromRaw('1', 'bool')).toBe(true);
        expect(codec.fromRaw('0', 'bool')).toBe(false);
        expect(codec.fromRaw('2', 'bool')).toBe(true);
    });

    it('rewrites only the value and keeps the semicolon', () => {
        const doc = armaFormat.parse(ARMA)!;
        doc.setRaw('maxPlayers', '64');
        const out = doc.serialize();
        expect(out).toContain('maxPlayers = 64;');
        const before = ARMA.split('\n');
        expect(out.split('\n').filter((l, i) => l !== before[i])).toHaveLength(1);
    });

    it('preserves a trailing comment after the semicolon', () => {
        const doc = armaFormat.parse(ARMA)!;
        doc.setRaw('kickDuplicate', '0');
        expect(doc.serialize()).toContain('kickDuplicate = 0;   // no duplicate ids');
    });

    it('leaves class-block assignments structurally intact and unaddressable', () => {
        const doc = armaFormat.parse(ARMA)!;
        expect(doc.getRaw('template')).toBeUndefined();
        expect(doc.getRaw('difficulty')).toBeUndefined();
        expect(doc.serialize()).toBe(ARMA);
    });

    it('ignores braces inside single-line and multi-line block comments', () => {
        const text = [
            '/* { a misleading block opener */',
            'hostname = "Visible";',
            '/*',
            '  } another misleading brace',
            '  { and another',
            '*/',
            'maxPlayers = 40;',
            'persistent = 1; /* } */',
            '',
        ].join('\n');
        const doc = armaFormat.parse(text)!;
        expect(doc.keys()).toEqual(['hostname', 'maxPlayers', 'persistent']);
        expect(doc.serialize()).toBe(text);
    });

    it('treats an array as raw text rather than trying to model a list', () => {
        const doc = armaFormat.parse(ARMA)!;
        doc.setRaw('admins[]', '{"765611980000000099"}');
        expect(doc.serialize()).toContain('admins[] = {"765611980000000099"};');
    });

    it('ignores comment lines', () => {
        const doc = armaFormat.parse(ARMA)!;
        expect(doc.has('Arma')).toBe(false);
        expect(doc.serialize()).toContain('// Arma 3 server config');
    });

    it('appends an assignment that was not present', () => {
        const doc = armaFormat.parse(ARMA)!;
        doc.setRaw('motdInterval', '5');
        expect(doc.serialize()).toContain('motdInterval = 5;');
        expect(doc.getRaw('motdInterval')).toBe('5');
    });

    it('removes an assignment without disturbing neighbours', () => {
        const doc = armaFormat.parse(ARMA)!;
        doc.remove('persistent');
        const out = doc.serialize();
        expect(out).not.toContain('persistent');
        expect(out).toContain('maxPlayers = 40;');
        expect(out).toContain('verifySignatures = 2;');
    });

    it('preserves CRLF', () => {
        const crlf = ARMA.replace(/\n/g, '\r\n');
        expect(armaFormat.parse(crlf)!.serialize()).toBe(crlf);
    });

    it('returns null for text with no assignments', () => {
        expect(armaFormat.parse('')).toBeNull();
        expect(armaFormat.parse('// only a comment\n')).toBeNull();
        expect(armaFormat.parse('just prose\n')).toBeNull();
    });
});
