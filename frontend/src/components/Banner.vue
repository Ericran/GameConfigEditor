<script setup lang="ts">
/**
 * The callout box used for every notice, warning and error in the plugin.
 *
 * Tones are named by intent, not colour. Callers add their own margin (the tabs
 * space banners with `m-2`; the editor lays them out in a flow container), which
 * works because Vue merges a `class` attribute onto the single root element.
 *
 * The `action` slot is for an inline button (Retry, Clear public IP); `detail`
 * is for secondary text below the message, e.g. a game's load hint.
 */
type Tone = 'info' | 'success' | 'warning' | 'caution' | 'danger';

defineProps<{ tone: Tone; icon: string }>();

// Full class strings, written out so Tailwind's scanner sees them.
const TONES: Record<Tone, string> = {
    info: 'border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-900/20 dark:text-sky-300',
    success:
        'border-lime-300 bg-lime-50 text-lime-800 dark:border-lime-800 dark:bg-lime-900/20 dark:text-lime-300',
    warning: 'border-orange-400 bg-orange-50 text-orange-800 dark:bg-orange-900/20 dark:text-orange-300',
    caution: 'border-amber-400 bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300',
    danger: 'border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300',
};
</script>

<template>
    <div class="rounded-md border px-3 py-2" :class="TONES[tone]">
        <div class="flex items-center justify-between gap-3">
            <span><i :class="icon" class="mr-1"></i><slot /></span>
            <slot name="action" />
        </div>
        <slot name="detail" />
    </div>
</template>
