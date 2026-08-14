<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import type { ComputedRef } from 'vue';
import type { FileEditorProps, ServerData } from '@gameap/plugin-sdk';
import { useServer } from '@gameap/plugin-sdk';
import Banner from './Banner.vue';
import FieldInput from './FieldInput.vue';
import { useConfigForm } from '../composables/useConfigForm';
import { resolve, type GameConfig } from '../games/registry';

/**
 * Generic, format-driven config editor.
 *
 * It resolves the current server's game to a `GameConfig` (format + optional
 * schema), parses the file text into a round-trippable `ConfigDoc`, and renders
 * a form: curated schema fields first, then every remaining key generically
 * (grouped by section, types inferred) so nothing is ever hidden. On save it
 * re-serializes the doc, preserving untouched keys and formatting. If the text
 * can't be parsed (or no game matches), it falls back to a raw text editor.
 *
 * `game` is passed explicitly when hosted in the server tab; the file-manager
 * editor resolves it from the server's game code + the file name instead.
 * Building the form itself lives in useConfigForm.
 */
const props = defineProps<FileEditorProps & { embedded?: boolean; game?: GameConfig; saving?: boolean }>();
const emit = defineEmits<{ save: [content: string]; close: []; 'dirty-change': [dirty: boolean] }>();

// ---- server context (best-effort) ----
// useServer() throws when this is mounted outside a plugin host context, so
// probe it defensively - but keep the SDK's type. ServerData is flat:
// process_active and game_id are top-level fields.
let serverRef: ComputedRef<ServerData | null> | null = null;
try {
    serverRef = useServer();
} catch {
    serverRef = null;
}
// Deliberately truthy rather than `=== true`: the panel may serialise this as
// 1/0, and under-reporting a running server would drop the lost-edits warning.
const serverRunning = computed(() => !!serverRef?.value?.process_active);

// ---- resolve which game/config this is ----
// The panel hands a file editor the server's game code as a prop, available
// synchronously at setup - unlike useServer(), whose ref can still be null this
// tick. Preferring the prop keeps us from falling through to file-name-only
// resolution and labelling the form with another game's schema.
const gameCode = props.gameCode ?? serverRef?.value?.game_id;
const game: GameConfig | undefined = props.game ?? resolve(gameCode, props.fileName);
const codec = game?.format.codec;

// ---- parse ----
const contentText =
    typeof props.content === 'string' ? props.content : new TextDecoder().decode(props.content as ArrayBuffer);
const rawText = ref(contentText);
const doc = game ? game.format.parse(contentText) : null;
const parseFailed = !doc;

// ---- form ----
const form = doc && codec ? useConfigForm(doc, game?.schema ?? [], codec) : null;
const groups = computed(() => form?.groups.value ?? []);
const models = form?.models ?? {};
const writeError = computed(() => form?.writeError.value ?? null);
const relayError = ref<string | null>(null);

// The raw-text fallback tracks its own edits; otherwise the form owns `dirty`.
const rawDirty = ref(false);
const dirty = computed(() => form?.dirty.value ?? rawDirty.value);
watch(dirty, (value) => emit('dirty-change', value));

// ---- relay guardrail (generic; e.g. Palworld PublicIP behind a WireGuard relay) ----
const relayIpSet = computed(() => {
    if (!game?.relayGuard || !form || !codec) return false;
    const v = codec.fromRaw(form.raw(game.relayGuard.ipKey), 'text');
    return typeof v === 'string' && v.trim().length > 0;
});
function clearRelay() {
    if (props.saving || !game?.relayGuard || !doc || !form) return;
    relayError.value = null;
    const { ipKey, portKey } = game.relayGuard;
    // Removing the keys lets the game apply valid defaults. Writing an empty
    // numeric port (PublicPort=) can make Palworld reject/reset the config.
    const keys = [ipKey, ...(portKey ? [portKey] : [])].filter((key) => doc.has(key));
    if (!doc.removeMany || !doc.removeMany(keys)) {
        relayError.value = 'The public relay setting could not be removed safely; the document was not marked ready to save.';
        return;
    }
    form.touch();
}

// ---- actions ----
function onSave() {
    if (props.saving) return;
    // The parent owns persistence. Keep this document dirty until acknowledgement:
    // GameConfigTab remounts with the re-read server copy, while GameAP's
    // PluginEditorModal closes this standalone editor only after upload success.
    // On failure the host leaves it mounted, so clearing here would strand the draft.
    emit('save', doc ? doc.serialize() : rawText.value);
}
function onClose() {
    emit('close');
}
defineExpose({ save: onSave, close: onClose });

const noGame = !game;
const title = game?.gameName ?? props.fileName;
const note = game?.note;
</script>

