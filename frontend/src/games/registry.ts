/**
 * Game registry - the single source of truth mapping a GameAP `game_id` to the
 * config file(s) we can edit, the format that parses them, and (optionally) a
 * curated field schema and guardrails.
 *
 * Games with a `schema` get a labelled form; games without one still get a
 * usable editor (every parsed key rendered generically, grouped by section).
 * The server tab and the registered file-editors both resolve through here.
 */
import type { Format, Schema } from '../formats/types';
import { palworldFormat } from '../formats/palworld';
import { keyvalueFormat, makeKeyValueFormat } from '../formats/keyvalue';
import { makeIniFormat } from '../formats/ini';
import { jsonFormat } from '../formats/json';
import { sampFormat, makeConvarFormat } from '../formats/convar';
import { propertyXmlFormat, elementXmlFormat } from '../formats/xml';
import { palworldSchema } from './schemas/palworld';
import { minecraftSchema } from './schemas/minecraft';
import { arkGameUserSettingsSchema, arkGameIniSchema } from './schemas/ark';
import { pzSchema } from './schemas/pz';
import { vrisingHostSchema } from './schemas/vrising';
import { ts3Schema } from './schemas/teamspeak';
import { sampSchema } from './schemas/samp';
import { theForestSchema } from './schemas/theforest';
import { rokSchema } from './schemas/rok';
import { sdtdSchema } from './schemas/sdtd';
import { mtaSchema } from './schemas/mta';
import { sourceGames } from './source';
import { goldSourceGames } from './goldsource';
import { idTechGames } from './idtech';
import { armaGames } from './arma';

// ARK/Unreal INI keys are case-insensitive - match them that way so a schema
// field and a differently-cased file key don't produce a duplicate.
const arkIni = makeIniFormat('ark-ini', { caseInsensitive: true });

// TeamSpeak's ini is flat key=value like server.properties, but its booleans are
// 1/0 rather than true/false.
const ts3Ini = makeKeyValueFormat('ts3-ini', { codec: { boolTrue: '1', boolFalse: '0' } });

// The Forest writes bare `key value` lines with on/off booleans.
const forestCfg = makeConvarFormat('theforest', {
    allowEmbeddedQuotes: true,
    codec: {
        boolTrue: 'on',
        boolFalse: 'off',
        isTruthy: (r) => r.trim().toLowerCase() === 'on',
        quoteText: (v) => v,
        unquoteText: (r) => r,
    },
});

// Hurtworld's autoexec.cfg is a list of console commands, values unquoted.
const hurtworldCfg = makeConvarFormat('hurtworld', {
    allowEmbeddedQuotes: true,
    codec: { quoteText: (v) => v, unquoteText: (r) => r },
});

