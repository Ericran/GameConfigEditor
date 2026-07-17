<script setup lang="ts">
import { reactive, ref, computed } from 'vue';
import type { FileEditorProps } from '@gameap/plugin-sdk';
import { useServer } from '@gameap/plugin-sdk';

/**
 * PalWorldSettings.ini editor.
 *
 * The file is a header line plus one giant `OptionSettings=(k=v,k=v,...)` line.
 * We parse that inner list into a key->raw-value map, render a form covering
 * every known key, and re-serialize on save preserving each value's original
 * formatting and every key we don't surface. Any key not in the schema is shown
 * in an "Advanced" section with its type inferred, so nothing is ever hidden.
 * Because we always regenerate the one-line structure, a stray newline can't
 * corrupt the file.
 */

// `embedded` is set when hosted in a server tab (vs the file-manager editor):
// it hides the Close button since there's no modal to dismiss.
const props = defineProps<FileEditorProps & { embedded?: boolean }>();
const emit = defineEmits<{ save: [content: string]; close: [] }>();

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

// ---- types ----
type FType = 'text' | 'number' | 'bool' | 'select' | 'raw';
interface FieldDef {
    key: string;
    label: string;
    type: FType;
    options?: string[];
}
interface Group {
    id: string;
    title: string;
    icon: string;
    fields: FieldDef[];
}

const n = (key: string, label: string): FieldDef => ({ key, label, type: 'number' });
const b = (key: string, label: string): FieldDef => ({ key, label, type: 'bool' });
const t = (key: string, label: string): FieldDef => ({ key, label, type: 'text' });
const sel = (key: string, label: string, options: string[]): FieldDef => ({ key, label, type: 'select', options });