<template>
    <!--
      Height handling differs by host. GameAP's PluginEditorModal gives this a
      bounded box, so the body scrolls internally and the footer pins. A server
      tab does not: the panel renders plugin tabs in an n-tab-pane with no
      height, so `h-full` resolves against an indefinite parent, collapses to
      auto, and the footer lands at the bottom of a ~3000px page - out of reach.
      Embedded therefore flows at natural height and lets the PAGE scroll, with
      a sticky footer so Save rides along.
    -->
    <div
        class="pws-root flex flex-col text-sm text-stone-800 dark:text-stone-200"
        :class="embedded ? '' : 'h-full max-h-full'"
    >
        <!-- running-server warning -->
        <Banner v-if="serverRunning" class="m-2" tone="warning" icon="fa-solid fa-triangle-exclamation">
            <template v-if="game?.stopWarning"
                >This server appears to be RUNNING. {{ title }} overwrites this file on shutdown, so stop the server
                before saving or your changes will be lost.</template
            >
            <template v-else
                >This server appears to be RUNNING. Some games only read this file at startup - restart the server
                for changes to take effect.</template
            >
        </Banner>

        <!-- raw fallback -->
        <div v-if="parseFailed" class="flex flex-col p-2 gap-2" :class="embedded ? '' : 'flex-1 min-h-0'">
            <div class="text-red-600 dark:text-red-400 text-xs">
                <template v-if="noGame"
                    >No structured editor is registered for this file. Editing raw text instead.</template
                >
                <template v-else
                    >Could not parse {{ props.fileName }} in the expected format. Editing raw text instead.</template
                >
            </div>
            <textarea
                v-model="rawText"
                spellcheck="false"
                class="w-full font-mono text-xs p-2 rounded border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 outline-none disabled:opacity-60"
                :class="embedded ? 'min-h-[60vh]' : 'flex-1'"
                :disabled="saving"
                @input="rawDirty = true"
            ></textarea>
        </div>

        <!-- structured form -->
        <div v-else class="p-3 space-y-6" :class="embedded ? '' : 'flex-1 overflow-auto min-h-0'">
            <!-- informational note (e.g. CS2 config layering) -->
            <Banner v-if="note" tone="info" icon="fa-solid fa-circle-info">{{ note }}</Banner>

            <!-- structured write failure -->
            <Banner v-if="writeError" tone="warning" icon="fa-solid fa-triangle-exclamation">
                {{ writeError }}
            </Banner>
            <Banner v-if="relayError" tone="warning" icon="fa-solid fa-triangle-exclamation">
                {{ relayError }}
            </Banner>

            <!-- relay guardrail -->
            <Banner v-if="relayIpSet" tone="caution" icon="fa-solid fa-shield-halved">
                A public IP is set. For a WireGuard relay or an unlisted server this advertises your real IP to the
                community browser. Clear it unless you intend to be publicly listed.
                <template #action>
                    <button
                        :disabled="saving"
                        class="shrink-0 rounded bg-amber-600 px-2 py-1 text-white text-xs hover:bg-amber-700 disabled:opacity-50"
                        @click="clearRelay"
                    >
                        Clear public IP{{ game?.relayGuard?.portKey ? ' &amp; port' : '' }}
                    </button>
                </template>
            </Banner>

            <section v-for="group in groups" :key="group.id">
                <h3 class="font-semibold text-stone-600 dark:text-stone-400 mb-2 flex items-center gap-2">
                    <i :class="group.icon"></i>{{ group.title }}
                </h3>
                <p v-if="group.id === 'advanced'" class="mb-2 text-xs text-stone-400">
                    Keys not in the schema - edited as raw values, preserved verbatim.
                </p>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
                    <label v-for="f in group.fields" :key="f.key" class="flex flex-col gap-1">
                        <span class="text-xs text-stone-500 dark:text-stone-400">
                            {{ f.label }} <code class="opacity-60">{{ f.key }}</code>
                        </span>
                        <FieldInput
                            v-model="models[f.key].value"
                            :type="f.type"
                            :options="f.options"
                            :disabled="saving"
                        />
                    </label>
                </div>
            </section>
        </div>

        <!-- footer: sticky when embedded, so Save stays on screen while the page
             scrolls through a long schema (Palworld alone is ~95 fields). -->
        <div
            class="shrink-0 border-t border-stone-200 dark:border-stone-700 p-2 flex items-center justify-end gap-2"
            :class="embedded ? 'sticky bottom-0 z-10 bg-white dark:bg-stone-900' : ''"
        >
            <span v-if="dirty" class="mr-auto text-xs text-amber-600 dark:text-amber-400">
                <i class="fa-solid fa-pen mr-1"></i>Unsaved changes
            </span>
            <button
                v-if="!embedded"
                class="rounded px-3 py-1 text-sm text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800"
                @click="onClose"
            >
                Close
            </button>
            <button
                class="rounded bg-sky-600 px-3 py-1 text-sm text-white hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed"
                :disabled="!dirty || saving"
                @click="onSave"
            >
                Save
            </button>
        </div>
    </div>
</template>
