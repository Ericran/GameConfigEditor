import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

// Separate from vite.config.ts on purpose: that one is the plugin's library
// build (externalised vue/axios, IIFE wrapping) and none of it applies to tests.
// The Vue plugin lets component regression tests import .vue files; individual
// component tests opt into jsdom with a file-level environment annotation.
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Mirrors vite.config.ts so a test that imports src/index.ts sees the same
// injected version rather than failing on an undefined global.
const pluginVersion = (
    process.env.PLUGIN_VERSION ?? readFileSync(resolve(process.cwd(), '../VERSION'), 'utf8')
).trim();

export default defineConfig({
    define: { __PLUGIN_VERSION__: JSON.stringify(pluginVersion) },
    plugins: [vue()],
    test: {
        environment: 'node',
        include: ['src/**/*.test.ts'],
    },
});
