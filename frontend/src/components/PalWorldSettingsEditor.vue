<script setup lang="ts">
import { reactive, ref, computed } from 'vue';
import type { FileEditorProps } from '@gameap/plugin-sdk';
import { useServer } from '@gameap/plugin-sdk';

/**
 * PalWorldSettings.ini editor.
 *
 * The whole file is a header line plus one giant `OptionSettings=(k=v,k=v,...)`
 * line. We parse that inner list into a key->raw-value map, render a form for a
 * curated subset, and re-serialize on save preserving every other key and its
 * original formatting. Because we always regenerate the one-line structure, the
 * classic "a stray newline breaks the parser" failure mode is impossible here.
 */

const props = defineProps<FileEditorProps>();
const emit = defineEmits<{ save: [content: string]; close: [] }>();

// ---- i18n (kept local; no runtime dependency on the panel's i18n) ----
const en: Record<string, string> = {
    server_running_warning:
        'This server appears to be RUNNING. Palworld overwrites this file on shutdown, so stop the server before saving or your changes will be lost.',
    parse_failed:
        'Could not locate an OptionSettings=(...) block. Editing raw text instead.',
    group_identity: 'Identity',
    group_players: 'Players & World',
    group_rates: 'Rates',
    group_relay: 'Networking / Relay',
    relay_publicip_warning:
        'PublicIP is set. For a WireGuard relay or an unlisted server this advertises your real IP to the community browser. Clear it unless you intend to be publicly listed.',
    clear_public: 'Clear PublicIP & PublicPort',
    save: 'Save',
    close: 'Close',
    unknown_keys: 'other settings preserved unchanged',
};
const trans = (k: string) => en[k] ?? k;

// ---- server-running detection (best-effort) ----
let serverRef: any = null;
try {
    serverRef = useServer();
} catch {
    serverRef = null;
}
const serverRunning = computed(
    () => !!(serverRef?.value?.data?.process_active ?? serverRef?.value?.process_active),
);

// ---- parse state ----
type FType = 'text' | 'number' | 'bool' | 'select';

const values = reactive<Record<string, string>>({}); // key -> raw value (as in file)
const keyOrder = ref<string[]>([]);
let before = '';
let after = '';
const parseFailed = ref(false);
const rawText = ref('');
const dirty = ref(false);

function splitTopLevel(s: string): string[] {
    const out: string[] = [];
    let depth = 0;
    let inQ = false;
    let cur = '';
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (c === '"') {
            inQ = !inQ;
            cur += c;
            continue;
        }
        if (!inQ) {
            if (c === '(') depth++;
            else if (c === ')') depth--;
            else if (c === ',' && depth === 0) {
                out.push(cur);
                cur = '';
                continue;
            }
        }
        cur += c;
    }
    if (cur.length) out.push(cur);
    return out;
}

function parse(text: string) {
    rawText.value = text;
    const marker = 'OptionSettings=(';
    const start = text.indexOf(marker);
    const close = text.lastIndexOf(')');
    if (start === -1 || close <= start + marker.length) {
        parseFailed.value = true;
        return;
    }
    const open = start + marker.length;
    before = text.slice(0, open);
    after = text.slice(close); // keeps the closing ')' + any trailing newline
    const inner = text.slice(open, close);
    for (const part of splitTopLevel(inner)) {
        const eq = part.indexOf('=');
        if (eq === -1) continue;
        const k = part.slice(0, eq).trim();
        const v = part.slice(eq + 1);
        if (!(k in values)) keyOrder.value.push(k);
        values[k] = v;
    }
}

function serialize(): string {
    const body = keyOrder.value.map((k) => `${k}=${values[k]}`).join(',');
    return before + body + after;
}

// ---- raw <-> typed conversion ----
function fromRaw(raw: string | undefined, type: FType): any {
    if (raw === undefined) return type === 'bool' ? false : type === 'number' ? 0 : '';
    if (type === 'bool') return raw.trim().toLowerCase() === 'true';
    if (type === 'number') {
        const n = Number(raw);
        return Number.isNaN(n) ? raw : n;
    }
    if (type === 'text') {
        const m = raw.match(/^"([\s\S]*)"$/);
        return m ? m[1] : raw;
    }
    return raw.trim(); // select / enum: bare token
}

function toRaw(v: any, type: FType): string {
    if (type === 'bool') return v ? 'True' : 'False';
    if (type === 'number') return String(v);
    if (type === 'text') return `"${String(v)}"`;
    return String(v); // select / enum stays bare
}

// ---- field schema ----
interface FieldDef {
    key: string;
    label: string;
    type: FType;
    options?: string[];
    help?: string;
}
interface Group {
    name: string;
    icon: string;
    fields: FieldDef[];
}

const groups: Group[] = [
    {
        name: 'group_identity',
        icon: 'fa-solid fa-id-card',
        fields: [
            { key: 'ServerName', label: 'Server name', type: 'text' },
            { key: 'ServerDescription', label: 'Description', type: 'text' },
            { key: 'ServerPassword', label: 'Server password', type: 'text', help: 'Join password' },
            { key: 'AdminPassword', label: 'Admin password', type: 'text' },
        ],
    },
    {
        name: 'group_players',
        icon: 'fa-solid fa-users',
        fields: [
            { key: 'ServerPlayerMaxNum', label: 'Max players', type: 'number' },
            { key: 'Difficulty', label: 'Difficulty', type: 'select', options: ['None', 'Casual', 'Normal', 'Hard'] },
            { key: 'DeathPenalty', label: 'Death penalty', type: 'select', options: ['none', 'Item', 'ItemAndEquipment', 'All'] },
            { key: 'bIsPvP', label: 'PvP', type: 'bool' },
            { key: 'bEnablePlayerToPlayerDamage', label: 'Player-to-player damage', type: 'bool' },
        ],
    },
    {
        name: 'group_rates',
        icon: 'fa-solid fa-gauge-high',
        fields: [
            { key: 'ExpRate', label: 'EXP rate', type: 'number' },
            { key: 'PalCaptureRate', label: 'Capture rate', type: 'number' },
            { key: 'CollectionDropRate', label: 'Gathering rate', type: 'number' },
        ],
    },
];

