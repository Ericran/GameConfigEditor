/**
 * Tests for the shared codec factory and the address encoding used by sectioned
 * formats.
 */
import { describe, expect, it } from 'vitest';
import { addr, addrKey, addrSection, makeCodec, quoteDouble, unquoteDouble } from './shared';
import { section } from '../games/fields';

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
