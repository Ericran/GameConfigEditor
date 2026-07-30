# GameAP-GameConfigEditor

A [GameAP](https://github.com/gameap/gameap) plugin that adds **structured,
labelled editors for game-server config files** to the panel. Instead of
hand-editing raw config (and risking a typo that resets the server to
defaults), you get grouped form fields - per game, format-aware, round-tripping
every key it doesn't surface.

Started as a Palworld-only editor; now covers many games through a small set of
shared config-format parsers.

## Supported games

| Game(s) | `game_id` | File | Format |
|---|---|---|---|
| Palworld | `palworld` | `PalWorldSettings.ini` | `OptionSettings=(...)` one-liner |
| Minecraft (Java) | `minecraft` | `server.properties` | flat `key=value` |
| ARK: Survival Evolved | `ark` | `GameUserSettings.ini`, `Game.ini` | multi-section INI (case-insensitive) |
| Project Zomboid | `projectzomboid` | `servertest.ini` | flat `key=value` |
| V Rising | `1604030` | `ServerHostSettings.json`, `ServerGameSettings.json` | JSON |
| CS2 / CS:GO / CS:S | `cs2` `csgo` `cssource` | `server.cfg` | Source convars |
| Team Fortress 2 | `tf2` | `server.cfg` | Source convars |
| Garry's Mod | `garrysmod` | `server.cfg` | Source convars |
| Left 4 Dead 1 / 2 | `l4d` `l4d2` | `server.cfg` | Source convars |
| DoD:S, HL2:DM | `dods` `hl2mp` | `server.cfg` | Source convars |
| Valheim & any game | *(any)* | - | launch variables (see Launch Settings) |

Any game whose config matches a known format also works via the generic editor
even without a curated schema - keys are parsed, typed, and grouped by section,
with a raw-text fallback when a file doesn't parse.

Games whose settings aren't in a file (Valheim: name/world/password/port/
crossplay/...) are handled by the **Launch Settings** tab instead of a file editor.

> **Manual-add games:** Palworld, Project Zomboid, and V Rising aren't in
> GameAP's default catalog - they're added manually, so their `game_id` is
> whatever your panel uses. Palworld is `palworld`; Project Zomboid is assumed
> `projectzomboid`; V Rising is assumed `1604030` (the game's Steam app id, which
> is how it was added here - not the dedicated-server app id `1829350`). If your
> server uses a different code, the "Game Config" tab shows the actual code (it
> says *"not available for ...(`yourcode`)"*) - change the one `gameId` in
> `frontend/src/games/registry.ts` to match.

## How it works

A GameAP plugin is a single `.wasm` file with two parts:

- **`main.go`** - a thin Go/WASM shell implementing `PluginService`. It only
  reports plugin info and hands the panel the compiled frontend bundle. It uses
  no filesystem/server-control host calls - **the panel reads and writes the
  files for us**.
- **`frontend/`** - a Vue 3 + Vite bundle. All the logic lives here:

```
src/
  formats/            parse/serialise per format, shared ConfigDoc contract
    types.ts          ConfigDoc / Codec / Format interfaces, ConfigValue
    shared.ts         codec factory + section-address encoding
    palworld.ts       OptionSettings=(...) one-liner
    keyvalue.ts       flat key=value (Minecraft, PZ, Terraria)
    ini.ts            multi-section INI, optional case-insensitivity (ARK)
    convar.ts         Source/GoldSource server.cfg convars
    json.ts           JSON object, dotted paths (V Rising)
    *.test.ts         round-trip / fidelity tests
  games/
    registry.ts       game_id -> { file, dir, format, schema?, guardrails }
    source.ts         all Source-family entries (shared convar schema)
    fields.ts         terse schema field constructors (n/b/t/sel, section())
    schemas/          curated per-game field schemas
  composables/
    useConfigForm.ts  ConfigDoc + Schema -> grouped fields & writable models
    useAsyncPanel.ts  load/save state + panel error messages, shared by tabs
  components/
    ConfigEditor.vue      generic, format+schema-driven editor
    GameConfigTab.vue     one tab that switches on server.game_id
    LaunchSettingsTab.vue start-command vars via the panel settings API
    Banner.vue            the notice/warning/error callout
    FieldInput.vue        one control per field type
  index.ts            plugin definition: 2 tabs + N game-gated file editors
```

