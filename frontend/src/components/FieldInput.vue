<script setup lang="ts">
/**
 * One form control for one field, picked from the field's type. Used by both the
 * config editor (types from a game schema) and the launch-settings tab (types
 * inferred from what GameAP declares), so the two surfaces stay consistent.
 *
 * Bindings are explicit `:value` + emit rather than v-model on the inner element
 * because props are readonly; the behaviour matches what v-model would do,
 * including `.number`'s "keep the text if it isn't a number" coercion.
 */
import type { ConfigValue, FType } from '../formats/types';

defineProps<{
    modelValue: ConfigValue;
    type: FType;
    options?: string[];
    disabled?: boolean;
}>();

const emit = defineEmits<{ 'update:modelValue': [ConfigValue] }>();

const INPUT_CLASS =
    'rounded border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 px-2 py-1 text-sm outline-none focus:border-sky-500 disabled:opacity-60';

/**
 * Booleans render as a slide toggle matching the switches GameAP uses on its own
 * Settings tab, so a plugin form doesn't look bolted on.
 *
 * The styling lives in styles/main.css as `.pws-switch`, NOT as Tailwind classes
 * here - see the comment there. Short version: utilities are in a cascade layer,
 * the panel's bare `input {...}` rules are not, and unlayered beats layered, so
 * utilities on a checkbox are silently overridden by the host page.
 *
 * The control is still a real `<input type="checkbox">` - transparent and
 * stretched over the rail - rather than a <button role="switch">. That keeps
 * every behaviour a checkbox already has and a button would have to
 * reimplement: it is labelable (so clicking the field's label text toggles it,
 * which a button inside a <label> would not), Space activates it, and
 * `role="switch"` only changes how a screen reader names the state.
 */

/** Same coercion as Vue's own `v-model.number`: keep the text if it isn't numeric. */
function toNumber(raw: string): ConfigValue {
    const n = parseFloat(raw);
    return isNaN(n) ? raw : n;
}

const target = (e: Event) => e.target as HTMLInputElement;
</script>

<template>
    <span v-if="type === 'bool'" class="pws-switch">
        <input
            type="checkbox"
            role="switch"
            :checked="modelValue === true"
            :disabled="disabled"
            @change="emit('update:modelValue', target($event).checked)"
        />
        <span class="pws-switch__rail" aria-hidden="true">
            <span class="pws-switch__knob"></span>
        </span>
    </span>
    <select
        v-else-if="type === 'select'"
        :value="modelValue"
        :class="INPUT_CLASS"
        :disabled="disabled"
        @change="emit('update:modelValue', target($event).value)"
    >
        <option v-for="o in options" :key="o" :value="o">{{ o }}</option>
    </select>
    <input
        v-else-if="type === 'number'"
        type="number"
        step="any"
        :value="modelValue"
        :class="INPUT_CLASS"
        :disabled="disabled"
        @input="emit('update:modelValue', toNumber(target($event).value))"
    />
    <input
        v-else
        type="text"
        :value="modelValue"
        :class="INPUT_CLASS"
        :disabled="disabled"
        @input="emit('update:modelValue', target($event).value)"
    />
</template>
