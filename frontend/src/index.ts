import type { PluginDefinition } from '@gameap/plugin-sdk';
import './styles/main.css';
import ConfigEditor from './components/ConfigEditor.vue';
import GameConfigTab from './components/GameConfigTab.vue';
import LaunchSettingsTab from './components/LaunchSettingsTab.vue';
import { games } from './games/registry';

// Single named export - the panel's bundle loader (and the Vite IIFE wrapper)
// expect exactly one exported PluginDefinition.
export const gameConfigPlugin: PluginDefinition = {
    id: 'game-config-editor',
    name: 'Game Config Editor',
    version: '2026.8.3',
    apiVersion: '1.0',
    description: 'Structured editors for game server config files (Palworld, Minecraft, and more)',
    author: 'psinetreject',

    // One generic tab on every server page. GameAP can't gate a tab per game,
    // so the tab itself switches on server.game_id (and shows a "not supported
    // yet" note for games we don't cover) - see GameConfigTab.vue.
    slots: {
        'server-tabs': [
            {
                component: GameConfigTab,
                label: 'Game Config',
                icon: 'fa-solid fa-sliders',
                name: 'game-config',
            },
            {
                // Edits start-command variables via the panel settings API - the
                // only editor for games (Valheim) whose config is launch args.
                component: LaunchSettingsTab,
                label: 'Launch Settings',
                icon: 'fa-solid fa-terminal',
                name: 'launch-settings',
            },
        ],
    },

    // File-manager editors CAN be game-gated declaratively (match.gameCode),
    // so we register one per registered config file - browsing to that file on
    // the matching game offers the structured editor. Generated from the
    // registry so adding a game in one place wires up both surfaces.
    fileEditors: games.map((g) => ({
        id: `config-${g.gameId}-${g.fileName}`,
        name: `${g.gameName} config`,
        component: ConfigEditor,
        match: { fileName: g.fileName, gameCode: g.gameId },
        contentType: 'text' as const,
        icon: 'fa-solid fa-sliders',
    })),
};