A **format** turns file text into a `ConfigDoc` that applies edits in place and
re-serialises, preserving comments, ordering, and every untouched key. A
**codec** handles that format's value spellings (booleans are `True`/`False` in
Palworld/INI, `true`/`false` in Minecraft, `1`/`0` in Source convars; strings
are quoted or not per format). The editor is entirely generic: it drives a
`ConfigDoc` through its codec, guided by a per-game **schema** (labelled groups),
and renders anything not in the schema generically so nothing is ever hidden.

### Access - two surfaces

- **"Game Config" server tab.** GameAP can't gate a tab per game (its slot API
  has no game filter and a static label), so there's **one** tab on every server
  that switches on `server.game_id`: it loads the right config file directly via
  the panel file API (`stream-file` to read, `update-file` to save), or shows a
  short "not supported yet" note for games we don't cover. Games with several
  config files (ARK) get a file selector.
- **File-manager editors.** These *can* be game-gated declaratively
  (`match.gameCode` = `game_id`), so browsing to a matching file offers the
  structured editor. One is registered per config file, generated from the
  registry.
- **"Launch Settings" server tab.** Edits a server's start-command variables
  through GameAP's settings API (`GET`/`PUT /api/servers/{id}/settings`) instead
  of a file - the only editor for games whose config *is* launch args (Valheim).
  The settings list is self-describing, so the form adapts to whatever the game
  mod declares (no per-game schema). Writes need the non-admin
  `game-server-settings` ability; without it the form is read-only, and it
  degrades gracefully when a game declares no vars.

### Features

- Per-game labelled schemas + a dynamic section/"Advanced" catch-all for
  unknown keys, and a raw-text fallback if a file doesn't parse.
- **Relay guardrail** (Palworld): warns when `PublicIP` is set and offers a
  one-click clear - don't leak your home IP behind a WireGuard relay.
- **Running-server warning:** detects `process_active` and reminds you to stop
  the server before saving (games that rewrite config on shutdown) or restart it
  for changes to take effect.
- **Case-insensitive keys** for ARK/Unreal INI, so editing a game-written
  `AllowThirdPersonPlayer` never appends a duplicate `allowThirdPersonPlayer`.