const relayFields: FieldDef[] = [
    { key: 'PublicIP', label: 'Public IP', type: 'text', help: 'Leave empty behind a relay' },
    { key: 'PublicPort', label: 'Public port', type: 'number' },
];

// ---- reactive models (writable computeds over `values`) ----
const models: Record<string, any> = {};
for (const f of [...groups.flatMap((g) => g.fields), ...relayFields]) {
    models[f.key] = computed({
        get: () => fromRaw(values[f.key], f.type),
        set: (v: any) => {
            if (!(f.key in values)) keyOrder.value.push(f.key);
            values[f.key] = toRaw(v, f.type);
            dirty.value = true;
        },
    });
}

const publicIpSet = computed(() => {
    const v = fromRaw(values['PublicIP'], 'text');
    return typeof v === 'string' && v.trim().length > 0;
});

function clearPublic() {
    if ('PublicIP' in values) {
        values['PublicIP'] = '""';
        dirty.value = true;
    }
    if ('PublicPort' in values) {
        values['PublicPort'] = '';
        dirty.value = true;
    }
}

const knownKeyCount = computed(() => {
    const known = new Set([...groups.flatMap((g) => g.fields.map((f) => f.key)), ...relayFields.map((f) => f.key)]);
    return keyOrder.value.filter((k) => !known.has(k)).length;
});

// ---- actions ----
function onSave() {
    emit('save', parseFailed.value ? rawText.value : serialize());
    dirty.value = false;
}
function onClose() {
    emit('close');
}
defineExpose({ save: onSave, close: onClose });

// initial parse
parse(typeof props.content === 'string' ? props.content : new TextDecoder().decode(props.content as ArrayBuffer));

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
            <i class="fa-solid fa-triangle-exclamation mr-1"></i>{{ trans('server_running_warning') }}
        </div>

        <!-- raw fallback -->
        <div v-if="parseFailed" class="flex-1 flex flex-col p-2 gap-2 min-h-0">
            <div class="text-red-600 dark:text-red-400 text-xs">{{ trans('parse_failed') }}</div>
            <textarea
                v-model="rawText"
                spellcheck="false"
                class="flex-1 w-full font-mono text-xs p-2 rounded border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 outline-none"
                @input="dirty = true"
            ></textarea>
        </div>

        <!-- structured form -->
        <div v-else class="flex-1 overflow-auto p-3 space-y-6 min-h-0">
            <section v-for="group in groups" :key="group.name">
                <h3 class="font-semibold text-stone-600 dark:text-stone-400 mb-2 flex items-center gap-2">
                    <i :class="group.icon"></i>{{ trans(group.name) }}
                </h3>
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
                        <span v-if="f.help" class="text-xs text-stone-400">{{ f.help }}</span>
                    </label>
                </div>
            </section>

            <!-- relay / networking -->
            <section>
                <h3 class="font-semibold text-stone-600 dark:text-stone-400 mb-2 flex items-center gap-2">
                    <i class="fa-solid fa-network-wired"></i>{{ trans('group_relay') }}
                </h3>
                <div
                    v-if="publicIpSet"
                    class="mb-3 rounded-md border border-amber-400 bg-amber-50 px-3 py-2 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300 flex items-center justify-between gap-3"
                >
                    <span><i class="fa-solid fa-shield-halved mr-1"></i>{{ trans('relay_publicip_warning') }}</span>
                    <button
                        class="shrink-0 rounded bg-amber-600 px-2 py-1 text-white text-xs hover:bg-amber-700"
                        @click="clearPublic"
                    >
                        {{ trans('clear_public') }}
                    </button>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
                    <label v-for="f in relayFields" :key="f.key" class="flex flex-col gap-1">
                        <span class="text-xs text-stone-500 dark:text-stone-400">
                            {{ f.label }} <code class="opacity-60">{{ f.key }}</code>
                        </span>
                        <input
                            v-if="f.type === 'number'"
                            v-model.number="models[f.key].value"
                            type="number"
                            step="any"
                            :class="inputClass"
                        />
                        <input v-else v-model="models[f.key].value" type="text" :class="inputClass" />
                        <span v-if="f.help" class="text-xs text-stone-400">{{ f.help }}</span>
                    </label>
                </div>
            </section>
        </div>

        <!-- footer -->
        <div class="border-t border-stone-200 dark:border-stone-700 p-2 flex items-center justify-between gap-2">
            <span v-if="!parseFailed && knownKeyCount > 0" class="text-xs text-stone-400 pl-1">
                {{ knownKeyCount }} {{ trans('unknown_keys') }}
            </span>
            <span v-else></span>
            <div class="flex gap-2">
                <button
                    class="rounded px-3 py-1 text-sm text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800"
                    @click="onClose"
                >
                    {{ trans('close') }}
                </button>
                <button
                    class="rounded bg-sky-600 px-3 py-1 text-sm text-white hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    :disabled="!dirty"
                    @click="onSave"
                >
                    {{ trans('save') }}
                </button>
            </div>
        </div>
    </div>
</template>
