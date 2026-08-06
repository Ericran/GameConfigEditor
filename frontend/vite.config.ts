import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
// Sourced from vite's re-exported Rollup compat namespace rather than the
// `rollup` package: vite 8 bundles rolldown, so `rollup` is not installed and
// depending on it just to name a type would pull a bundler we never run.
import type { Rollup } from 'vite';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// The repo-root VERSION file is the single source of truth; main.go embeds the
// same file. Injected below as __PLUGIN_VERSION__ so the version appears in
// exactly one place in the tree and cannot drift.
//
// build.sh passes it in as PLUGIN_VERSION because that build runs in a
// container with only frontend/ mounted, where ../VERSION does not exist. The
// file read is the fallback for running vite directly from a checkout.
//
// `||` rather than `??`: an exported-but-empty PLUGIN_VERSION should fall back
// to the file, not inject an empty version string into the bundle. And the path
// is relative to this file, not process.cwd(), so invoking vite from the repo
// root (`vite build -c frontend/vite.config.ts`) still finds VERSION instead of
// looking for it one level above the repo.
const pluginVersion = (
    process.env.PLUGIN_VERSION || readFileSync(resolve(import.meta.dirname, '../VERSION'), 'utf8')
).trim();

// GameAP provides vue/router/pinia/axios as globals on window at runtime, so we
// externalize them and rewrite imports to read from those globals. (Same
// approach as the official hex-editor plugin.)
function globalExternalsPlugin(): Rollup.Plugin {
    const globals = {
        'vue': 'window.Vue',
        'axios': 'window.axios',
    };

    return {
        name: 'global-externals',
        renderChunk(code) {
            let result = code;
            for (const [moduleId, globalVar] of Object.entries(globals)) {
                const importRegex = new RegExp(
                    `import\\s*\\{([^}]+)\\}\\s*from\\s*["']${moduleId}["'];?`,
                    'g'
                );
                result = result.replace(importRegex, (_: string, imports: string) => {
                    const importList = imports.split(',').map(i => i.trim());
                    const destructure = importList.map(i => {
                        const parts = i.split(/\s+as\s+/);
                        if (parts.length === 2) {
                            return `${parts[0].trim()}: ${parts[1].trim()}`;
                        }
                        return i;
                    }).join(', ');
                    return `const { ${destructure} } = ${globalVar};`;
                });

                const importStarRegex = new RegExp(
                    `import\\s*\\*\\s*as\\s*(\\w+)\\s*from\\s*["']${moduleId}["'];?`,
                    'g'
                );
                result = result.replace(importStarRegex, (_, name) => {
                    return `const ${name} = ${globalVar};`;
                });

                const importDefaultRegex = new RegExp(
                    `import\\s+(\\w+)\\s*from\\s*["']${moduleId}["'];?`,
                    'g'
                );
                result = result.replace(importDefaultRegex, (_, name) => {
                    return `const ${name} = ${globalVar};`;
                });
            }
            return { code: result, map: null };
        }
    };
}

function wrapInIIFEPlugin(): Rollup.Plugin {
    return {
        name: 'wrap-iife',
        generateBundle(options, bundle) {
            for (const fileName of Object.keys(bundle)) {
                const chunk = bundle[fileName];
                if (chunk.type === 'chunk' && chunk.code) {
                    const exportMatch = chunk.code.match(/export\s*\{\s*(\w+)\s+as\s+(\w+)\s*\};?\s*$/s);
                    if (exportMatch) {
                        const [fullExport, internalName, exportedName] = exportMatch;
                        const codeWithoutExport = chunk.code.replace(fullExport, '').trim();
                        chunk.code = `const ${exportedName} = (function() {\n${codeWithoutExport}\nreturn ${internalName};\n})();\nexport { ${exportedName} };`;
                    }
                }
            }
        }
    };
}

export default defineConfig({
    // Anchor the project to this file's directory instead of letting it default
    // to process.cwd(). Identical to the old behaviour on the normal path (both
    // build.sh's container and a local `npm run build` invoke vite from
    // frontend/), but it also makes `vite build -c frontend/vite.config.ts` from
    // the repo root land dist/ in frontend/ rather than at the root. outDir and
    // the paths below all hang off this.
    root: import.meta.dirname,
    // Tailwind runs as a Vite plugin rather than through postcss.config.js -
    // one less config file, and no standalone postcss/autoprefixer deps. CSS
    // still lands in dist/plugin.css via build.lib.cssFileName below.
    plugins: [vue(), tailwindcss()],
    define: {
        __PLUGIN_VERSION__: JSON.stringify(pluginVersion),
    },
    build: {
        lib: {
            entry: resolve(import.meta.dirname, 'src/index.ts'),
            formats: ['es'],
            fileName: () => 'plugin.js',
            // Without this, cssFileName falls back to the package.json `name`
            // (because fileName is a function, not a string) and the stylesheet
            // lands as gameap-gameconfigeditor.css. main.go embeds
            // dist/plugin.css, so name it that here rather than renaming it in
            // build.sh afterwards.
            cssFileName: 'plugin',
        },
        outDir: 'dist',
        emptyOutDir: true,
        rollupOptions: {
            // es lib output: externals stay as `import` statements that
            // globalExternalsPlugin rewrites to window globals. (output.globals
            // only applies to iife/umd, so there's nothing to set here.)
            external: ['vue', 'axios'],
            plugins: [globalExternalsPlugin(), wrapInIIFEPlugin()],
        },
    },
    resolve: {
        alias: {
            '@': resolve(import.meta.dirname, 'src'),
        },
    },
});
