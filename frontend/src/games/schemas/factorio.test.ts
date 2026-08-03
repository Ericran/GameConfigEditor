import { describe, expect, it } from 'vitest';
import { factorioSchema } from './factorio';

const fields = factorioSchema.flatMap((group) => group.fields);
const byKey = new Map(fields.map((field) => [field.key, field]));

describe('factorioSchema', () => {
    it('models the nested visibility flags and scalar server settings with their JSON types', () => {
        expect(byKey.get('visibility.public')?.type).toBe('bool');
        expect(byKey.get('visibility.lan')?.type).toBe('bool');
        expect(byKey.get('max_players')?.type).toBe('number');
        expect(byKey.get('name')?.type).toBe('text');
        expect(byKey.get('auto_pause')?.type).toBe('bool');
        expect(byKey.get('autosave_interval')?.type).toBe('number');
    });

    it('leaves array and union-valued settings to Advanced until they can preserve JSON types', () => {
        expect(byKey.has('tags')).toBe(false);
        expect(byKey.has('allow_commands')).toBe(false);
    });

    it('has unique group ids and field keys', () => {
        expect(new Set(factorioSchema.map((group) => group.id)).size).toBe(factorioSchema.length);
        expect(new Set(fields.map((field) => field.key)).size).toBe(fields.length);
    });
});
