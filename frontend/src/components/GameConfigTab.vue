<script setup lang="ts">
import { ref } from 'vue';
import axios from 'axios';
import type { ServerTabProps } from '@gameap/plugin-sdk';
import Banner from './Banner.vue';
import ConfigEditor from './ConfigEditor.vue';
import { errMsg, useAsyncPanel } from '../composables/useAsyncPanel';
import { gamesFor, configPath, configDir, type GameConfig } from '../games/registry';

/**
 * "Game Config" server tab - the front door to the editor for ANY supported
 * game. GameAP can't gate a tab per game (its slot API has no game filter and a
 * static label), so this one tab appears on every server and adapts:
 *
 *  - supported game  -> loads its config file(s) directly via the panel file API
 *    and hands the text to the generic ConfigEditor;
 *  - unsupported game -> a short "not supported yet" message (no dead editor).
 *
 * A game may register several config files (e.g. ARK's GameUserSettings.ini +
 * Game.ini); a small selector switches between them.
 */
const props = defineProps<ServerTabProps>();

const gameId = props.server?.game_id;
const configs = gamesFor(gameId);
const selected = ref<GameConfig | null>(configs[0] ?? null);

const { loading, saving, error, notice, reset } = useAsyncPanel();
// Only true after a failed LOAD (not a failed save) - gates the game's loadHint.
const showLoadHint = ref(false);
const content = ref<string | null>(null);
const reloadKey = ref(0);
const editorDirty = ref(false);
const failureKind = ref<'load' | 'save' | 'conflict'>('load');
let loadGeneration = 0;

const base = `/api/file-manager/${props.serverId}`;

/** File extension without the dot - the editor's `extension` prop expects it. */
function extOf(fileName: string): string {
    const i = fileName.lastIndexOf('.');
    return i === -1 ? '' : fileName.slice(i + 1).toLowerCase();
}

async function load() {
    const cfg = selected.value;
    if (!cfg) return;
    const generation = ++loadGeneration;
    failureKind.value = 'load';
    reset();
    showLoadHint.value = false;
    loading.value = true;
    content.value = null;
    try {
        const resp = await axios.get(`${base}/stream-file`, {
            params: { disk: cfg.disk ?? 'server', path: configPath(cfg) },
            responseType: 'text',
            transformResponse: [(d: any) => d], // keep raw text, don't JSON-parse
        });
        if (generation !== loadGeneration) return;
        content.value = typeof resp.data === 'string' ? resp.data : String(resp.data);
        reloadKey.value++;
    } catch (e: any) {
        if (generation !== loadGeneration) return;
        error.value = `Couldn't load ${cfg.fileName} from ${configPath(cfg)}: ${errMsg(e, 'request failed')}`;
        showLoadHint.value = true;
    } finally {
        if (generation === loadGeneration) loading.value = false;
    }
}

async function onSave(newContent: string) {
    const cfg = selected.value;
    if (!cfg || saving.value) return;
    failureKind.value = 'save';
    saving.value = true;
    reset();

    const request = {
        params: { disk: cfg.disk ?? 'server', path: configPath(cfg) },
        responseType: 'text' as const,
        transformResponse: [(x: unknown) => x],
    };

    let currentText: string;
    try {
        const current = await axios.get(`${base}/stream-file`, request);
        currentText = typeof current.data === 'string' ? current.data : String(current.data ?? '');
    } catch (e: any) {
        error.value = `Couldn't verify ${cfg.fileName} before saving: ${errMsg(e, 'request failed')}. Nothing was uploaded; use Save to retry.`;
        saving.value = false;
        return;
    }

    if (currentText !== content.value) {
        failureKind.value = 'conflict';
        error.value = 'This file changed since it was loaded. Reload to discard your draft and view the current server copy.';
        saving.value = false;
        return;
    }

    try {
        const fd = new FormData();
        fd.append('disk', cfg.disk ?? 'server');
        fd.append('path', configDir(cfg));
        fd.append('file', new File([newContent], cfg.fileName, { type: 'text/plain' }));
        await axios.post(`${base}/update-file`, fd);

        let acknowledgedContent = newContent;
        let verified = true;
        try {
            const saved = await axios.get(`${base}/stream-file`, request);
            acknowledgedContent = typeof saved.data === 'string' ? saved.data : String(saved.data ?? '');
        } catch {
            verified = false;
        }
        content.value = acknowledgedContent;
        editorDirty.value = false;
        reloadKey.value++;
        notice.value = verified ? 'Saved.' : 'Saved, but the server copy could not be re-read for verification.';
    } catch (e: any) {
        failureKind.value = 'save';
        error.value = `Couldn't save ${cfg.fileName}: ${errMsg(e, 'request failed')}. Use Save to retry with your latest draft.`;
    } finally {
        saving.value = false;
    }
}

