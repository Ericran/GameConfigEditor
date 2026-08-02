import { defineConfig } from 'vitest/config';

// Separate from vite.config.ts on purpose: that one is the plugin's library
// build (externalised vue/axios, IIFE wrapping) and none of it applies to tests.
export default defineConfig({
    test: {
        environment: 'node',
        include: ['src/**/*.test.ts'],
    },
});
