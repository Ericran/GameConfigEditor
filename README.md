# GameAP-GameConfigEditor

A [GameAP](https://github.com/gameap/gameap) plugin that adds **structured,
labelled editors for game-server config files** to the panel. Instead of
hand-editing raw config (and risking a typo that resets the server to
defaults), you get grouped form fields - per game, format-aware, round-tripping
every key it doesn't surface.

Started as a Palworld-only editor; now covers many games through a small set of
shared config-format parsers.

## Supported games

38 of the 41 games in GameAP's built-in catalog, plus three added manually.
`game_id` is what the plugin matches on (`server.game_id`); the server app id is
the Steam dedicated-server app from GameAP's own catalog, handy when adding a game
to the panel.

#### Survival & sandbox
| Game | `game_id` | Server app id | Config path |
|---|---|---|---|
| Palworld | `palworld` | - | `/Pal/Saved/Config/LinuxServer/PalWorldSettings.ini` |
| Minecraft | `minecraft` | - | `/server.properties` |
| ARK: Survival Evolved | `ark` | `376030` | `/ShooterGame/Saved/Config/LinuxServer/GameUserSettings.ini` |
| ARK: Survival Evolved | `ark` | `376030` | `/ShooterGame/Saved/Config/LinuxServer/Game.ini` |
| Project Zomboid | `projectzomboid` | - | `/Zomboid/Server/servertest.ini` |
| V Rising | `1604030` | - | `/save-data/Settings/ServerHostSettings.json` |
| V Rising | `1604030` | - | `/save-data/Settings/ServerGameSettings.json` |
| 7 Days to Die | `7d2d` | `294420` | `/serverconfig.xml` |
| The Forest | `the-forest` | `556450` | `/Server.cfg` |
| Hurtworld | `hurtworld` | `405100` | `/autoexec.cfg` |
| Reign Of Kings | `rok` | `344760` | `/Configuration/ServerSettings.cfg` |

#### Source engine
| Game | `game_id` | Server app id | Config path |
|---|---|---|---|
| Counter-Strike 2 | `cs2` | `730` | `/game/csgo/cfg/server.cfg` |
| Counter-Strike: GO | `csgo` | `740` | `/csgo/cfg/server.cfg` |
| Counter-Strike: Source | `cssource` | `232330` | `/cstrike/cfg/server.cfg` |
| Counter-Strike: Source v34 | `cssv34` | `232330` | `/cstrike/cfg/server.cfg` |
| Team Fortress 2 | `tf2` | `232250` | `/tf/cfg/server.cfg` |
| Garry's Mod | `garrysmod` | `4020` | `/garrysmod/cfg/server.cfg` |
| Left 4 Dead 2 | `l4d2` | `222860` | `/left4dead2/cfg/server.cfg` |
| Left 4 Dead | `l4d` | `222840` | `/left4dead/cfg/server.cfg` |
| Day of Defeat: Source | `dods` | `232290` | `/dod/cfg/server.cfg` |
| Half-Life 2: Deathmatch | `hl2mp` | `232370` | `/hl2mp/cfg/server.cfg` |
| Black Mesa: Deathmatch | `bms` | `346680` | `/bms/cfg/server.cfg` |
| Synergy | `synergy` | `17525` | `/synergy/cfg/server.cfg` |

#### GoldSource engine (HLDS)
| Game | `game_id` | Server app id | Config path |
|---|---|---|---|
| Half-Life 1 | `valve` | `90` | `/valve/cfg/server.cfg` |
| Counter-Strike 1.6 | `cstrike` | `90` | `/cstrike/cfg/server.cfg` |
| Counter-Strike 1.5 | `cs15` | - | `/cstrike/cfg/server.cfg` |
| Counter-Strike: Condition Zero | `czero` | `90` | `/czero/cfg/server.cfg` |
| Day of Defeat | `dod` | `90` | `/dod/cfg/server.cfg` |
| Team Fortress Classic | `tfc` | `90` | `/tfc/cfg/server.cfg` |
| Half-Life: Opposing Force | `op4` | `90` | `/gearbox/cfg/server.cfg` |
| Deathmatch Classic | `dmc` | `90` | `/dmc/cfg/server.cfg` |
| Ricochet | `ricochet` | `90` | `/ricochet/cfg/server.cfg` |
| Sven Co-op | `svencoop` | `276060` | `/svencoop/cfg/server.cfg` |

#### idTech / set-dialect
| Game | `game_id` | Server app id | Config path |
|---|---|---|---|
| Quake 2 | `q2` | - | `/baseq2/server.cfg` |
| Quake 3 | `q3` | - | `/baseq3/server.cfg` |
| Call of Duty 4 | `cod4` | - | `/main/server.cfg` |
| FiveM | `fivem` | - | `/server.cfg` |

#### Arma
| Game | `game_id` | Server app id | Config path |
|---|---|---|---|
| Arma 3 | `arma3` | `233780` | `/server.cfg` |
| Arma 2 | `arma2` | `33905` | `/server.cfg` |
| Arma 2: Operation Arrowhead | `arma2oa` | `33935` | `/server.cfg` |

#### Other
| Game | `game_id` | Server app id | Config path |
|---|---|---|---|
| TeamSpeak 3 | `teamspeak3` | - | `/ts3server.ini` |
| GTA: San-Andreas Multiplayer | `samp` | - | `/server.cfg` |
| GTA: Multi Theft Auto | `mta` | - | `/mods/deathmatch/mtaserver.conf` |

Some paths are conventions rather than guarantees: Arma loads whatever `-config`
names (and nothing if the argument is absent), the idTech engines resolve
`server.cfg` against their base directory, and The Forest honours
`-configfilepath`. Those entries say so in the error banner if the file isn't
there, and the file-manager editor still matches the file wherever it lives.

### Not covered

| Game | Why |
|---|---|
| Rust, Valheim | settings are launch arguments, not a file - use the **Launch Settings** tab |
| Just Cause 2 | `config.lua` is a Lua table; out of scope for the same reason as Project Zomboid's `SandboxVars.lua` |

Any game whose config matches a known format also works via the generic editor
even without a curated schema - keys are parsed, typed, and grouped by section,
with a raw-text fallback when a file doesn't parse. Hurtworld is registered that
way on purpose: only `servername` is well documented, so the editor lists what
the file actually holds rather than inventing keys.

> **Manual-add games:** Palworld, Project Zomboid and V Rising aren't in GameAP's
> catalog - they're added by hand, so their `game_id` is whatever your panel uses.
> Palworld is assumed `palworld`, Project Zomboid `projectzomboid`, and V Rising
> `1604030` (the game's Steam app id, which is how it was added here - not the
> dedicated-server app `1829350`). If your server uses a different code, the
> "Game Config" tab prints the actual one - change the matching `gameId` in
> `frontend/src/games/registry.ts`.

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
    shared.ts         codec factory, section-address encoding, the ordered
                      address table + line splitting every parser builds on
    palworld.ts       OptionSettings=(...) one-liner
    keyvalue.ts       flat key=value (Minecraft, PZ, Terraria)
    ini.ts            multi-section INI, optional case-insensitivity (ARK)
    convar.ts         console convars (Source/GoldSource/idTech, SA-MP variant)
    json.ts           JSON object, dotted paths (V Rising)
    xml.ts            XML, attribute- or element-valued (7d2d, MTA)
    arma.ts           Arma `key = value;` with quoted strings and arrays
    *.test.ts         round-trip / fidelity tests
  games/
    registry.ts       game_id -> { file, dir, format, schema?, guardrails }
    source.ts         Source-engine entries (shared convar schema)
    goldsource.ts     GoldSource/HLDS entries (own schema, no Source-only cvars)
    idtech.ts         Quake 2/3, CoD4, FiveM (set/seta dialect)
    arma.ts           Arma 2 / 2 OA / 3
    family.ts         family scaffolding: shared file/format/hint + extras group
    fields.ts         terse schema field constructors (n/b/t/raw/sel, section())
    schemas/          curated per-game field schemas
  composables/
    useConfigForm.ts  ConfigDoc + Schema -> grouped fields & writable models
    useAsyncPanel.ts  load/save state, stale-response guard, panel error text
  components/
    ConfigEditor.vue      generic, format+schema-driven editor
    GameConfigTab.vue     one tab that switches on server.game_id
    LaunchSettingsTab.vue start-command vars via the panel settings API
    Banner.vue            the notice/warning/error callout
    FieldInput.vue        one control per field type
    *.test.ts             mounted-component tests (jsdom + @vue/test-utils)
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

  > This limitation is on its way out. GameAP 4.4.0 adds `checkGame` (a
  > `GameCheck` of engines and/or game codes) to slot components, so the tab
  > could be gated declaratively and the "not supported yet" branch dropped.
  > Blocked for now on the npm side: the typed SDK carrying it is `0.3.3`, which
  > the 4.4.0 tree declares but npm has never published - the newest published
  > release is `0.3.2`. Revisit when it lands, rather than hand-rolling the type.
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

If the game belongs to an engine family that is already covered (Source,
GoldSource, idTech/`set`-dialect, Arma), add a row to that family's `defs` table
instead of the main registry - `family()` fills in the file name, format and
load hint every member shares, and `withExtras()` appends the game's own group
to the family schema. Keep the families' schemas separate even when they look
alike: GoldSource deliberately omits Source-only convars, and merging the two
would start offering settings HLDS ignores.

## Build

Requires only **Docker** and **git** on the host - TinyGo and Node run in
containers.

```sh
./build.sh            # build the plugin
./build.sh clean      # drop build artifacts, keep the SDK checkout
./build.sh distclean  # also drop the SDK checkout and caches
```

This will:
1. check out the GameAP SDK into `./.sdk/gameap` at the ref matching your panel
   (`SDK_REF`, a tag or branch, default `v4.4.0`; `SDK_TAG` still works, and
   `SDK_URL` overrides where it is cloned from). An existing checkout is reset
   and moved to that ref rather than left as-is;
2. build the frontend bundle (Vite, via `npm ci`) -> `frontend/dist/plugin.js` +
   `plugin.css`;
3. compile everything to `GameAP-GameConfigEditor.wasm` with TinyGo.

For frontend-only iteration you can `cd frontend && npm install && npm run build`
with a local Node (no Docker needed for the JS bundle).

## Tests & checks

```sh
cd frontend
npm test           # vitest: format round-trips, form building, registry, tabs
npm run typecheck  # vue-tsc over src/, plus tsc over the build config
```

The format layer is where a bug would silently corrupt someone's live server
config, so the tests concentrate there: every format must round-trip an untouched
file byte-for-byte, and editing one key must rewrite exactly that key's line.
`npm run test:watch` reruns on change.

`.forgejo/workflows/frontend.yml` runs those two commands plus a bundle build on
every push, and the full `./build.sh` on anything that isn't a pull request.

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

- **Go 1.26 toolchain.** The SDK declares `go 1.26`, so the TinyGo image
  has to be new enough to compile it - `build.sh` pins `tinygo/tinygo:0.41.1`.
  An older image capped at Go 1.25 fails at the compile step.
- **gRPC stubs trimmed.** `pkg/proto` ships host-side `*_grpc.pb.go` whose TLS
  code TinyGo can't compile, so `build.sh` deletes them. The guest never uses them.
- **SDK vendored via `replace`.** `github.com/gameap/gameap` is v4.x with no
  `/v4` module path, so it can't be `go get`-ed - it's cloned to `./.sdk/gameap`.
- **CSS must be `plugin.css`.** Vite names a library stylesheet after the
  package, but `main.go` embeds `dist/plugin.css`. Fixed by
  `build.lib.cssFileName`, which also keeps the name stable if the package is
  ever renamed.
- **Tailwind runs as a Vite plugin** (`@tailwindcss/vite`), not via a
  `postcss.config.js`. Tailwind 4 handles its own prefixing, so there are no
  standalone `postcss`/`autoprefixer` devDeps to keep in sync. Don't reintroduce
  a PostCSS config - it would be a second, competing CSS pipeline.
- **`go mod tidy` writes to a throwaway modfile.** Left alone it rewrites the
  committed `go.mod` on every build (bumping the `go` directive and the indirect
  versions), so `build.sh` copies it to `.build.mod`, points
  `GOFLAGS=-modfile=` at the copy and removes it on exit. The flip side: the Go
  dependency versions are resolved per build, so only the npm half of the
  toolchain is lockfile-pinned.
- **Version lives in three files.** `main.go`, `frontend/package.json` and
  `frontend/src/index.ts` must agree; `build.sh` fails the build if they don't.
  It only checks that they agree, not that the number moved - bump it whenever
  the bundle changes, refactors included, or two different `.wasm` files end up
  reporting the same version to the panel.
- **Installs are pinned.** `package-lock.json` is committed and `build.sh` runs
  `npm ci`, so a commit always builds against the same versions. Since
  `frontend/node_modules` is bind-mounted, a build also resets your local install
  to match the lockfile.
- **TypeScript is held at 6.x.** TS 7 drops the JS compiler API that `vue-tsc`
  drives, so `npm run typecheck` fails on it. 6.0.3 is the last JS-based release.

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
