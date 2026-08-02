/**
 * Scaffolding for game families - groups of games that read the same file
 * through the same parser and differ only in mod folder, schema and the odd
 * per-game note.
 *
 * This is deliberately only the mechanism, never the content. Families keep
 * their own schemas even where those schemas currently look alike: goldsource.ts
 * omits Source-only convars on purpose, and folding the two lists together would
 * start offering settings the engine silently ignores.
 */
import type { Format, Group, Schema } from '../formats/types';
import type { GameConfig } from './registry';

/**
 * A family's shared groups plus at most one game-specific group. An unknown or
 * absent key yields the shared groups alone.
 */
export function withExtras(
    shared: Group[],
    extras: Record<string, Group>,
    key: string | null | undefined,
): Schema {
    return key && extras[key] ? [...shared, extras[key]] : shared;
}

/** One game in a family - only what varies between members. */
export interface FamilyMember {
    gameId: string;
    gameName: string;
    /** Config directory, disk-root-relative. Falls back to the family's `dir`. */
    dir?: string;
    schema: Schema;
    /** Banner shown above the form on successful load. */
    note?: string;
}

/** What every member of a family has in common. */
export interface FamilyDefaults {
    fileName: string;
    format: Format;
    /** Directory for members that don't set their own. */
    dir?: string;
    /** Error-banner guidance for engines that resolve their own config path. */
    loadHint?: string;
}

/**
 * Expand a family into registry entries. Optional keys are omitted rather than
 * set to undefined, so entries match hand-written ones in the main registry.
 */
export function family(defaults: FamilyDefaults, members: FamilyMember[]): GameConfig[] {
    return members.map((m) => ({
        gameId: m.gameId,
        gameName: m.gameName,
        fileName: defaults.fileName,
        dir: m.dir ?? defaults.dir ?? '',
        format: defaults.format,
        schema: m.schema,
        ...(m.note !== undefined && { note: m.note }),
        ...(defaults.loadHint !== undefined && { loadHint: defaults.loadHint }),
    }));
}
