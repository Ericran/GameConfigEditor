<script setup lang="ts">
import { ref, computed } from 'vue';
import type { FileEditorProps } from '@gameap/plugin-sdk';
import { useServer } from '@gameap/plugin-sdk';
import type { FieldDef, FType, Group } from '../formats/types';
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
 * editor resolves it from the server's `game_id` + the file name instead.
 */
const props = defineProps<FileEditorProps & { embedded?: boolean; game?: GameConfig }>();
const emit = defineEmits<{ save: [content: string]; close: [] }>();

// ---- server context (best-effort) ----
let serverRef: any = null;
try {
    serverRef = useServer();
} catch {
    serverRef = null;
}
const serverRunning = computed(
    () => !!(serverRef?.value?.data?.process_active ?? serverRef?.value?.process_active),
);
const serverGameId: string | undefined = serverRef?.value?.data?.game_id ?? serverRef?.value?.game_id;

// ---- resolve which game/config this is ----
const game: GameConfig | undefined = props.game ?? resolve(serverGameId, props.fileName);
const codec = game?.format.codec;

// ---- parse ----
const contentText =
    typeof props.content === 'string' ? props.content : new TextDecoder().decode(props.content as ArrayBuffer);
const rawText = ref(contentText);
const dirty = ref(false);
const rev = ref(0); // reactivity token: bumped on every doc mutation

const doc = game ? game.format.parse(contentText) : null;
const parseFailed = ref(!doc);

// ---- schema + inferred (unknown-key) groups ----
const schema: Group[] = game?.schema ?? [];
const schemaKeys = new Set(schema.flatMap((g) => g.fields.map((f) => f.key)));

function inferType(raw: string): FType {
    const s = raw.trim();
    if (/^(true|false)$/i.test(s)) return 'bool';
    if (/^-?\d+(\.\d+)?$/.test(s)) return 'number';
    return 'raw';
}

const norm = doc?.normKey ? (a: string) => doc.normKey!(a) : (a: string) => a;
const schemaKeysNorm = new Set([...schemaKeys].map(norm));

const inferredGroups: Group[] = [];
if (doc) {
    const bySection = new Map<string, FieldDef[]>();
    for (const key of doc.keys()) {
        if (schemaKeysNorm.has(norm(key))) continue;
        const section = doc.sectionOf(key);
        const arr = bySection.get(section) ?? [];
        arr.push({ key, label: doc.labelOf(key), type: inferType(doc.getRaw(key) ?? '') });
        bySection.set(section, arr);
    }
    for (const [section, fields] of bySection) {
        inferredGroups.push({
            id: section ? `section:${section}` : 'advanced',
            title: section || 'Advanced',
            icon: section ? 'fa-solid fa-folder' : 'fa-solid fa-gear',
            fields,
        });
    }
}

// ---- reactive models over the doc, via the format's codec ----
const models: Record<string, any> = {};
function buildModel(f: FieldDef) {
    if (models[f.key] || !doc || !codec) return;
    models[f.key] = computed({
        get: () => {
            void rev.value; // track doc mutations
            return codec.fromRaw(doc.getRaw(f.key), f.type);
        },
        set: (v: any) => {
            doc.setRaw(f.key, codec.toRaw(v, f.type));
            rev.value++;
            dirty.value = true;
        },
    });
}
for (const g of schema) for (const f of g.fields) buildModel(f);
for (const g of inferredGroups) for (const f of g.fields) buildModel(f);

const renderGroups = computed<Group[]>(() => [...schema.filter((g) => g.fields.length), ...inferredGroups]);

// ---- relay guardrail (generic; e.g. Palworld PublicIP behind a WireGuard relay) ----
const relayIpSet = computed(() => {
    void rev.value;
    if (!game?.relayGuard || !doc || !codec) return false;
    const v = codec.fromRaw(doc.getRaw(game.relayGuard.ipKey), 'text');
    return typeof v === 'string' && v.trim().length > 0;
});
function clearRelay() {
    if (!game?.relayGuard || !doc || !codec) return;
    const { ipKey, portKey } = game.relayGuard;
    if (doc.has(ipKey)) doc.setRaw(ipKey, codec.toRaw('', 'text'));
    if (portKey && doc.has(portKey)) doc.setRaw(portKey, '');
    rev.value++;
    dirty.value = true;
}

// ---- actions ----
function onSave() {
    emit('save', parseFailed.value || !doc ? rawText.value : doc.serialize());
    dirty.value = false;
}
function onClose() {
    emit('close');
}
defineExpose({ save: onSave, close: onClose });