function retry() {
    if (failureKind.value === 'conflict') {
        if (!window.confirm('Reloading will discard your unsaved draft. Continue?')) return;
        editorDirty.value = false;
    }
    load();
}

function selectConfig(cfg: GameConfig) {
    if (selected.value === cfg || saving.value) return;
    if (editorDirty.value && !window.confirm('Discard unsaved changes and switch files?')) return;
    editorDirty.value = false;
    selected.value = cfg;
    load();
}

if (selected.value) load();
</script>

<template>
    <div class="pws-tab flex flex-col min-h-[420px] h-full text-sm text-stone-800 dark:text-stone-200">
        <div v-if="configs.length === 0" class="p-4 text-stone-500 dark:text-stone-400">
            No structured config editor is available for this game<span v-if="gameId"> (<code>{{ gameId }}</code>)</span>
            yet.
        </div>

        <template v-else>
            <!-- file selector when a game has more than one config file -->
            <div v-if="configs.length > 1" class="m-2 flex flex-wrap gap-1">
                <button
                    v-for="cfg in configs"
                    :key="cfg.fileName"
                    class="rounded px-2 py-1 text-xs border"
                    :class="
                        selected === cfg
                            ? 'border-sky-500 bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300'
                            : 'border-stone-300 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800'
                    "
                    :disabled="saving"
                    @click="selectConfig(cfg)"
                >
                    {{ cfg.fileName }}
                </button>
            </div>

            <Banner v-if="notice" class="m-2" tone="success" icon="fa-solid fa-check">{{ notice }}</Banner>

            <Banner v-if="error" class="m-2" tone="danger" icon="fa-solid fa-circle-exclamation">
                {{ error }}
                <template #action>
                    <button
                        v-if="failureKind !== 'save'"
                        class="shrink-0 rounded bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-700"
                        @click="retry"
                    >
                        {{ failureKind === 'conflict' ? 'Reload' : 'Retry' }}
                    </button>
                </template>
                <template #detail>
                    <p
                        v-if="showLoadHint && selected?.loadHint"
                        class="mt-1.5 whitespace-pre-line text-xs leading-relaxed text-red-600/90 dark:text-red-300/80"
                    >
                        <i class="fa-solid fa-circle-info mr-1"></i>{{ selected.loadHint }}
                    </p>
                </template>
            </Banner>

            <div v-if="loading" class="p-6 text-center text-stone-500 dark:text-stone-400">
                <i class="fa-solid fa-spinner fa-spin mr-1"></i>Loading {{ selected?.fileName }}...
            </div>

            <div v-if="saving" class="px-3 py-1 text-xs text-stone-400">Saving...</div>

            <ConfigEditor
                v-if="!loading && content !== null && selected"
                :key="reloadKey"
                :content="content"
                :file-path="configPath(selected)"
                :file-name="selected.fileName"
                :extension="extOf(selected.fileName)"
                :plugin-id="pluginId"
                :game="selected"
                :saving="saving"
                embedded
                @dirty-change="editorDirty = $event"
                @save="onSave"
            />
        </template>
    </div>
</template>
