/**
 * Game registry — the single source of truth mapping a GameAP `game_id` to the
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
import { palworldSchema } from './schemas/palworld';
import { minecraftSchema } from './schemas/minecraft';
import { arkGameUserSettingsSchema, arkGameIniSchema } from './schemas/ark';
import { pzSchema } from './schemas/pz';
import { sourceGames } from './source';

// ARK/Unreal INI keys are case-insensitive — match them that way so a schema
// field and a differently-cased file key don't produce a duplicate.
const arkIni = makeIniFormat('ark-ini', { caseInsensitive: true });

const ARK_DIR = '/ShooterGame/Saved/Config/LinuxServer';
const PZ_NOTE =
    'Project Zomboid stores this at $HOME/Zomboid/Server/<servername>.ini. If the tab can’t load it, the path ' +
    'depends on the server’s HOME — browse to the file in the File Manager instead. The filename tracks the ' +
    'configured server name (default servertest).';

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
    /** Warn that the game overwrites this file on shutdown — stop before saving. */
    stopWarning?: boolean;
    /** Relay/public-IP guardrail: warn + one-click clear of these keys. */
    relayGuard?: { ipKey: string; portKey?: string };
    /** Informational note shown as a banner above the form (e.g. CS2 config layering). */
    note?: string;
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
        note: PZ_NOTE,
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