- **Info notes** (e.g. CS2's config-layering caveat) shown inline.

## Adding a game

1. Pick or write a `Format` in `src/formats/` (most games reuse an existing one).
2. Author a schema in `src/games/schemas/` using `n/b/t/sel` (`fields.ts`), or
   `section('Name').n(...)` when the format has sections (INI).
3. Add a `GameConfig` entry to `src/games/registry.ts` (`gameId`, `fileName`,
   `dir`, `format`, `schema`). Both the tab and a game-gated file editor wire up
   automatically.

## Build

Requires only **Docker** and **git** on the host - TinyGo and Node run in
containers.

```sh
./build.sh          # or: make build
```

This will:
1. clone the GameAP SDK into `./.sdk/gameap` at the tag matching your panel
   (`SDK_TAG`, default `v4.3.0`);
2. build the frontend bundle (Vite, via `npm ci`) -> `frontend/dist/plugin.js` +
   `plugin.css`;
3. compile everything to `GameAP-GameConfigEditor.wasm` with TinyGo.

For frontend-only iteration you can `cd frontend && npm install && npm run build`
with a local Node (no Docker needed for the JS bundle).

## Tests & checks

```sh
cd frontend
npm test           # vitest: format round-trips, form building, registry
npm run typecheck  # vue-tsc, including .vue script blocks and templates
```

The format layer is where a bug would silently corrupt someone's live server
config, so the tests concentrate there: every format must round-trip an untouched
file byte-for-byte, and editing one key must rewrite exactly that key's line.
`npm run test:watch` reruns on change.

## Install

In the panel: **Administration -> Plugins -> Upload**, select
`GameAP-GameConfigEditor.wasm`. Open a server's **Game Config** tab, or browse to a
supported config file in the file manager.

> **Upgrading from the Palworld-only plugin:** the plugin id changed
> (`palworld-settings` -> `game-config-editor`), so GameAP treats this as a new
> plugin. Upload the new `.wasm`, then remove the old "Palworld Settings Editor".

## Build notes / gotchas (resolved)

Why the build is shaped the way it is. All of it is handled already - these are
written down so a later change doesn't quietly undo one.

- **Go 1.26 toolchain.** The v4.3.0 SDK declares `go 1.26`, and TinyGo 0.39
  (Go <=1.25) can't build it. Hence `tinygo/tinygo:0.41.1`.
- **gRPC stubs trimmed.** `pkg/proto` ships host-side `*_grpc.pb.go` whose TLS
  code TinyGo can't compile, so `build.sh` deletes them. The guest never uses them.
- **SDK vendored via `replace`.** `github.com/gameap/gameap` is v4.x with no
  `/v4` module path, so it can't be `go get`-ed - it's cloned to `./.sdk/gameap`.
- **CSS must be `plugin.css`.** Vite names a library stylesheet after the
  package, but `main.go` embeds `dist/plugin.css`. Fixed by
  `build.lib.cssFileName`, which also keeps the name stable if the package is
  ever renamed.
- **Version lives in three files.** `main.go`, `frontend/package.json` and
  `frontend/src/index.ts` must agree; `build.sh` fails the build if they don't.
- **Installs are pinned.** `package-lock.json` is committed and `build.sh` runs
  `npm ci`, so a commit always builds against the same versions. Since
  `frontend/node_modules` is bind-mounted, a build also resets your local install
  to match the lockfile.
- **TypeScript is held at 6.x** because `vue-tsc` can't run on TS 7 - see below.

### Why TypeScript is held at 6.x

TS 7 is the native (Go) compiler, and the legacy in-process JS API
(`lib/typescript.js`, `ts.createProgram`) is gone; the package's main export is
just `lib/version.cjs` beside a platform binary. A replacement API does exist at
`typescript/unstable/*` - JSON-RPC to that binary, with Program/Checker/Emitter,
diagnostics, completions and virtual-filesystem callbacks - but it stays
`unstable` until TS 7.1 (~Oct 2026).

`vue-tsc` hasn't migrated: it still resolves `typescript/lib/tsc` and dies with
`ERR_PACKAGE_PATH_NOT_EXPORTED`. Template typechecking is broken on 7.0 for Vue,
Svelte and Astro alike, and Microsoft's guidance for anyone using the compiler
API is to pin to v6. TS 6.0.3 is the last JS-based release.

Worth knowing either way: `vue-tsc` is the only thing here that invokes
TypeScript at all - Vite and Vitest transpile with esbuild - so TS 7's speedup
wouldn't touch the build. Revisit at 7.1.

## Config paths & caveats

- Config paths are disk-root-relative (the `server` disk = the server's install
  dir). The file-manager editor works regardless of path; only the tab's
  direct-load uses the registry path.
- **ARK** paths assume a native Linux server (`.../LinuxServer/...`). ARK: Survival
  Ascended runs under Proton and uses `.../WindowsServer/...` instead.
- **Project Zomboid** writes `Zomboid/` under the process `$HOME`, which may be
  outside the server dir. If the tab can't find the file, browse to it in the
  file manager. The filename also tracks the configured server name.
- **CS2** keeps `server.cfg` at `game/csgo/cfg/` (extra `game/` layer) and
  layers gameplay convars via `gamemode_*_server.cfg` - see the inline note.
