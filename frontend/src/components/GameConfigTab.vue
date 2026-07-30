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

const base = `/api/file-manager/${props.serverId}`;

/** File extension without the dot - the editor's `extension` prop expects it. */
function extOf(fileName: string): string {
    const i = fileName.lastIndexOf('.');
    return i === -1 ? '' : fileName.slice(i + 1).toLowerCase();
}

async function load() {
    const cfg = selected.value;
    if (!cfg) return;
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
        content.value = typeof resp.data === 'string' ? resp.data : String(resp.data);
        reloadKey.value++;
    } catch (e: any) {
        error.value = `Couldn't load ${cfg.fileName} from ${configPath(cfg)}: ${errMsg(e, 'request failed')}`;
        showLoadHint.value = true;
    } finally {
        loading.value = false;
    }
}

async function onSave(newContent: string) {
    const cfg = selected.value;
    if (!cfg) return;
    saving.value = true;
    reset();
    try {
        const fd = new FormData();
        fd.append('disk', cfg.disk ?? 'server');
        fd.append('path', configDir(cfg));
        fd.append('file', new File([newContent], cfg.fileName, { type: 'text/plain' }));
        await axios.post(`${base}/update-file`, fd);
        content.value = newContent;
        reloadKey.value++;
        notice.value = 'Saved.';
    } catch (e: any) {
        error.value = `Couldn't save ${cfg.fileName}: ${errMsg(e, 'request failed')}`;
    } finally {
        saving.value = false;
    }
}

function selectConfig(cfg: GameConfig) {
    if (selected.value === cfg) return;
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
                        class="shrink-0 rounded bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-700"
                        @click="load"
                    >
                        Retry
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
                embedded
                @save="onSave"
            />
        </template>
    </div>
</template>
