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
import { keyvalueFormat } from '../formats/keyvalue';
import { makeIniFormat } from '../formats/ini';
import { jsonFormat } from '../formats/json';
import { palworldSchema } from './schemas/palworld';
import { minecraftSchema } from './schemas/minecraft';
import { arkGameUserSettingsSchema, arkGameIniSchema } from './schemas/ark';
import { pzSchema } from './schemas/pz';
import { vrisingHostSchema } from './schemas/vrising';
import { sourceGames } from './source';

// ARK/Unreal INI keys are case-insensitive - match them that way so a schema
// field and a differently-cased file key don't produce a duplicate.
const arkIni = makeIniFormat('ark-ini', { caseInsensitive: true });

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
    ...sourceGames,
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

/** Resolve one config: prefer a game+file match, else fall back to file name alone. */
export function resolve(gameId: string | undefined | null, fileName: string): GameConfig | undefined {
    return (
        games.find((g) => g.gameId === gameId && g.fileName === fileName) ??
        games.find((g) => g.fileName === fileName)
    );
}