// ---- full schema (every key in a standard PalWorldSettings.ini) ----
const groups: Group[] = [
    {
        id: 'server',
        title: 'Server / Identity',
        icon: 'fa-solid fa-id-card',
        fields: [
            t('ServerName', 'Server name'),
            t('ServerDescription', 'Description'),
            t('ServerPassword', 'Server password'),
            t('AdminPassword', 'Admin password'),
            t('Region', 'Region'),
            b('bUseAuth', 'Require authentication'),
            t('BanListURL', 'Ban list URL'),
            sel('AllowConnectPlatform', 'Allowed platform', ['Steam', 'Xbox']),
        ],
    },
    {
        id: 'multiplayer',
        title: 'Players & Multiplayer',
        icon: 'fa-solid fa-users',
        fields: [
            n('ServerPlayerMaxNum', 'Max players'),
            n('CoopPlayerMaxNum', 'Co-op players (guild)'),
            b('bIsMultiplay', 'Multiplay'),
            b('bIsPvP', 'PvP'),
            b('bEnablePlayerToPlayerDamage', 'Player-to-player damage'),
            b('bEnableFriendlyFire', 'Friendly fire'),
            b('bHardcore', 'Hardcore'),
            b('bPalLost', 'Lose Pals on death (hardcore)'),
            b('bEnableNonLoginPenalty', 'Non-login penalty'),
            b('bEnableFastTravel', 'Fast travel'),
            b('bIsStartLocationSelectByMap', 'Pick start location on map'),
            b('bExistPlayerAfterLogout', 'Body persists after logout'),
            b('bEnableInvaderEnemy', 'Invader enemies'),
            b('bActiveUNKO', 'Active UNKO'),
            b('bEnableAimAssistPad', 'Aim assist (gamepad)'),
            b('bEnableAimAssistKeyboard', 'Aim assist (keyboard)'),
        ],
    },
    {
        id: 'world',
        title: 'World & Difficulty',
        icon: 'fa-solid fa-earth-americas',
        fields: [
            sel('Difficulty', 'Difficulty', ['None', 'Casual', 'Normal', 'Hard']),
            sel('RandomizerType', 'Randomizer type', ['None', 'Region', 'All']),
            t('RandomizerSeed', 'Randomizer seed'),
            sel('DeathPenalty', 'Death penalty', ['none', 'Item', 'ItemAndEquipment', 'All']),
            n('DayTimeSpeedRate', 'Day-time speed rate'),
            n('NightTimeSpeedRate', 'Night-time speed rate'),
            b('bIsUseBackupSaveData', 'Backup save data'),
            n('AutoSaveSpan', 'Auto-save interval (s)'),
            n('SupplyDropSpan', 'Supply drop interval (min)'),
        ],
    },
    {
        id: 'rates_progress',
        title: 'Rates — Progression & Gathering',
        icon: 'fa-solid fa-gauge-high',
        fields: [
            n('ExpRate', 'EXP rate'),
            n('PalCaptureRate', 'Pal capture rate'),
            n('PalSpawnNumRate', 'Pal spawn rate'),
            n('WorkSpeedRate', 'Work speed rate'),
            n('CollectionDropRate', 'Gather drop rate'),
            n('CollectionObjectHpRate', 'Gatherable HP rate'),
            n('CollectionObjectRespawnSpeedRate', 'Gatherable respawn rate'),
            n('EnemyDropItemRate', 'Enemy drop rate'),
            n('ItemWeightRate', 'Item weight rate'),
        ],
    },
    {
        id: 'rates_combat',
        title: 'Rates — Combat & Structures',
        icon: 'fa-solid fa-gavel',
        fields: [
            n('PalDamageRateAttack', 'Pal damage — attack'),
            n('PalDamageRateDefense', 'Pal damage — defense'),
            n('PlayerDamageRateAttack', 'Player damage — attack'),
            n('PlayerDamageRateDefense', 'Player damage — defense'),
            n('BuildObjectHpRate', 'Structure HP rate'),
            n('BuildObjectDamageRate', 'Structure damage rate'),
            n('BuildObjectDeteriorationDamageRate', 'Structure decay rate'),
        ],
    },
    {
        id: 'rates_survival',
        title: 'Rates — Survival',
        icon: 'fa-solid fa-heart-pulse',
        fields: [
            n('PlayerStomachDecreaceRate', 'Player hunger drain'),
            n('PlayerStaminaDecreaceRate', 'Player stamina drain'),
            n('PlayerAutoHPRegeneRate', 'Player HP regen'),
            n('PlayerAutoHpRegeneRateInSleep', 'Player HP regen (sleep)'),
            n('PalStomachDecreaceRate', 'Pal hunger drain'),
            n('PalStaminaDecreaceRate', 'Pal stamina drain'),
            n('PalAutoHPRegeneRate', 'Pal HP regen'),
            n('PalAutoHpRegeneRateInSleep', 'Pal HP regen (sleep)'),
        ],
    },
    {
        id: 'pals',
        title: 'Pals',
        icon: 'fa-solid fa-paw',
        fields: [
            n('PalEggDefaultHatchingTime', 'Egg hatch time (h)'),
            b('EnablePredatorBossPal', 'Predator boss Pals'),
        ],
    },
    {
        id: 'items',
        title: 'Items & Drops',
        icon: 'fa-solid fa-box-open',
        fields: [
            n('DropItemMaxNum', 'Max dropped items'),
            n('DropItemMaxNum_UNKO', 'Max dropped items (UNKO)'),
            n('DropItemAliveMaxHours', 'Dropped item lifetime (h)'),
        ],
    },
    {
        id: 'base',
        title: 'Bases & Guilds',
        icon: 'fa-solid fa-warehouse',
        fields: [
            n('BaseCampMaxNum', 'Max base camps'),
            n('BaseCampWorkerMaxNum', 'Max base workers'),
            n('BaseCampMaxNumInGuild', 'Max bases per guild'),
            n('GuildPlayerMaxNum', 'Max guild players'),
            n('MaxBuildingLimitNum', 'Building limit (0 = unlimited)'),
            b('bAutoResetGuildNoOnlinePlayers', 'Auto-reset empty guilds'),
            n('AutoResetGuildTimeNoOnlinePlayers', 'Guild reset time (h)'),
            b('bCanPickupOtherGuildDeathPenaltyDrop', 'Pick up other guilds’ drops'),
            b('bEnableDefenseOtherGuildPlayer', 'Defend vs other guilds'),
            b('bInvisibleOtherGuildBaseCampAreaFX', 'Hide other guild base FX'),
            b('bBuildAreaLimit', 'Build area limit'),
        ],
    },
    {
        id: 'misc',
        title: 'Chat & Misc',
        icon: 'fa-solid fa-comment',
        fields: [
            n('ChatPostLimitPerMinute', 'Chat posts / minute'),
            b('bShowPlayerList', 'Show player list'),
            sel('LogFormatType', 'Log format', ['Text', 'Json']),
            n('ServerReplicatePawnCullDistance', 'Pawn cull distance'),
        ],
    },
    {
        id: 'network',
        title: 'Networking / Relay',
        icon: 'fa-solid fa-network-wired',
        fields: [
            t('PublicIP', 'Public IP (empty behind a relay)'),
            n('PublicPort', 'Public port'),
            b('RCONEnabled', 'RCON enabled'),
            n('RCONPort', 'RCON port'),
            b('RESTAPIEnabled', 'REST API enabled'),
            n('RESTAPIPort', 'REST API port'),
        ],
    },
];

const schemaFields = groups.flatMap((g) => g.fields);
const schemaKeys = new Set(schemaFields.map((f) => f.key));

