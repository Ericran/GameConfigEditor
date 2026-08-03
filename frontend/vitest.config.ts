import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Separate from vite.config.ts on purpose: that one is the plugin's library
// build (externalised vue/axios, IIFE wrapping) and none of it applies to tests.
// The Vue plugin lets component regression tests import .vue files; individual
// component tests opt into jsdom with a file-level environment annotation.

// Mirrors vite.config.ts so a test that imports src/index.ts sees the same
// injected version rather than failing on an undefined global - including its
// `||` fallback and its this-file-relative path; see the note over there.
const pluginVersion = (
    process.env.PLUGIN_VERSION || readFileSync(resolve(import.meta.dirname, '../VERSION'), 'utf8')
).trim();

export default defineConfig({
    // As in vite.config.ts: anchor to this file rather than process.cwd(), so
    // `include` below resolves against frontend/ no matter where vitest is
    // invoked from.
    root: import.meta.dirname,
    define: { __PLUGIN_VERSION__: JSON.stringify(pluginVersion) },
    plugins: [vue()],
    test: {
        environment: 'node',
        include: ['src/**/*.test.ts'],
    },
});
