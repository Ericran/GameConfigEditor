// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import FieldInput from './FieldInput.vue';
import type { ConfigValue, FType } from '../formats/types';

const field = (type: FType, modelValue: ConfigValue, extra: Record<string, unknown> = {}) =>
    mount(FieldInput, { props: { type, modelValue, ...extra } });

describe('FieldInput bool', () => {
    /**
     * The toggle is a restyled checkbox rather than a <button role="switch">.
     * These tests pin the behaviours that choice buys, because a later "let's
     * just use a div" would lose them silently: the config editor wraps this in
     * a <label>, so it has to stay labelable, and it has to stay keyboard- and
     * screen-reader-operable.
     */
    it('is a real checkbox, so a <label> can still drive it', () => {
        const input = field('bool', true).get('input');
        expect(input.attributes('type')).toBe('checkbox');
        expect((input.element as HTMLInputElement).checked).toBe(true);
    });

    it('announces itself as a switch rather than a checkbox', () => {
        expect(field('bool', false).get('input').attributes('role')).toBe('switch');
    });

    it('renders the rail and knob the stylesheet drives', () => {
        // The visuals are real sibling elements styled by unlayered .pws-switch
        // rules, not Tailwind utilities on the input: utilities sit in a cascade
        // layer and the panel's own unlayered `input {...}` outranks them, which
        // is what made an earlier version render as a dead grey box.
        const wrapper = field('bool', false);
        expect(wrapper.find('span.pws-switch').exists()).toBe(true);
        expect(wrapper.find('span.pws-switch__rail').exists()).toBe(true);
        expect(wrapper.find('span.pws-switch__knob').exists()).toBe(true);
        // The rail must follow the input, or `input:checked ~ .rail` never matches.
        const children = Array.from(wrapper.get('span.pws-switch').element.children);
        expect(children.map((el) => el.tagName.toLowerCase())).toEqual(['input', 'span']);
        // Decoration only - a screen reader should hear the input, not the rail.
        expect(wrapper.get('span.pws-switch__rail').attributes('aria-hidden')).toBe('true');
    });

    it('emits the new state when toggled', async () => {
        const wrapper = field('bool', false);
        await wrapper.get('input').setValue(true);
        expect(wrapper.emitted('update:modelValue')).toEqual([[true]]);

        const on = field('bool', true);
        await on.get('input').setValue(false);
        expect(on.emitted('update:modelValue')).toEqual([[false]]);
    });

    it('treats only a real true as on, never a truthy string', () => {
        // Codecs return booleans for 'bool', but a generic field inferred from an
        // unparsed value could hand us text; "false" must not read as on.
        expect((field('bool', 'false' as ConfigValue).get('input').element as HTMLInputElement).checked).toBe(
            false,
        );
        expect((field('bool', 1 as ConfigValue).get('input').element as HTMLInputElement).checked).toBe(false);
    });

    it('is disabled while a save is in flight', () => {
        const input = field('bool', true, { disabled: true }).get('input');
        expect((input.element as HTMLInputElement).disabled).toBe(true);
    });
});

describe('FieldInput other types', () => {
    it('still renders the native control for each remaining type', () => {
        expect(field('text', 'x').get('input').attributes('type')).toBe('text');
        expect(field('raw', 'x').get('input').attributes('type')).toBe('text');
        expect(field('number', 3).get('input').attributes('type')).toBe('number');
        expect(field('select', 'a', { options: ['a', 'b'] }).find('select').exists()).toBe(true);
    });

    it('parses a numeric entry to a number', async () => {
        const wrapper = field('number', 1);
        await wrapper.get('input').setValue('42');
        expect(wrapper.emitted('update:modelValue')).toEqual([[42]]);
    });

    it('emits the raw text rather than NaN when a number field is emptied', async () => {
        // A number input sanitises anything unparseable to '' before the handler
        // sees it, so '' is the case that actually reaches us - and parseFloat('')
        // is NaN. Emitting that would write the literal "NaN" into the config.
        const wrapper = field('number', 1);
        await wrapper.get('input').setValue('');
        const emitted = wrapper.emitted('update:modelValue')!;
        expect(emitted).toEqual([['']]);
        expect(Number.isNaN(emitted[0][0] as number)).toBe(false);
    });
});