// ---- parse state ----
const values = reactive<Record<string, string>>({}); // key -> raw value (as in file)
const keyOrder = ref<string[]>([]);
let before = '';
let after = '';
const parseFailed = ref(false);
const rawText = ref('');
const dirty = ref(false);
const advancedFields = ref<FieldDef[]>([]);

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

function inferType(raw: string): FType {
    const s = raw.trim();
    if (/^(true|false)$/i.test(s)) return 'bool';
    if (/^-?\d+(\.\d+)?$/.test(s)) return 'number';
    return 'raw';
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
    advancedFields.value = keyOrder.value
        .filter((k) => !schemaKeys.has(k))
        .map((k) => ({ key: k, label: k, type: inferType(values[k]) }));
}

function serialize(): string {
    const body = keyOrder.value.map((k) => `${k}=${values[k]}`).join(',');
    return before + body + after;
}

// ---- raw <-> typed conversion ----
function fromRaw(raw: string | undefined, type: FType): any {
    if (raw === undefined) {
        if (type === 'bool') return false;
        if (type === 'number') return 0;
        return '';
    }
    switch (type) {
        case 'bool':
            return raw.trim().toLowerCase() === 'true';
        case 'number': {
            const num = Number(raw);
            return Number.isNaN(num) ? raw : num;
        }
        case 'text': {
            const m = raw.match(/^"([\s\S]*)"$/);
            return m ? m[1] : raw;
        }
        case 'select':
            return raw.trim();
        default: // 'raw'
            return raw;
    }
}

function toRaw(v: any, type: FType): string {
    switch (type) {
        case 'bool':
            return v ? 'True' : 'False';
        case 'number':
            return String(v);
        case 'text':
            return `"${String(v)}"`;
        default: // 'select' | 'raw'
            return String(v);
    }
}

// ---- reactive models over `values` ----
const models: Record<string, any> = {};
function buildModel(key: string, type: FType) {
    if (models[key]) return;
    models[key] = computed({
        get: () => fromRaw(values[key], type),
        set: (v: any) => {
            if (!(key in values)) keyOrder.value.push(key);
            values[key] = toRaw(v, type);
            dirty.value = true;
        },
    });
}

// ---- relay guardrail ----
const publicIpSet = computed(() => {
    const v = fromRaw(values['PublicIP'], 'text');
    return typeof v === 'string' && v.trim().length > 0;
});
function clearPublic() {
    // Route PublicIP through its model so toRaw owns the quoting. PublicPort is
    // blanked directly since an empty value isn't a valid number to convert.
    if ('PublicIP' in values) models['PublicIP'].value = '';
    if ('PublicPort' in values) {
        values['PublicPort'] = '';
        dirty.value = true;
    }
}

// ---- actions ----
function onSave() {
    emit('save', parseFailed.value ? rawText.value : serialize());
    dirty.value = false;
}
function onClose() {
    emit('close');
}
defineExpose({ save: onSave, close: onClose });

// ---- init ----
parse(typeof props.content === 'string' ? props.content : new TextDecoder().decode(props.content as ArrayBuffer));
for (const f of schemaFields) buildModel(f.key, f.type);
for (const f of advancedFields.value) buildModel(f.key, f.type);

const renderGroups = computed<Group[]>(() => {
    const g = [...groups];
    if (advancedFields.value.length) {
        g.push({ id: 'advanced', title: 'Advanced', icon: 'fa-solid fa-gear', fields: advancedFields.value });
    }
    return g;
});

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
            <i class="fa-solid fa-triangle-exclamation mr-1"></i>This server appears to be RUNNING. Palworld
            overwrites this file on shutdown, so stop the server before saving or your changes will be lost.
        </div>

        <!-- raw fallback -->
        <div v-if="parseFailed" class="flex-1 flex flex-col p-2 gap-2 min-h-0">
            <div class="text-red-600 dark:text-red-400 text-xs">
                Could not locate an OptionSettings=(...) block. Editing raw text instead.
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
            <section v-for="group in renderGroups" :key="group.id">
                <h3 class="font-semibold text-stone-600 dark:text-stone-400 mb-2 flex items-center gap-2">
                    <i :class="group.icon"></i>{{ group.title }}
                </h3>

                <div
                    v-if="group.id === 'network' && publicIpSet"
                    class="mb-3 rounded-md border border-amber-400 bg-amber-50 px-3 py-2 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300 flex items-center justify-between gap-3"
                >
                    <span
                        ><i class="fa-solid fa-shield-halved mr-1"></i>PublicIP is set. For a WireGuard relay or an
                        unlisted server this advertises your real IP to the community browser. Clear it unless you
                        intend to be publicly listed.</span
                    >
                    <button
                        class="shrink-0 rounded bg-amber-600 px-2 py-1 text-white text-xs hover:bg-amber-700"
                        @click="clearPublic"
                    >
                        Clear PublicIP &amp; PublicPort
                    </button>
                </div>
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
