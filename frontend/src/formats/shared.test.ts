/**
 * Tests for the shared codec factory and the address encoding used by sectioned
 * formats.
 */
import { describe, expect, it } from 'vitest';
import { addr, addrKey, addrSection, makeCodec, orderedTable, quoteDouble, splitLines, unquoteDouble } from './shared';
import { section } from '../games/fields';
import { keyvalueFormat } from './keyvalue';
import { iniFormat } from './ini';
import { convarFormat } from './convar';

describe('address encoding', () => {
    it('uses the bare key when there is no section', () => {
        expect(addr('', 'Port')).toBe('Port');
        expect(addrSection('Port')).toBe('');
        expect(addrKey('Port')).toBe('Port');
    });

    it('round-trips a section and key', () => {
        const a = addr('ServerSettings', 'RCONPort');
        expect(addrSection(a)).toBe('ServerSettings');
        expect(addrKey(a)).toBe('RCONPort');
    });

    it('keeps sections distinct for the same key name', () => {
        expect(addr('A', 'Port')).not.toBe(addr('B', 'Port'));
    });

    /**
     * The separator is a NUL, which cannot occur in a real INI key. This is the
     * regression test for it: if it were ever "tidied" into a space or a dot,
     * any key or section containing that character would split in the wrong
     * place and the address would silently address the wrong entry.
     */
    it('survives keys and sections containing spaces, dots and brackets', () => {
        for (const [s, k] of [
            ['Message Of The Day', 'Message Text'],
            ['/Script/Engine.GameSession', 'Max.Players'],
            ['S', 'PerLevelStatsMultiplier_Player[0]'],
            ['A B.C[1]', 'x y.z[2]'],
        ]) {
            const a = addr(s, k);
            expect(addrSection(a)).toBe(s);
            expect(addrKey(a)).toBe(k);
        }
    });
});

describe('section() field builders', () => {
    it('produces section-qualified addresses matching addr()', () => {
        const ss = section('ServerSettings');
        expect(ss.n('RCONPort', 'RCON port')).toEqual({
            key: addr('ServerSettings', 'RCONPort'),
            label: 'RCON port',
            type: 'number',
        });
        expect(ss.b('ServerPVE', 'PvE').type).toBe('bool');
        expect(ss.t('ServerPassword', 'Password').type).toBe('text');
        expect(ss.sel('Mode', 'Mode', ['a', 'b'])).toEqual({
            key: addr('ServerSettings', 'Mode'),
            label: 'Mode',
            type: 'select',
            options: ['a', 'b'],
        });
    });
});

describe('makeCodec', () => {
    const codec = makeCodec({ boolTrue: 'True', boolFalse: 'False' });

    it('spells booleans as the format asks', () => {
        expect(codec.toRaw(true, 'bool')).toBe('True');
        expect(codec.toRaw(false, 'bool')).toBe('False');
    });

    it('matches the true spelling case-insensitively by default', () => {
        expect(codec.fromRaw('True', 'bool')).toBe(true);
        expect(codec.fromRaw('true', 'bool')).toBe(true);
        expect(codec.fromRaw('  TRUE  ', 'bool')).toBe(true);
        expect(codec.fromRaw('False', 'bool')).toBe(false);
        expect(codec.fromRaw('anything else', 'bool')).toBe(false);
    });

    it('honours a custom truthiness test', () => {
        const c = makeCodec({
            boolTrue: '1',
            boolFalse: '0',
            isTruthy: (raw) => raw.trim() !== '0' && raw.trim() !== '',
        });
        expect(c.fromRaw('1', 'bool')).toBe(true);
        expect(c.fromRaw('7', 'bool')).toBe(true);
        expect(c.fromRaw('0', 'bool')).toBe(false);
        expect(c.fromRaw('', 'bool')).toBe(false);
    });

    it('converts numbers, keeping the raw text when it is not numeric', () => {
        expect(codec.fromRaw('42', 'number')).toBe(42);
        expect(codec.fromRaw('1.5', 'number')).toBe(1.5);
        expect(codec.fromRaw('-3', 'number')).toBe(-3);
        expect(codec.fromRaw('not a number', 'number')).toBe('not a number');
        expect(codec.toRaw(42, 'number')).toBe('42');
    });

    it('substitutes a typed default for a missing key rather than undefined', () => {
        expect(codec.fromRaw(undefined, 'bool')).toBe(false);
        expect(codec.fromRaw(undefined, 'number')).toBe(0);
        expect(codec.fromRaw(undefined, 'text')).toBe('');
        expect(codec.fromRaw(undefined, 'select')).toBe('');
        expect(codec.fromRaw(undefined, 'raw')).toBe('');
    });

    it('passes raw values through untouched, including surrounding whitespace', () => {
        expect(codec.fromRaw('  spaced  ', 'raw')).toBe('  spaced  ');
        // select trims, because it has to match an option exactly.
        expect(codec.fromRaw('  a  ', 'select')).toBe('a');
    });

    it('applies quote helpers to text only', () => {
        const q = makeCodec({
            boolTrue: 'True',
            boolFalse: 'False',
            quoteText: quoteDouble,
            unquoteText: unquoteDouble,
        });
        expect(q.toRaw('hello', 'text')).toBe('"hello"');
        expect(q.fromRaw('"hello"', 'text')).toBe('hello');
        // Not a quoted value - left alone rather than mangled.
        expect(q.fromRaw('hello', 'text')).toBe('hello');
        expect(q.fromRaw('"unbalanced', 'text')).toBe('"unbalanced');
        // Raw and select are untouched by quoting.
        expect(q.toRaw('hello', 'raw')).toBe('hello');
        expect(q.toRaw('hello', 'select')).toBe('hello');
    });

    it('round-trips text containing quotes, backslashes and commas with valid escaped syntax', () => {
        const q = makeCodec({
            boolTrue: 'True',
            boolFalse: 'False',
            quoteText: quoteDouble,
            unquoteText: unquoteDouble,
        });
        expect(q.toRaw('has "inner" quotes', 'text')).toBe('"has \\"inner\\" quotes"');
        expect(q.toRaw('C:\\servers\\one', 'text')).toBe('"C:\\\\servers\\\\one"');
        for (const v of ['a, b', 'has "inner" quotes', 'C:\\servers\\one', '', 'trailing ']) {
            expect(q.fromRaw(q.toRaw(v, 'text'), 'text')).toBe(v);
        }
    });
});

