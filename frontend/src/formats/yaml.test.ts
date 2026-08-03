/**
 * YAML format tests.
 *
 * The Bukkit/Spigot/Paper configs are mostly comments, so the bar is higher
 * than "the values survive": the file must come back byte-for-byte, an edit
 * must touch one line, and the structures we refuse to model (sequences, block
 * scalars) must be invisible to the editor rather than half-editable.
 */
import { describe, expect, it } from 'vitest';
import { yamlFormat, quoteScalar, splitComment, unquoteScalar } from './yaml';

const SPIGOT = [
    '# This is the main configuration file for Spigot.',
    'settings:',
    '  debug: false',
    '  bungeecord: false',
    '  sample-count: 12',
    '  attribute:',
    '    maxHealth:',
    '      max: 2048.0',
    '  restart-script: ./start.sh   # relative to the server directory',
    '  moved-wrongly-threshold:',
    '',
    'messages:',
    '  whitelist: You are not whitelisted on this server!',
    '  unknown-command: Unknown command. Type "/help" for help.',
    '',
    'commands:',
    '  spam-exclusions:',
    '  - /skill',
    '  - /craft',
    '  silent-commandblock-console: false',
    'world-settings:',
    '  default:',
    '    verbose: true',
    '    view-distance: default',
    '    growth:',
    '      cactus-modifier: 100',
    'stats:',
    '  forced-stats: {}',
    '',
].join('\n');

const parse = (text = SPIGOT) => yamlFormat.parse(text)!;

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

describe('yaml structure', () => {
    it('round-trips an untouched file byte-for-byte', () => {
        expect(parse().serialize()).toBe(SPIGOT);
    });

    it('addresses nested keys by dotted path, at any depth', () => {
        const doc = parse();
        expect(doc.getRaw('settings.debug')).toBe('false');
        expect(doc.getRaw('settings.sample-count')).toBe('12');
        expect(doc.getRaw('settings.attribute.maxHealth.max')).toBe('2048.0');
        expect(doc.getRaw('world-settings.default.growth.cactus-modifier')).toBe('100');
        expect(doc.has('messages.whitelist')).toBe(true);
    });

    it('does not expose the keys that only open a block', () => {
        const doc = parse();
        expect(doc.has('settings')).toBe(false);
        expect(doc.has('world-settings.default')).toBe(false);
        expect(doc.has('settings.attribute')).toBe(false);
    });

    it('leaves sequences alone entirely - neither the list nor its parent key', () => {
        const doc = parse();
        // Offering `spam-exclusions` as a text field would let one keystroke
        // replace a two-entry list with a scalar.
        expect(doc.has('commands.spam-exclusions')).toBe(false);
        expect(doc.keys().some((k) => k.startsWith('commands.spam-exclusions.'))).toBe(false);
        // ...but the key after the list is still found, so the walk recovers.
        expect(doc.getRaw('commands.silent-commandblock-console')).toBe('false');
    });

    it('treats a key with no value as an editable empty scalar', () => {
        const doc = parse();
        expect(doc.getRaw('settings.moved-wrongly-threshold')).toBe('');
        expect(doc.setRaw('settings.moved-wrongly-threshold', '0.0001')).toBe(true);
        // `foo:bar` is one scalar, not a mapping - the colon needs its space back.
        expect(doc.serialize()).toContain('  moved-wrongly-threshold: 0.0001');
    });

    it('treats a flow collection as one opaque scalar', () => {
        const doc = parse();
        expect(doc.getRaw('stats.forced-stats')).toBe('{}');
    });

    it('groups a nested key under its parent path', () => {
        const doc = parse();
        expect(doc.sectionOf('world-settings.default.growth.cactus-modifier')).toBe(
            'world-settings.default.growth',
        );
        expect(doc.labelOf('world-settings.default.growth.cactus-modifier')).toBe('cactus-modifier');
        expect(doc.sectionOf('top-level')).toBe('');
    });

    it('ignores a block scalar and everything inside it', () => {
        const doc = yamlFormat.parse(['a: 1', 'note: |', '  key: not a real key', '  more text', 'b: 2'].join('\n'))!;
        expect(doc.keys()).toEqual(['a', 'b']);
        expect(doc.has('note')).toBe(false);
    });

    it('preserves CRLF line endings', () => {
        const crlf = SPIGOT.replace(/\n/g, '\r\n');
        const doc = yamlFormat.parse(crlf)!;
        expect(doc.serialize()).toBe(crlf);
        doc.setRaw('settings.debug', 'true');
        expect(doc.serialize().split('\r\n')[2]).toBe('  debug: true');
    });

    it('returns null for input that is not a YAML mapping', () => {
        expect(yamlFormat.parse('')).toBeNull();
        expect(yamlFormat.parse('\n\n\n')).toBeNull();
        expect(yamlFormat.parse('# only comments\n# and more\n')).toBeNull();
        expect(yamlFormat.parse('motd=A Minecraft Server\nmax-players=20\n')).toBeNull();
    });
});