// Reign Of Kings quotes every value in single quotes and spells booleans True/False.
const rokCfg = makeKeyValueFormat('rok-cfg', {
    codec: {
        boolTrue: "'True'",
        boolFalse: "'False'",
        isTruthy: (r) => r.trim().replace(/'/g, '').toLowerCase() === 'true',
        quoteText: (v) => `'${v}'`,
        unquoteText: (r) => r.trim().replace(/^'([\s\S]*)'$/, '$1'),
    },
});

const FOREST_HINT =
    'The Forest resolves its config relative to the server data directory and -configfilepath can move it, so the ' +
    'path above is the common default rather than a guarantee.';

// TS3 does not create this file itself - it is only read when the server is
// started with `inifile=ts3server.ini`, so a default install has none.
const TS3_LOAD_HINT =
    'TeamSpeak does not create ts3server.ini on its own, and only reads it when started with ' +
    'inifile=ts3server.ini. Create the file next to the server binary and add that argument to the start command, ' +
    'otherwise every setting stays at its built-in default.';

const ARK_DIR = '/ShooterGame/Saved/Config/LinuxServer';
// Shown when the file fails to load: PZ writes under $HOME/Zomboid, which is
// commonly OUTSIDE the server directory the panel can read - so a 500 here
// usually means the config is mapped outside the server folder, not missing.
const PZ_LOAD_HINT =
    'The server config may be mapped outside the server directory, so the panel cannot read it. Project Zomboid ' +
    'writes to $HOME/Zomboid by default - add  -cachedir=/srv/gameap/servers/<server_folder>/Zomboid  to the ' +
    'start command (or start-server.sh) so it writes inside the server folder, then move any existing ~/Zomboid ' +
    'there. The filename also tracks the configured server name (default servertest.ini).';
// V Rising does NOT generate these under the persistent data path on its own -
// it only creates the list files there. Copy the templates in once.
const VRISING_LOAD_HINT =
    'V Rising does not create this on its own. Copy the template from ' +
    'VRisingServer_Data/StreamingAssets/Settings/ into save-data/Settings/ (the -persistentDataPath), then ' +
    'restart the server. Ports live in this file (Port 9876 / QueryPort 9877), not on the command line.';

export interface GameConfig {
    /** Matches `server.game_id` and a file-editor's `match.gameCode`. */
    gameId: string;
    /** Human name for the tab header / empty states. */
    gameName: string;
    /** Config file name, e.g. `PalWorldSettings.ini`. */
    fileName: string;
    /** Directory containing the file (disk-root-relative); '' means the server root. */
    dir: string;
    /** File-manager disk; nearly always 'server'. */
    disk?: string;
    format: Format;
    /** Curated labelled schema; omit for generic-only editing. */
    schema?: Schema;
    /** Warn that the game overwrites this file on shutdown - stop before saving. */
    stopWarning?: boolean;
    /** Relay/public-IP guardrail: warn + one-click clear of these keys. */
    relayGuard?: { ipKey: string; portKey?: string };
    /** Informational note shown as a banner above the form ON SUCCESSFUL LOAD (e.g. CS2 config layering). */
    note?: string;
    /** Actionable guidance shown in the error banner when the file FAILS to load (e.g. config mapped outside the server dir). */
    loadHint?: string;
}

export const games: GameConfig[] = [
    {
        gameId: 'palworld',
        gameName: 'Palworld',
        fileName: 'PalWorldSettings.ini',
        dir: '/Pal/Saved/Config/LinuxServer',
        format: palworldFormat,
        schema: palworldSchema,
        stopWarning: true,
        relayGuard: { ipKey: 'PublicIP', portKey: 'PublicPort' },
    },
    {
        gameId: 'minecraft',
        gameName: 'Minecraft',
        fileName: 'server.properties',
        dir: '',
        format: keyvalueFormat,
        schema: minecraftSchema,
    },
    {
        gameId: 'ark',
        gameName: 'ARK: Survival Evolved',
        fileName: 'GameUserSettings.ini',
        dir: ARK_DIR,
        format: arkIni,
        schema: arkGameUserSettingsSchema,
        stopWarning: true,
    },
    {
        gameId: 'ark',
        gameName: 'ARK: Survival Evolved',
        fileName: 'Game.ini',
        dir: ARK_DIR,
        format: arkIni,
        schema: arkGameIniSchema,
        stopWarning: true,
    },
    {
        gameId: 'projectzomboid',
        gameName: 'Project Zomboid',
        fileName: 'servertest.ini',
        dir: '/Zomboid/Server',
        format: keyvalueFormat,
        schema: pzSchema,
        loadHint: PZ_LOAD_HINT,
    },
    {
        // V Rising's game_id on this panel is the game's Steam app id (1604030),
        // NOT the dedicated-server app id. Config is JSON under the persistent
        // data path (we launch with -persistentDataPath ./save-data).
        gameId: '1604030',
        gameName: 'V Rising',
        fileName: 'ServerHostSettings.json',
        dir: '/save-data/Settings',
        format: jsonFormat,
        schema: vrisingHostSchema,
        loadHint: VRISING_LOAD_HINT,
    },
    {
        gameId: '1604030',
        gameName: 'V Rising',
        fileName: 'ServerGameSettings.json',
        dir: '/save-data/Settings',
        format: jsonFormat,
        // No schema: gameplay rules are many and deeply nested - the generic
        // editor renders every key grouped by its JSON section.
        loadHint: VRISING_LOAD_HINT,
    },
    {
        gameId: 'teamspeak3',
        gameName: 'TeamSpeak 3',
        fileName: 'ts3server.ini',
        dir: '',
        format: ts3Ini,
        schema: ts3Schema,
        loadHint: TS3_LOAD_HINT,
    },
    {
        gameId: 'samp',
        gameName: 'GTA: San-Andreas Multiplayer',
        fileName: 'server.cfg',
        dir: '',
        // Unquoted values - see formats/convar.ts sampFormat.
        format: sampFormat,
        schema: sampSchema,
    },
    {
        gameId: '7d2d',
        gameName: '7 Days to Die',
        fileName: 'serverconfig.xml',
        dir: '',
        format: propertyXmlFormat,
        schema: sdtdSchema,
    },
    {
        gameId: 'mta',
        gameName: 'GTA: Multi Theft Auto',
        fileName: 'mtaserver.conf',
        dir: '/mods/deathmatch',
        format: elementXmlFormat,
        schema: mtaSchema,
    },
    {
        gameId: 'the-forest',
        gameName: 'The Forest',
        fileName: 'Server.cfg',
        dir: '',
        format: forestCfg,
        schema: theForestSchema,
        loadHint: FOREST_HINT,
    },
    {
        gameId: 'hurtworld',
        gameName: 'Hurtworld',
        fileName: 'autoexec.cfg',
        dir: '',
        // No schema: only `servername` is well documented, so the generic editor
        // lists whatever the file actually holds rather than inventing keys.
        format: hurtworldCfg,
    },
    {
        gameId: 'rok',
        gameName: 'Reign Of Kings',
        fileName: 'ServerSettings.cfg',
        dir: '/Configuration',
        format: rokCfg,
        schema: rokSchema,
    },
    ...sourceGames,
    ...goldSourceGames,
    ...idTechGames,
    ...armaGames,
];

/** Disk-root-relative full path to a game's config file. */
export function configPath(g: GameConfig): string {
    const dir = g.dir.replace(/\/+$/, '');
    return `${dir}/${g.fileName}`;
}

/** Directory to pass to the file-API `update-file` endpoint (root = '/'). */
export function configDir(g: GameConfig): string {
    const dir = g.dir.replace(/\/+$/, '');
    return dir === '' ? '/' : dir;
}

/** All config entries registered for a game (a game may have several files). */
export function gamesFor(gameId: string | undefined | null): GameConfig[] {
    if (!gameId) return [];
    return games.filter((g) => g.gameId === gameId);
}

/**
 * Resolve one config: prefer a game+file match, else fall back to file name
 * alone.
 *
 * The fallback needs care. Several games can register the same file name
 * (`server.cfg` across the nine Source entries), so with no game to go on we
 * cannot tell which one's curated schema applies - and picking the first would
 * label a TF2 server's config with Counter-Strike fields and the CS2 layering
 * note. The format is shared, so in that case keep the format and drop the
 * game-specific parts: the user gets a correct generic editor instead of a
 * confidently mislabelled one.
 */
export function resolve(gameId: string | undefined | null, fileName: string): GameConfig | undefined {
    return resolveIn(games, gameId, fileName);
}

/** `resolve` against an arbitrary list - exported so the fallback rules are testable. */
export function resolveIn(
    list: GameConfig[],
    gameId: string | undefined | null,
    fileName: string,
): GameConfig | undefined {
    const exact = list.find((g) => g.gameId === gameId && g.fileName === fileName);
    if (exact) return exact;

    const byName = list.filter((g) => g.fileName === fileName);
    if (byName.length <= 1) return byName[0];

    // Several games claim this name. If they do not even agree on the format we
    // must not pick one: `server.cfg` belongs to both SA-MP and the Source
    // family, and they disagree on whether values are quoted - editing a Source
    // config with SA-MP's codec would strip the quotes off every string. Return
    // nothing so the editor falls back to raw text, which cannot corrupt.
    if (new Set(byName.map((g) => g.format.id)).size > 1) return undefined;

    const { schema: _schema, note: _note, ...rest } = byName[0];
    return { ...rest, gameName: fileName };
}