describe('splitLines', () => {
    it('preserves the document newline style', () => {
        expect(splitLines('a\nb')).toEqual({ lines: ['a', 'b'], nl: '\n' });
        expect(splitLines('a\r\nb')).toEqual({ lines: ['a', 'b'], nl: '\r\n' });
        // A single CRLF anywhere marks the file as CRLF, so a rejoin keeps it.
        expect(splitLines('a\nb\r\nc').nl).toBe('\r\n');
    });
});

describe('orderedTable', () => {
    it('keeps first-seen order but resolves to the last occurrence', () => {
        const t = orderedTable<number>();
        t.set('a', 0);
        t.set('b', 1);
        t.set('a', 2); // duplicate key: the game reads the last one
        expect(t.keys()).toEqual(['a', 'b']);
        expect(t.get('a')).toBe(2);
    });

    it('folds addresses when a format is case-insensitive, keeping file spelling', () => {
        const t = orderedTable<number>((a) => a.toLowerCase());
        t.set('MaxPlayers', 0);
        t.set('maxplayers', 1);
        expect(t.keys()).toEqual(['MaxPlayers']); // one entry, original casing
        expect(t.get('MAXPLAYERS')).toBe(1);
    });

    it('does not inherit Object.prototype members', () => {
        const t = orderedTable<number>();
        expect(t.has('constructor')).toBe(false);
        expect(t.has('toString')).toBe(false);
        expect(t.get('constructor')).toBeUndefined();
        t.set('constructor', 7);
        expect(t.get('constructor')).toBe(7);
        expect(t.keys()).toEqual(['constructor']);
    });
});

describe('keys colliding with Object.prototype', () => {
    // A config key literally named `constructor`/`toString` used to resolve to an
    // inherited function through the plain-object index, so `has` lied and the
    // lookup after it threw. Every parser shares one prototype-less table now.
    it('round-trips a key=value file with a constructor key', () => {
        const text = 'constructor=1\ntoString=hello\nmax-players=20\n';
        const doc = keyvalueFormat.parse(text)!;
        expect(doc).not.toBeNull();
        expect(doc.has('constructor')).toBe(true);
        expect(doc.getRaw('constructor')).toBe('1');
        expect(doc.has('hasOwnProperty')).toBe(false);
        expect(doc.getRaw('hasOwnProperty')).toBeUndefined();
        expect(doc.serialize()).toBe(text);
        doc.setRaw('constructor', '2');
        expect(doc.serialize()).toBe('constructor=2\ntoString=hello\nmax-players=20\n');
    });

    it('round-trips an ini and a convar file with prototype-named keys', () => {
        const ini = iniFormat.parse('[Server]\nvalueOf=3\n')!;
        expect(ini.has(addr('Server', 'valueOf'))).toBe(true);
        expect(ini.getRaw(addr('Server', 'valueOf'))).toBe('3');
        expect(ini.has(addr('Server', 'toString'))).toBe(false);

        const cfg = convarFormat.parse('hostname "x"\ntoString 1\n')!;
        expect(cfg.has('toString')).toBe(true);
        expect(cfg.getRaw('toString')).toBe('1');
        expect(cfg.has('constructor')).toBe(false);
        expect(cfg.serialize()).toBe('hostname "x"\ntoString 1\n');
    });
});
