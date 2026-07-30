<script setup lang="ts">
import { reactive, ref, computed } from 'vue';
import type { ComputedRef } from 'vue';
import axios from 'axios';
import type { ServerTabProps } from '@gameap/plugin-sdk';
import { useServerAbilities } from '@gameap/plugin-sdk';
import Banner from './Banner.vue';
import FieldInput from './FieldInput.vue';
import type { ConfigValue, FType } from '../formats/types';
import { errMsg, useAsyncPanel } from '../composables/useAsyncPanel';

/**
 * "Launch Settings" server tab - edits a server's start-command variables
 * through GameAP's structured settings API, rather than a config file. This is
 * the only editor for games whose settings live entirely in launch args
 * (Valheim: name/world/password/port/public/crossplay/...), and a useful extra
 * for any game whose game-mod declares vars.
 *
 *   read : GET  /api/servers/{id}/settings  -> [{ name, value, type, label, admin_var }]
 *   save : PUT  /api/servers/{id}/settings  <- [{ name, value }]
 *
 * The settings list is self-describing, so this component renders whatever the
 * game-mod declares - no per-game schema. Writes require the non-admin
 * `game-server-settings` ability (admins bypass); without it the form is
 * read-only. Degrades gracefully when the panel exposes no settings.
 */
const props = defineProps<ServerTabProps>();

interface SettingDef {
    name: string;
    value: any;
    type?: string;
    label?: string;
    admin_var?: boolean;
}

let abilitiesRef: ComputedRef<string[]> | null = null;
try {
    abilitiesRef = useServerAbilities();
} catch {
    abilitiesRef = null;
}
const canEdit = computed(() => {
    const a = abilitiesRef?.value;
    return Array.isArray(a) ? a.includes('game-server-settings') : true; // optimistic if unknown
});

const base = `/api/servers/${props.serverId}`;
const { loading, saving, error, notice, reset } = useAsyncPanel();
const unsupported = ref(false);
const defs = ref<SettingDef[]>([]);
const values = reactive<Record<string, ConfigValue>>({});
const dirty = ref(false);

// Map GameAP's declared var type to an input kind.
function kindOf(def: SettingDef): FType {
    const t = (def.type ?? '').toLowerCase();
    if (t.includes('bool') || typeof def.value === 'boolean') return 'bool';
    if (t.includes('int') || t.includes('float') || t.includes('num') || typeof def.value === 'number') return 'number';
    return 'text';
}

async function load() {
    reset();
    unsupported.value = false;
    loading.value = true;
    try {
        const resp = await axios.get(`${base}/settings`);
        const list: SettingDef[] = Array.isArray(resp.data) ? resp.data : (resp.data?.data ?? []);
        defs.value = list;
        for (const d of list) values[d.name] = d.value;
        dirty.value = false;
    } catch (e: any) {
        // 404/405 -> this panel version doesn't expose the settings API.
        if (e?.response && [404, 405, 501].includes(e.response.status)) unsupported.value = true;
        else error.value = errMsg(e, 'Failed to load launch settings');
    } finally {
        loading.value = false;
    }
}

async function save() {
    saving.value = true;
    reset();
    try {
        const payload = defs.value.map((d) => ({ name: d.name, value: values[d.name] }));
        await axios.put(`${base}/settings`, payload);
        notice.value = 'Saved. Restart the server for launch changes to take effect.';
        dirty.value = false;
    } catch (e: any) {
        error.value = errMsg(e, 'Failed to save launch settings');
    } finally {
        saving.value = false;
    }
}

function update(name: string, v: ConfigValue) {
    values[name] = v;
    dirty.value = true;
}

load();
</script>

<template>
    <div class="flex flex-col min-h-[420px] h-full text-sm text-stone-800 dark:text-stone-200">
        <Banner v-if="notice" class="m-2" tone="success" icon="fa-solid fa-check">{{ notice }}</Banner>

        <Banner v-if="error" class="m-2" tone="danger" icon="fa-solid fa-circle-exclamation">
            {{ error }}
            <template #action>
                <button
                    class="shrink-0 rounded bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-700"
                    @click="load"
                >
                    Retry
                </button>
            </template>
        </Banner>

        <div v-if="loading" class="p-6 text-center text-stone-500 dark:text-stone-400">
            <i class="fa-solid fa-spinner fa-spin mr-1"></i>Loading launch settings...
        </div>

        <div v-else-if="unsupported" class="p-4 text-stone-500 dark:text-stone-400">
            This GameAP version doesn't expose the server settings API, or this server has none.
        </div>

        <div v-else-if="defs.length === 0" class="p-4 text-stone-500 dark:text-stone-400">
            This game exposes no editable launch settings in GameAP.
        </div>

        <template v-else>
            <Banner v-if="!canEdit" class="m-2" tone="caution" icon="fa-solid fa-lock">
                You don't have the <code>game-server-settings</code> permission - these are read-only.
            </Banner>

            <div class="flex-1 overflow-auto p-3">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
                    <label v-for="d in defs" :key="d.name" class="flex flex-col gap-1">
                        <span class="text-xs text-stone-500 dark:text-stone-400">
                            {{ d.label || d.name }} <code class="opacity-60">{{ d.name }}</code>
                            <span
                                v-if="d.admin_var"
                                class="ml-1 rounded bg-stone-200 dark:bg-stone-700 px-1 text-[10px] uppercase"
                                >admin</span
                            >
                        </span>
                        <FieldInput
                            :model-value="values[d.name]"
                            :type="kindOf(d)"
                            :disabled="!canEdit"
                            @update:model-value="update(d.name, $event)"
                        />
                    </label>
                </div>
            </div>

            <div class="border-t border-stone-200 dark:border-stone-700 p-2 flex items-center justify-end gap-2">
                <span v-if="saving" class="text-xs text-stone-400">Saving...</span>
                <button
                    class="rounded bg-sky-600 px-3 py-1 text-sm text-white hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    :disabled="!dirty || !canEdit || saving"
                    @click="save"
                >
                    Save
                </button>
            </div>
        </template>
    </div>
</template>
