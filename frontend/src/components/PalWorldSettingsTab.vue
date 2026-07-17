<script setup lang="ts">
import { ref, onMounted } from 'vue';
import axios from 'axios';
import type { ServerTabProps } from '@gameap/plugin-sdk';
import PalWorldSettingsEditor from './PalWorldSettingsEditor.vue';

/**
 * "Palworld Settings" server tab — the front door to the editor.
 *
 * Instead of browsing the file manager, this loads PalWorldSettings.ini
 * directly through the panel's own file API (verified endpoints):
 *   read : GET  /api/file-manager/{server}/stream-file?disk=server&path=…
 *   save : POST /api/file-manager/{server}/update-file  (multipart)
 * Auth rides the panel's session cookie via the shared axios instance.
 */

const props = defineProps<ServerTabProps>();

const DISK = 'server';
const CONFIG_DIR = '/Pal/Saved/Config/LinuxServer';
const CONFIG_NAME = 'PalWorldSettings.ini';
const CONFIG_PATH = `${CONFIG_DIR}/${CONFIG_NAME}`;

const isPalworld = props.server?.game_id === 'palworld';
const loading = ref(false);
const saving = ref(false);
const error = ref<string | null>(null);
const notice = ref<string | null>(null);
const content = ref<string | null>(null);
const reloadKey = ref(0);

const base = `/api/file-manager/${props.serverId}`;

function errMsg(e: any, fallback: string): string {
    return e?.response?.data?.message || e?.response?.data?.error || e?.message || fallback;
}

async function load() {
    error.value = null;
    notice.value = null;
    loading.value = true;
    try {
        const resp = await axios.get(`${base}/stream-file`, {
            params: { disk: DISK, path: CONFIG_PATH },
            responseType: 'text',
            transformResponse: [(d: any) => d], // keep raw text, don't JSON-parse
        });
        content.value = typeof resp.data === 'string' ? resp.data : String(resp.data);
        reloadKey.value++;
    } catch (e: any) {
        error.value = errMsg(e, 'Failed to load PalWorldSettings.ini');
    } finally {
        loading.value = false;
    }
}

async function onSave(newContent: string) {
    saving.value = true;
    error.value = null;
    notice.value = null;
    try {
        const fd = new FormData();
        fd.append('disk', DISK);
        fd.append('path', CONFIG_DIR);
        fd.append('file', new File([newContent], CONFIG_NAME, { type: 'text/plain' }));
        await axios.post(`${base}/update-file`, fd);
        content.value = newContent;
        reloadKey.value++;
        notice.value = 'Saved.';
    } catch (e: any) {
        error.value = errMsg(e, 'Failed to save PalWorldSettings.ini');
    } finally {
        saving.value = false;
    }
}

onMounted(() => {
    if (isPalworld) load();
});
</script>

<template>
    <div class="pws-tab flex flex-col min-h-[420px] h-full text-sm">
        <div v-if="!isPalworld" class="p-4 text-stone-500 dark:text-stone-400">
            This editor is only available for Palworld servers.
        </div>

        <template v-else>
            <div
                v-if="notice"
                class="m-2 rounded border border-lime-300 bg-lime-50 px-3 py-1.5 text-lime-800 dark:border-lime-800 dark:bg-lime-900/20 dark:text-lime-300"
            >
                <i class="fa-solid fa-check mr-1"></i>{{ notice }}
            </div>
            <div
                v-if="error"
                class="m-2 flex items-center justify-between gap-3 rounded border border-red-300 bg-red-50 px-3 py-1.5 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300"
            >
                <span><i class="fa-solid fa-circle-exclamation mr-1"></i>{{ error }}</span>
                <button
                    class="shrink-0 rounded bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-700"
                    @click="load"
                >
                    Retry
                </button>
            </div>

            <div v-if="loading" class="p-6 text-center text-stone-500 dark:text-stone-400">
                <i class="fa-solid fa-spinner fa-spin mr-1"></i>Loading PalWorldSettings.ini…
            </div>

            <div v-if="saving" class="px-3 py-1 text-xs text-stone-400">Saving…</div>

            <PalWorldSettingsEditor
                v-if="!loading && content !== null"
                :key="reloadKey"
                :content="content"
                :file-path="CONFIG_PATH"
                :file-name="CONFIG_NAME"
                extension="ini"
                :plugin-id="pluginId"
                embedded
                @save="onSave"
            />
        </template>
    </div>
</template>