const noGame = !game;
const title = game?.gameName ?? props.fileName;
const note = game?.note;
const inputClass =
    'rounded border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 px-2 py-1 text-sm outline-none focus:border-sky-500';
</script>

<template>
    <div class="pws-root flex flex-col h-full max-h-full text-sm text-stone-800 dark:text-stone-200">
        <!-- running-server warning -->
        <div
            v-if="serverRunning"
            class="m-2 rounded-md border border-orange-400 bg-orange-50 px-3 py-2 text-orange-800 dark:bg-orange-900/20 dark:text-orange-300"
        >
            <i class="fa-solid fa-triangle-exclamation mr-1"></i>
            <template v-if="game?.stopWarning"
                >This server appears to be RUNNING. {{ title }} overwrites this file on shutdown, so stop the
                server before saving or your changes will be lost.</template
            >
            <template v-else
                >This server appears to be RUNNING. Some games only read this file at startup — restart the
                server for changes to take effect.</template
            >
        </div>

        <!-- raw fallback -->
        <div v-if="parseFailed" class="flex-1 flex flex-col p-2 gap-2 min-h-0">
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
                class="flex-1 w-full font-mono text-xs p-2 rounded border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 outline-none"
                @input="dirty = true"
            ></textarea>
        </div>

        <!-- structured form -->
        <div v-else class="flex-1 overflow-auto p-3 space-y-6 min-h-0">
            <!-- informational note (e.g. CS2 config layering) -->
            <div
                v-if="note"
                class="rounded-md border border-sky-300 bg-sky-50 px-3 py-2 text-sky-800 dark:border-sky-800 dark:bg-sky-900/20 dark:text-sky-300"
            >
                <i class="fa-solid fa-circle-info mr-1"></i>{{ note }}
            </div>

            <!-- relay guardrail -->
            <div
                v-if="relayIpSet"
                class="rounded-md border border-amber-400 bg-amber-50 px-3 py-2 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300 flex items-center justify-between gap-3"
            >
                <span
                    ><i class="fa-solid fa-shield-halved mr-1"></i>A public IP is set. For a WireGuard relay or an
                    unlisted server this advertises your real IP to the community browser. Clear it unless you
                    intend to be publicly listed.</span
                >
                <button
                    class="shrink-0 rounded bg-amber-600 px-2 py-1 text-white text-xs hover:bg-amber-700"
                    @click="clearRelay"
                >
                    Clear public IP{{ game?.relayGuard?.portKey ? ' &amp; port' : '' }}
                </button>
            </div>

            <section v-for="group in renderGroups" :key="group.id">
                <h3 class="font-semibold text-stone-600 dark:text-stone-400 mb-2 flex items-center gap-2">
                    <i :class="group.icon"></i>{{ group.title }}
                </h3>
                <p v-if="group.id === 'advanced'" class="mb-2 text-xs text-stone-400">
                    Keys not in the schema — edited as raw values, preserved verbatim.
                </p>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
                    <label v-for="f in group.fields" :key="f.key" class="flex flex-col gap-1">
                        <span class="text-xs text-stone-500 dark:text-stone-400">
                            {{ f.label }} <code class="opacity-60">{{ f.key }}</code>
                        </span>
                        <input v-if="f.type === 'bool'" v-model="models[f.key].value" type="checkbox" class="w-4 h-4" />
                        <select v-else-if="f.type === 'select'" v-model="models[f.key].value" :class="inputClass">
                            <option v-for="o in f.options" :key="o" :value="o">{{ o }}</option>
                        </select>
                        <input
                            v-else-if="f.type === 'number'"
                            v-model.number="models[f.key].value"
                            type="number"
                            step="any"
                            :class="inputClass"
                        />
                        <input v-else v-model="models[f.key].value" type="text" :class="inputClass" />
                    </label>
                </div>
            </section>
        </div>

        <!-- footer -->
        <div class="border-t border-stone-200 dark:border-stone-700 p-2 flex items-center justify-end gap-2">
            <button
                v-if="!embedded"
                class="rounded px-3 py-1 text-sm text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800"
                @click="onClose"
            >
                Close
            </button>
            <button
                class="rounded bg-sky-600 px-3 py-1 text-sm text-white hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed"
                :disabled="!dirty"
                @click="onSave"
            >
                Save
            </button>
        </div>
    </div>
</template>
