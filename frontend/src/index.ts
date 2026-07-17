import type { PluginDefinition } from '@gameap/plugin-sdk';
import './styles/main.css';
import PalWorldSettingsEditor from './components/PalWorldSettingsEditor.vue';

// Single named export — the panel's bundle loader (and the Vite IIFE wrapper)
// expect exactly one exported PluginDefinition.
export const palworldSettingsPlugin: PluginDefinition = {
    id: 'palworld-settings',
    name: 'Palworld Settings Editor',
    version: '0.1.0',
    apiVersion: '1.0',
    description: 'Structured editor for PalWorldSettings.ini',
    author: 'psinetreject',

    fileEditors: [
        {
            id: 'palworld-settings',
            name: 'Palworld Settings',
            component: PalWorldSettingsEditor,
            // Only offer this editor for the Palworld config file.
            match: { fileName: 'PalWorldSettings.ini' },
            contentType: 'text',
            icon: 'fa-solid fa-sliders',
        },
    ],
};
