import type { PluginDefinition } from '@gameap/plugin-sdk';
import './styles/main.css';
import PalWorldSettingsEditor from './components/PalWorldSettingsEditor.vue';
import PalWorldSettingsTab from './components/PalWorldSettingsTab.vue';

// Single named export — the panel's bundle loader (and the Vite IIFE wrapper)
// expect exactly one exported PluginDefinition.
export const palworldSettingsPlugin: PluginDefinition = {
    id: 'palworld-settings',
    name: 'Palworld Settings Editor',
    version: '0.3.0',
    apiVersion: '1.0',
    description: 'Structured editor for PalWorldSettings.ini',
    author: 'psinetreject',

    // A tab on the server page that loads PalWorldSettings.ini directly —
    // no file browsing. (Gated to Palworld servers inside the component.)
    slots: {
        'server-tabs': [
            {
                component: PalWorldSettingsTab,
                label: 'Palworld Settings',
                icon: 'fa-solid fa-sliders',
                name: 'palworld-settings',
            },
        ],
    },

    // Also keep the file-manager editor for anyone who browses to the file.
    fileEditors: [
        {
            id: 'palworld-settings',
            name: 'Palworld Settings',
            component: PalWorldSettingsEditor,
            match: { fileName: 'PalWorldSettings.ini' },
            contentType: 'text',
            icon: 'fa-solid fa-sliders',
        },
    ],
};
