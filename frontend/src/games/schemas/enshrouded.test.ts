import { describe, expect, it } from 'vitest';
import { enshroudedSchema } from './enshrouded';

const fields = enshroudedSchema.flatMap((group) => group.fields);
const byKey = new Map(fields.map((field) => [field.key, field]));

describe('enshroudedSchema', () => {
    it('addresses the gameplay settings under the gameSettings branch', () => {
        // A bare `playerHealthFactor` would render, stay empty, and on save
        // append a top-level key the server ignores - the failure mode dotted
        // paths exist to prevent. Only the file's own top-level settings may be
        // addressed unprefixed.
        const topLevel = new Set([
            'name', 'saveDirectory', 'logDirectory', 'ip', 'queryPort', 'slotCount',
            'enableVoiceChat', 'voiceChatMode', 'enableTextChat', 'gameSettingsPreset',
        ]);
        for (const { key } of fields) {
            expect(topLevel.has(key) || key.startsWith('gameSettings.'), key).toBe(true);
        }
        expect(byKey.get('gameSettings.playerHealthFactor')?.type).toBe('number');
        expect(byKey.get('gameSettings.enableDurability')?.type).toBe('bool');
        expect(byKey.get('slotCount')?.type).toBe('number');
        expect(byKey.get('name')?.type).toBe('text');
    });

    it('offers exactly the values Keen documents for each enum setting', () => {
        // The server refuses to boot on an unrecognised value and prints the
        // offending one, so a typo here is a failed start, not a silent default.
        const options = (key: string) => byKey.get(key)?.options;
        expect(options('voiceChatMode')).toEqual(['Proximity', 'Global']);
        expect(options('gameSettingsPreset')).toEqual(['Default', 'Relaxed', 'Hard', 'Survival', 'Custom']);
        expect(options('gameSettings.tombstoneMode')).toEqual([
            'AddBackpackMaterials',
            'Everything',
            'NoTombstone',
        ]);
        expect(options('gameSettings.weatherFrequency')).toEqual(['Disabled', 'Rare', 'Normal', 'Often']);
        expect(options('gameSettings.fishingDifficulty')).toEqual([
            'VeryEasy',
            'Easy',
            'Normal',
            'Hard',
            'VeryHard',
        ]);
        expect(options('gameSettings.curseModifier')).toEqual(['Easy', 'Normal', 'Hard']);
        expect(options('gameSettings.randomSpawnerAmount')).toEqual(['Few', 'Normal', 'Many', 'Extreme']);
        expect(options('gameSettings.aggroPoolAmount')).toEqual(['Few', 'Normal', 'Many', 'Extreme']);
        expect(options('gameSettings.tamingStartleRepercussion')).toEqual([
            'KeepProgress',
            'LoseSomeProgress',
            'LoseAllProgress',
        ]);
    });

    it('types the nanosecond durations as numbers, not text', () => {
        // These are plain JSON numbers (1800000000000 = 30 min). A text field
        // would round-trip them as strings and change the file's JSON types.
        for (const key of ['gameSettings.dayTimeDuration', 'gameSettings.nightTimeDuration',
            'gameSettings.fromHungerToStarving']) {
            expect(byKey.get(key)?.type, key).toBe('number');
            expect(byKey.get(key)?.label, key).toMatch(/ns;/);
        }
    });

    it('leaves the arrays and the deprecated password to the generic groups', () => {
        // userGroups expands into one group per role via the array-walking JSON
        // format; the rest are server-owned lists or a superseded setting.
        for (const key of ['userGroups', 'tags', 'bans', 'bannedAccounts', 'password']) {
            expect(byKey.has(key), `${key} should not be curated`).toBe(false);
        }
    });

    it('has unique group ids and field keys', () => {
        expect(new Set(enshroudedSchema.map((group) => group.id)).size).toBe(enshroudedSchema.length);
        expect(new Set(fields.map((field) => field.key)).size).toBe(fields.length);
    });
});
