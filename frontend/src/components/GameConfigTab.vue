<script setup lang="ts">
import { computed, ref } from 'vue';
import axios from 'axios';
import type { ServerTabProps } from '@gameap/plugin-sdk';
import Banner from './Banner.vue';
import ConfigEditor from './ConfigEditor.vue';
import { errMsg, useAsyncPanel } from '../composables/useAsyncPanel';
import {
    gamesFor,
    configPath,
    configDir,
    configDirCandidates,
    type GameConfig,
} from '../games/registry';

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

const { loading, saving, error, notice, reset, beginLoad } = useAsyncPanel();
// Only true after a failed LOAD (not a failed save) - gates the game's loadHint.
const showLoadHint = ref(false);
const content = ref<string | null>(null);
const reloadKey = ref(0);
const editorDirty = ref(false);
const failureKind = ref<'load' | 'save' | 'conflict'>('load');

/**
 * The directory the current file was actually read from.
 *
 * A config may list alternates (`altDirs`) because its platform folder isn't
 * knowable up front. Once a load answers we pin the winner here, and every
 * later request for this file - the pre-save conflict read, the upload, the
 * post-save verification - uses it. Saving to `cfg.dir` after loading from an
 * alternate would write a SECOND config file into a directory the server never
 * reads, leaving the edit apparently saved and actually inert.
 */
const resolvedDir = ref<string | null>(null);
const activeDir = computed(() => resolvedDir.value ?? selected.value?.dir ?? '');

const base = `/api/file-manager/${props.serverId}`;

/** File extension without the dot - the editor's `extension` prop expects it. */
function extOf(fileName: string): string {
    const i = fileName.lastIndexOf('.');
    return i === -1 ? '' : fileName.slice(i + 1).toLowerCase();
}

/**
 * Read the config file as text. Every read in this component goes through here
 * so the raw-text handling stays in one place: the panel serves the file body
 * as-is, and letting axios JSON-parse it would mangle any config that happens
 * to start with `{` or `[`.
 */
async function readFileText(cfg: GameConfig, dir: string = activeDir.value): Promise<string> {
    const resp = await axios.get(`${base}/stream-file`, {
        params: { disk: cfg.disk ?? 'server', path: configPath(cfg, dir) },
        responseType: 'text',
        transformResponse: [(d: unknown) => d],
    });
    return typeof resp.data === 'string' ? resp.data : String(resp.data ?? '');
}

async function load() {
    const cfg = selected.value;
    if (!cfg) return;
    failureKind.value = 'load';
    const attempt = beginLoad();
    showLoadHint.value = false;
    content.value = null;
    resolvedDir.value = null;

    // Probe each candidate directory in turn and keep the first that answers.
    // Any failure moves on rather than only a 404: the panel reports an absent
    // file as 500 on some setups, so treating one status as "missing" and the
    // rest as fatal would stop the search on exactly the systems that need it.
    const candidates = configDirCandidates(cfg);
    let lastError: unknown = null;
    try {
        for (const dir of candidates) {
            try {
                const text = await readFileText(cfg, dir);
                if (!attempt.current()) return;
                resolvedDir.value = dir;
                content.value = text;
                reloadKey.value++;
                return;
            } catch (e) {
                if (!attempt.current()) return;
                lastError = e;
            }
        }
        const why = errMsg(lastError, 'request failed');
        error.value =
            candidates.length > 1
                ? `Couldn't load ${cfg.fileName}. Tried ${candidates
                      .map((dir) => configPath(cfg, dir))
                      .join(', ')} - last error: ${why}`
                : `Couldn't load ${cfg.fileName} from ${configPath(cfg)}: ${why}`;
        showLoadHint.value = true;
    } finally {
        attempt.done();
    }
}

async function onSave(newContent: string) {
    const cfg = selected.value;
    if (!cfg || saving.value) return;
    failureKind.value = 'save';
    saving.value = true;
    reset();

    // Pin the directory for the whole save. Every request below has to name the
    // same one, and reading it once means a concurrent reload can't move the
    // upload to a different folder than the conflict check just validated.
    const dir = activeDir.value;

    let currentText: string;
    try {
        currentText = await readFileText(cfg, dir);
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
        fd.append('path', configDir(cfg, dir));
        fd.append('file', new File([newContent], cfg.fileName, { type: 'text/plain' }));
        await axios.post(`${base}/update-file`, fd);

        let acknowledgedContent = newContent;
        let verified = true;
        try {
            acknowledgedContent = await readFileText(cfg, dir);
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
    <!-- No `h-full`: the panel renders plugin tabs in a height-less n-tab-pane,
         so a percentage height collapses to auto and only confuses the editor's
         own layout. Flow at natural height and let the page scroll instead. -->
    <div class="pws-tab flex flex-col min-h-[420px] text-sm text-stone-800 dark:text-stone-200">
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
                :file-path="configPath(selected, activeDir)"
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
