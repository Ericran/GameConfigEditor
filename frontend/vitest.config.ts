import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

// Separate from vite.config.ts on purpose: that one is the plugin's library
// build (externalised vue/axios, IIFE wrapping) and none of it applies to tests.
// The Vue plugin lets component regression tests import .vue files; individual
// component tests opt into jsdom with a file-level environment annotation.
export default defineConfig({
    plugins: [vue()],
    test: {
        environment: 'node',
        include: ['src/**/*.test.ts'],
    },
});