describe('yaml editing', () => {
    it('rewrites only the edited line', () => {
        const doc = parse();
        doc.setRaw('world-settings.default.verbose', 'false');
        const changed = changedLines(SPIGOT, doc.serialize());
        expect(changed).toHaveLength(1);
        expect(changed[0][2]).toBe('    verbose: false');
    });

    it('keeps an inline comment and its column when the value changes', () => {
        const doc = parse();
        doc.setRaw('settings.restart-script', './restart.sh');
        expect(doc.serialize()).toContain('  restart-script: ./restart.sh   # relative to the server directory');
    });

    it('adds a missing key inside its parent block, at the siblings\' indent', () => {
        const doc = parse();
        expect(doc.setRaw('settings.attribute.maxHealth.min', '1.0')).toBe(true);
        expect(doc.getRaw('settings.attribute.maxHealth.min')).toBe('1.0');
        expect(doc.serialize()).toContain('      max: 2048.0\n      min: 1.0');
    });

    it('appends a missing top-level key at the end of the document', () => {
        const doc = parse();
        expect(doc.setRaw('advancements', 'default')).toBe(true);
        expect(doc.serialize()).toBe(SPIGOT.replace(/\n$/, '\nadvancements: default\n'));
    });

    it('refuses to invent a parent block it cannot find', () => {
        const doc = parse();
        expect(doc.setRaw('no-such-section.some-key', '1')).toBe(false);
        expect(doc.serialize()).toBe(SPIGOT);
    });

    it('removes a key and re-addresses what follows', () => {
        const doc = parse();
        expect(doc.remove('settings.bungeecord')).toBe(true);
        expect(doc.has('settings.bungeecord')).toBe(false);
        expect(doc.getRaw('settings.sample-count')).toBe('12');
        expect(doc.serialize()).toBe(SPIGOT.replace('  bungeecord: false\n', ''));
    });
});

describe('yaml codec', () => {
    const { codec } = yamlFormat;

    it('reads every YAML 1.1 spelling of true, and writes the canonical one', () => {
        for (const raw of ['true', 'True', 'yes', 'YES', 'on', 'y']) {
            expect(codec.fromRaw(raw, 'bool'), raw).toBe(true);
        }
        for (const raw of ['false', 'no', 'off', 'n', '']) {
            expect(codec.fromRaw(raw, 'bool'), raw).toBe(false);
        }
        expect(codec.toRaw(true, 'bool')).toBe('true');
        expect(codec.toRaw(false, 'bool')).toBe('false');
    });

    it('leaves an ordinary string unquoted', () => {
        expect(codec.toRaw('A Minecraft Server', 'text')).toBe('A Minecraft Server');
        expect(codec.toRaw('./start.sh', 'text')).toBe('./start.sh');
    });

    it('quotes a string that would otherwise parse as something else', () => {
        expect(quoteScalar('')).toBe("''");
        expect(quoteScalar('true')).toBe("'true'");
        expect(quoteScalar('no')).toBe("'no'");
        expect(quoteScalar('12')).toBe("'12'");
        expect(quoteScalar('Unknown: command')).toBe("'Unknown: command'");
        expect(quoteScalar('hash # here')).toBe("'hash # here'");
        expect(quoteScalar('- leading dash')).toBe("'- leading dash'");
        expect(quoteScalar(' padded ')).toBe("' padded '");
    });

    it('leaves an apostrophe alone unless the value needs quoting anyway', () => {
        // A quote is only special at the START of a plain scalar.
        expect(quoteScalar("it's")).toBe("it's");
        expect(quoteScalar("it's: fine")).toBe("'it''s: fine'");
    });

    it('reads a quoted scalar back to its plain text', () => {
        expect(unquoteScalar("'it''s'")).toBe("it's");
        expect(unquoteScalar('"a \\"b\\" c"')).toBe('a "b" c');
        expect(unquoteScalar('plain')).toBe('plain');
        expect(codec.fromRaw("'12'", 'text')).toBe('12');
    });

    it('round-trips a text value through quote and unquote', () => {
        for (const v of ['plain', 'true', '12', 'a: b', "it's", '', '# not a comment']) {
            expect(codec.fromRaw(codec.toRaw(v, 'text'), 'text'), v).toBe(v);
        }
    });
});

describe('splitComment', () => {
    it('only treats # as a comment when whitespace precedes it', () => {
        expect(splitComment('red#5')).toEqual({ value: 'red#5', comment: '' });
        expect(splitComment('red # 5')).toEqual({ value: 'red', comment: ' # 5' });
        expect(splitComment('# whole thing')).toEqual({ value: '', comment: '# whole thing' });
    });

    it('ignores a # inside quotes', () => {
        expect(splitComment('"a # b"')).toEqual({ value: '"a # b"', comment: '' });
        expect(splitComment("'a # b' # real")).toEqual({ value: "'a # b'", comment: ' # real' });
    });

    it('keeps trailing whitespace out of the value', () => {
        expect(splitComment('value   ')).toEqual({ value: 'value', comment: '   ' });
    });
});
