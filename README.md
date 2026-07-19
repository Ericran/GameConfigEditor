# gameap-addon - Game Config Editor plugin

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
    types.ts          ConfigDoc / Codec / Format interfaces
    shared.ts         codec factory + section-address encoding
    palworld.ts       OptionSettings=(...) one-liner
    keyvalue.ts       flat key=value (Minecraft, PZ, Terraria)
    ini.ts            multi-section INI, optional case-insensitivity (ARK)
    convar.ts         Source/GoldSource server.cfg convars
  games/
    registry.ts       game_id -> { file, dir, format, schema?, guardrails }
    source.ts         all Source-family entries (shared convar schema)
    fields.ts         terse schema field constructors (n/b/t/sel)
    schemas/          curated per-game field schemas
  components/
    ConfigEditor.vue  generic, format+schema-driven editor
    GameConfigTab.vue one tab that switches on server.game_id
  index.ts            plugin definition: 1 tab + N game-gated file editors
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
2. Author a schema in `src/games/schemas/` using `n/b/t/sel` (`fields.ts`).
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
2. build the frontend bundle (Vite) -> `frontend/dist/plugin.js` + `plugin.css`;
3. compile everything to `gameap-addon.wasm` with TinyGo.

For frontend-only iteration you can `cd frontend && npm install && npm run build`
with a local Node (no Docker needed for the JS bundle).

## Install

In the panel: **Administration -> Plugins -> Upload**, select
`gameap-addon.wasm`. Open a server's **Game Config** tab, or browse to a
supported config file in the file manager.

> **Upgrading from the Palworld-only plugin:** the plugin id changed
> (`palworld-settings` -> `game-config-editor`), so GameAP treats this as a new
> plugin. Upload the new `.wasm`, then remove the old "Palworld Settings Editor".

## Build notes / gotchas (resolved)

- **Go 1.26 required.** The GameAP v4.3.0 SDK declares `go 1.26` /
  `toolchain go1.26.5`, so the TinyGo image must support Go 1.26 - TinyGo 0.39
  (Go <=1.25) fails. Pinned to `tinygo/tinygo:0.41.1`.
- **gRPC stub trim.** `pkg/plugin/proto` pulls in `pkg/proto`, which ships
  host-side `*_grpc.pb.go` files whose TLS code TinyGo can't compile. `build.sh`
  deletes them from the vendored SDK (they're unused by the guest).
- **SDK vendored via `replace`.** `github.com/gameap/gameap` is v4.x with no
  `/v4` module path, so it can't be `go get`-ed; `build.sh` checks it out into
  `./.sdk/gameap` and `go.mod` replaces to it.
- **CSS output name** is normalized to `plugin.css` before the Go `//go:embed`.
- **Version guard.** The plugin version lives in `main.go`, `frontend/package.json`,
  and `frontend/src/index.ts`; `build.sh` fails the build if they disagree.

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
