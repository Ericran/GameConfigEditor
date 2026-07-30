/**
 * Format layer - the contract every config format implements.
 *
 * A GameAP server config can be a Palworld one-liner, a flat key=value file, a
 * multi-section INI, a Source `server.cfg`, etc. Each of those is a `Format`
 * that knows how to (a) parse text into a round-trippable `ConfigDoc`, and (b)
 * convert typed form values to/from that format's raw on-disk spelling (its
 * `Codec` - e.g. booleans are `True`/`False` in Palworld/INI but `true`/`false`
 * in Minecraft and `1`/`0` in Source convars).
 *
 * The editor component is format-agnostic: it drives a `ConfigDoc` through a
 * `Codec`, guided by a per-game field `Schema`. Everything game- or
 * format-specific lives behind these interfaces.
 */

export type FType = 'text' | 'number' | 'bool' | 'select' | 'raw';

/**
 * A typed form value. Every `FType` reduces to one of these three: `bool` is a
 * boolean, `number` is a number (or the original string when the file holds
 * something unparseable), and the rest are strings.
 */
export type ConfigValue = string | number | boolean;

export interface FieldDef {
    /** Address the owning ConfigDoc understands (see ConfigDoc.getRaw). */
    key: string;
    label: string;
    type: FType;
    options?: string[];
    help?: string;
}

export interface Group {
    id: string;
    title: string;
    icon: string;
    fields: FieldDef[];
}

/** A curated, human-labelled schema is just an ordered list of groups. */
export type Schema = Group[];

/**
 * A parsed config document that applies edits in place and re-serializes,
 * preserving every byte it wasn't asked to change (comments, ordering,
 * untouched keys, surrounding structure).
 *
 * An "address" is the canonical string used to read/write one value. For flat
 * formats it's just the key; for sectioned formats (INI) it's `section\0key`
 * built by the format - callers only ever pass addresses that came from a
 * schema `FieldDef.key` or from `keys()`, never ones they construct by hand.
 */
export interface ConfigDoc {
    /** Ordered addresses actually present in the file. */
    keys(): string[];
    has(address: string): boolean;
    getRaw(address: string): string | undefined;
    /** Set (creating the entry if absent). */
    setRaw(address: string, rawValue: string): void;
    /** Remove an entry entirely (used by guardrails that clear a value). */
    remove(address: string): void;
    /** Section label for grouping unknown keys; '' when the format is flat. */
    sectionOf(address: string): string;
    /** Human display key (last path segment) for an address. */
    labelOf(address: string): string;
    /**
     * Normalise an address for equality comparison (default: identity). INI
     * with case-insensitive keys returns a lowercased form so a schema field
     * and a differently-cased file key are recognised as the same entry rather
     * than duplicated.
     */
    normKey?(address: string): string;
    serialize(): string;
}

/** Typed form value <-> raw on-disk string, per this format's conventions. */
export interface Codec {
    fromRaw(raw: string | undefined, type: FType): ConfigValue;
    toRaw(v: ConfigValue, type: FType): string;
}

export interface Format {
    id: string;
    codec: Codec;
    /**
     * Parse `text` into a ConfigDoc, or return null if the text doesn't fit
     * this format's expected shape (the editor then falls back to raw text).
     */
    parse(text: string): ConfigDoc | null;
}
