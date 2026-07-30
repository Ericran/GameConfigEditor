/**
 * Registry tests. Two jobs: lock in how a file resolves to a game (the part that
 * decides which schema labels a form), and sanity-check the ~540 hand-authored
 * schema fields, which no compiler can validate for us.
 */
import { describe, expect, it } from 'vitest';
import { configDir, configPath, games, gamesFor, resolve } from './registry';

describe('resolve', () => {
    it('prefers an exact game + file match', () => {
        expect(resolve('tf2', 'server.cfg')!.gameName).toBe('Team Fortress 2');
        expect(resolve('cs2', 'server.cfg')!.gameName).toBe('Counter-Strike 2');
        expect(resolve('ark', 'Game.ini')!.fileName).toBe('Game.ini');
    });

    it('falls back to the file name when only one game registers it', () => {
        expect(resolve(undefined, 'PalWorldSettings.ini')!.gameName).toBe('Palworld');
        expect(resolve(undefined, 'server.properties')!.gameName).toBe('Minecraft');
        expect(resolve('some-unknown-game', 'servertest.ini')!.gameName).toBe('Project Zomboid');
    });

    it('does not borrow another game schema when several games share a file name', () => {
        // Nine Source games register server.cfg; with no game we cannot know which.
        const r = resolve(undefined, 'server.cfg')!;
        expect(r).toBeDefined();
        expect(r.format.id).toBe('convar'); // format is shared, so keep it
        expect(r.schema).toBeUndefined(); // but do not label it as Counter-Strike
        expect(r.note).toBeUndefined(); // nor show the CS2-specific note
        expect(r.gameName).toBe('server.cfg');
    });

    it('returns undefined when nothing matches, so the editor shows raw text', () => {
        expect(resolve('ark', 'no-such-file.ini')).toBeUndefined();
        expect(resolve(undefined, 'random.txt')).toBeUndefined();
    });
});

describe('gamesFor', () => {
    it('returns every config a game registers, in order', () => {
        expect(gamesFor('ark').map((g) => g.fileName)).toEqual(['GameUserSettings.ini', 'Game.ini']);
        expect(gamesFor('1604030').map((g) => g.fileName)).toEqual([
            'ServerHostSettings.json',
            'ServerGameSettings.json',
        ]);
        expect(gamesFor('minecraft')).toHaveLength(1);
    });

    it('returns nothing for an unknown or missing game', () => {
        expect(gamesFor('not-a-game')).toEqual([]);
        expect(gamesFor(undefined)).toEqual([]);
        expect(gamesFor(null)).toEqual([]);
    });
});

describe('path helpers', () => {
    it('joins the directory and file name', () => {
        expect(configPath(resolve('cs2', 'server.cfg')!)).toBe('/game/csgo/cfg/server.cfg');
        expect(configPath(resolve('ark', 'Game.ini')!)).toBe('/ShooterGame/Saved/Config/LinuxServer/Game.ini');
    });

    it('treats an empty directory as the server root', () => {
        const mc = resolve('minecraft', 'server.properties')!;
        expect(configPath(mc)).toBe('/server.properties');
        expect(configDir(mc)).toBe('/');
    });

    it('strips trailing slashes so no path ever doubles up', () => {
        const g = { ...resolve('minecraft', 'server.properties')!, dir: '/a/b/' };
        expect(configPath(g)).toBe('/a/b/server.properties');
        expect(configDir(g)).toBe('/a/b');
    });
});

describe('registered game data', () => {
    it('gives every entry the fields the UI depends on', () => {
        for (const g of games) {
            expect(g.gameId, 'gameId').toBeTruthy();
            expect(g.gameName, `gameName for ${g.gameId}`).toBeTruthy();
            expect(g.fileName, `fileName for ${g.gameId}`).toBeTruthy();
            expect(g.format, `format for ${g.gameId}`).toBeDefined();
            expect(typeof g.format.parse, `parse for ${g.gameId}`).toBe('function');
            // dir is either '' (server root) or absolute, never a bare segment.
            if (g.dir !== '') expect(g.dir.startsWith('/'), `dir for ${g.gameId}`).toBe(true);
        }
    });

    it('keeps game + file name unique, so file-editor ids cannot collide', () => {
        const ids = games.map((g) => `${g.gameId}/${g.fileName}`);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('gives every schema field a key, label and type, with no duplicate keys in a group set', () => {
        for (const g of games) {
            if (!g.schema) continue;
            const label = `${g.gameId}/${g.fileName}`;
            const seen = new Set<string>();
            for (const group of g.schema) {
                expect(group.id, `group id in ${label}`).toBeTruthy();
                expect(group.title, `group title in ${label}`).toBeTruthy();
                expect(group.icon, `group icon in ${label}`).toBeTruthy();
                for (const f of group.fields) {
                    expect(f.key, `field key in ${label}`).toBeTruthy();
                    expect(f.label, `field label in ${label}`).toBeTruthy();
                    expect(['text', 'number', 'bool', 'select', 'raw']).toContain(f.type);
                    // A duplicate key would silently share one model between fields.
                    expect(seen.has(f.key), `duplicate key ${f.key} in ${label}`).toBe(false);
                    seen.add(f.key);
                }
            }
        }
    });

    it('gives every select field a non-empty option list', () => {
        for (const g of games) {
            for (const group of g.schema ?? []) {
                for (const f of group.fields) {
                    if (f.type !== 'select') continue;
                    expect(f.options, `options for ${f.key}`).toBeDefined();
                    expect(f.options!.length, `options for ${f.key}`).toBeGreaterThan(0);
                }
            }
        }
    });

    it('gives every group a unique id within its schema', () => {
        for (const g of games) {
            if (!g.schema) continue;
            const ids = g.schema.map((s) => s.id);
            expect(new Set(ids).size, `group ids for ${g.gameId}/${g.fileName}`).toBe(ids.length);
        }
    });

    it('never uses the reserved "advanced" group id, which inferred keys claim', () => {
        for (const g of games) {
            for (const group of g.schema ?? []) expect(group.id).not.toBe('advanced');
        }
    });

    it('points every relayGuard at a key its schema actually defines', () => {
        for (const g of games) {
            if (!g.relayGuard) continue;
            const keys = new Set((g.schema ?? []).flatMap((s) => s.fields.map((f) => f.key)));
            expect(keys.has(g.relayGuard.ipKey), `relayGuard ipKey for ${g.gameId}`).toBe(true);
            if (g.relayGuard.portKey) {
                expect(keys.has(g.relayGuard.portKey), `relayGuard portKey for ${g.gameId}`).toBe(true);
            }
        }
    });
});
