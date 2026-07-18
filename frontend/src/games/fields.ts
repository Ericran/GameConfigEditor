/** Terse constructors for authoring per-game schemas. */
import type { FieldDef } from '../formats/types';

export const n = (key: string, label: string): FieldDef => ({ key, label, type: 'number' });
export const b = (key: string, label: string): FieldDef => ({ key, label, type: 'bool' });
export const t = (key: string, label: string): FieldDef => ({ key, label, type: 'text' });
export const raw = (key: string, label: string): FieldDef => ({ key, label, type: 'raw' });
export const sel = (key: string, label: string, options: string[]): FieldDef => ({
    key,
    label,
    type: 'select',
    options,
});
