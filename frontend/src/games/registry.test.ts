/**
 * Registry tests. Two jobs: lock in how a file resolves to a game (the part that
 * decides which schema labels a form), and sanity-check the ~540 hand-authored
 * schema fields, which no compiler can validate for us.
 */
import { describe, expect, it } from 'vitest';
import { configDir, configPath, games, gamesFor, resolve, resolveIn } from './registry';

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

    it('refuses to guess when candidates for a shared file name disagree on format', () => {
        // server.cfg belongs to the Source/GoldSource/idTech families (convar,
        // quoted values) AND to SA-MP (unquoted). Picking either could rewrite
        // every string wrongly, so we decline and let the raw editor handle it.
        expect(resolve(undefined, 'server.cfg')).toBeUndefined();
    });

    it('keeps the format but drops game-specific parts when candidates agree', () => {
        // Synthetic: two games, same file, same format, different schemas.
        const fmt = games.find((g) => g.gameId === 'tf2')!.format;
        const mk = (gameId: string, schema: any, note?: string) => ({
            gameId,
            gameName: `Game ${gameId}`,
            fileName: 'shared.cfg',
            dir: '/x',
            format: fmt,
            schema,
            note,
        });
        const list = [mk('a', [{ id: 'g', title: 'G', icon: 'i', fields: [] }], 'a note'), mk('b', undefined)];
        const r = resolveIn(list, undefined, 'shared.cfg')!;
        expect(r).toBeDefined();
        expect(r.format).toBe(fmt); // shared format is safe to keep
        expect(r.schema).toBeUndefined(); // but not game a's labels
        expect(r.note).toBeUndefined();
        expect(r.gameName).toBe('shared.cfg');
    });

    it('still returns the single owner of a file name unchanged', () => {
        const list = games.filter((g) => g.fileName === 'PalWorldSettings.ini');
        expect(list).toHaveLength(1);
        expect(resolveIn(list, undefined, 'PalWorldSettings.ini')).toBe(list[0]);
    });

    it('returns undefined when nothing matches, so the editor shows raw text', () => {
        expect(resolve('ark', 'no-such-file.ini')).toBeUndefined();
        expect(resolve(undefined, 'random.txt')).toBeUndefined();
    });
});

describe('new catalog families', () => {
    const ids = new Set(games.map((g) => g.gameId));

    it('covers the GoldSource family from GameAP\'s built-in catalog', () => {
        for (const id of ['valve', 'cstrike', 'cs15', 'czero', 'dod', 'tfc', 'op4', 'dmc', 'ricochet', 'svencoop']) {
            expect(ids.has(id), `missing GoldSource game ${id}`).toBe(true);
            const g = resolve(id, 'server.cfg')!;
            expect(g, id).toBeDefined();
            expect(g.format.id).toBe('convar');
            expect(g.dir.endsWith('/cfg'), `${id} dir ${g.dir}`).toBe(true);
        }
    });

    it('uses the mod folder from the catalog start command, not the game code', () => {
        // op4 launches with `-game gearbox`.
        expect(resolve('op4', 'server.cfg')!.dir).toBe('/gearbox/cfg');
        // cs15 and CS 1.6 both live in /cstrike.
        expect(resolve('cs15', 'server.cfg')!.dir).toBe('/cstrike/cfg');
        // CS:S v34 shares /cstrike with CS:S.
        expect(resolve('cssv34', 'server.cfg')!.dir).toBe('/cstrike/cfg');
    });

    it('does not offer Source-only convars to GoldSource games', () => {
        const gs = resolve('valve', 'server.cfg')!;
        const keys = new Set((gs.schema ?? []).flatMap((s) => s.fields.map((f) => f.key)));
        for (const sourceOnly of ['sv_pure', 'sv_visiblemaxplayers', 'mp_forcecamera']) {
            expect(keys.has(sourceOnly), `${sourceOnly} should not be offered on GoldSource`).toBe(false);
        }
        expect(keys.has('hostname')).toBe(true);
    });

    it('covers the set-dialect games and keeps the convar parser', () => {
        for (const id of ['q2', 'q3', 'cod4', 'fivem']) {
            const g = resolve(id, 'server.cfg')!;
            expect(g, id).toBeDefined();
            expect(g.format.id).toBe('convar');
            expect(g.loadHint, `${id} should explain a wrong path`).toBeTruthy();
        }
    });

    it('gives SA-MP the unquoted codec, not the Source one', () => {
        const samp = resolve('samp', 'server.cfg')!;
        expect(samp.format.id).toBe('samp');
        expect(samp.format.codec.toRaw('My Server', 'text')).toBe('My Server');
        // ... where the Source family would quote it.
        expect(resolve('tf2', 'server.cfg')!.format.codec.toRaw('My Server', 'text')).toBe('"My Server"');
    });

    it('gives TeamSpeak 1/0 booleans rather than true/false', () => {
        const ts3 = resolve('teamspeak3', 'ts3server.ini')!;
        expect(ts3.format.codec.toRaw(true, 'bool')).toBe('1');
        expect(ts3.format.codec.toRaw(false, 'bool')).toBe('0');
        expect(ts3.format.codec.fromRaw('1', 'bool')).toBe(true);
        expect(ts3.loadHint).toBeTruthy();
    });
});

