import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';

// GameAP provides vue/router/pinia/axios as globals on window at runtime, so we
// externalize them and rewrite imports to read from those globals. (Same
// approach as the official hex-editor plugin.)
function globalExternalsPlugin() {
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
                result = result.replace(importRegex, (_, imports) => {
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

function wrapInIIFEPlugin() {
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
    plugins: [vue()],
    build: {
        lib: {
            entry: resolve(process.cwd(), 'src/index.ts'),
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
            '@': resolve(process.cwd(), 'src'),
        },
    },
});