describe('the remaining built-in games', () => {
    it('gives 7 Days to Die the attribute-shaped XML editor', () => {
        const g = resolve('7d2d', 'serverconfig.xml')!;
        expect(g.format.id).toBe('xml-property');
        expect(configPath(g)).toBe('/serverconfig.xml'); // -configfile=serverconfig.xml
        const doc = g.format.parse('<ServerSettings>\n  <property name="ServerName" value="x" />\n</ServerSettings>\n')!;
        expect(doc.getRaw('ServerName')).toBe('x');
    });

    it('gives MTA the element-shaped XML editor under mods/deathmatch', () => {
        const g = resolve('mta', 'mtaserver.conf')!;
        expect(g.format.id).toBe('xml-element');
        expect(configPath(g)).toBe('/mods/deathmatch/mtaserver.conf');
        const doc = g.format.parse('<config>\n  <serverport>22003</serverport>\n</config>\n')!;
        expect(doc.getRaw('serverport')).toBe('22003');
    });

    it('gives The Forest on/off booleans and unquoted values', () => {
        const g = resolve('the-forest', 'Server.cfg')!;
        expect(g.format.codec.toRaw(true, 'bool')).toBe('on');
        expect(g.format.codec.toRaw(false, 'bool')).toBe('off');
        expect(g.format.codec.fromRaw('on', 'bool')).toBe(true);
        expect(g.format.codec.fromRaw('off', 'bool')).toBe(false);
        expect(g.format.codec.toRaw('My Forest', 'text')).toBe('My Forest');
        const doc = g.format.parse('// c\nserverName My Forest\nenableVAC off\n')!;
        expect(doc.getRaw('serverName')).toBe('My Forest');
        doc.setRaw('enableVAC', 'on');
        expect(doc.serialize()).toBe('// c\nserverName My Forest\nenableVAC on\n');
    });

    it('round-trips a bare Forest key with no value', () => {
        const g = resolve('the-forest', 'Server.cfg')!;
        const text = 'serverPassword\nserverPlayers 4\n';
        const doc = g.format.parse(text)!;
        expect(doc.serialize()).toBe(text);
        expect(doc.getRaw('serverPassword')).toBe('');
    });

    it('gives Reign Of Kings single-quoted values and True/False booleans', () => {
        const g = resolve('rok', 'ServerSettings.cfg')!;
        expect(configPath(g)).toBe('/Configuration/ServerSettings.cfg');
        expect(g.format.codec.toRaw(true, 'bool')).toBe("'True'");
        expect(g.format.codec.toRaw('My Realm', 'text')).toBe("'My Realm'");
        expect(g.format.codec.fromRaw("'My Realm'", 'text')).toBe('My Realm');
        expect(g.format.codec.fromRaw("'True'", 'bool')).toBe(true);
        expect(g.format.codec.fromRaw("'False'", 'bool')).toBe(false);
        const text = "# c\nServerName = 'Old'\nMaxPlayers = '32'\n";
        const doc = g.format.parse(text)!;
        doc.setRaw('ServerName', "'New'");
        expect(doc.serialize()).toBe("# c\nServerName = 'New'\nMaxPlayers = '32'\n");
    });

    it('leaves Hurtworld schema-less rather than inventing keys', () => {
        const g = resolve('hurtworld', 'autoexec.cfg')!;
        expect(g.schema).toBeUndefined();
        const doc = g.format.parse('servername My Server\ncreativemode 0\n')!;
        expect(doc.getRaw('servername')).toBe('My Server');
        expect(g.format.codec.toRaw('My Server', 'text')).toBe('My Server');
    });

    it('covers all three Arma games with the arma format and a naming hint', () => {
        for (const id of ['arma2', 'arma2oa', 'arma3']) {
            const g = resolve(id, 'server.cfg')!;
            expect(g, id).toBeDefined();
            expect(g.format.id).toBe('arma');
            expect(g.loadHint, `${id} should explain the -config naming`).toBeTruthy();
        }
        const doc = resolve('arma3', 'server.cfg')!.format.parse('hostname = "x";\nmaxPlayers = 40;\n')!;
        expect(doc.getRaw('hostname')).toBe('"x"');
    });

    it('keeps Arma array keys addressable as raw values', () => {
        const g = resolve('arma3', 'server.cfg')!;
        const admins = (g.schema ?? []).flatMap((s) => s.fields).find((f) => f.key === 'admins[]');
        expect(admins).toBeDefined();
        expect(admins!.type).toBe('raw');
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
