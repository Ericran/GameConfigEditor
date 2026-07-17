# gameap-addon — Palworld Settings Editor plugin

A [GameAP](https://github.com/gameap/gameap) plugin that adds a structured
editor for `PalWorldSettings.ini` to the panel's file manager. Instead of
hand-editing one 2,000-character comma-separated line (and risking a stray
newline that resets the server to defaults), you get labelled form fields.

## Status

**Scaffold / first pass.** The frontend editor is functional; the WASM build
pipeline is set up but **not yet validated on a real build** — see *Known
unknowns* below.

## How it works

A GameAP plugin is a single `.wasm` file with two parts:

- **`main.go`** — a thin Go/WASM shell implementing `PluginService`. It only
  reports plugin info and hands the panel the compiled frontend bundle. It uses
  no filesystem/server-control host calls, because **the panel reads and writes
  the file for us**.
- **`frontend/`** — a Vue 3 + Vite bundle. `src/index.ts` registers a file
  editor (`match: { fileName: 'PalWorldSettings.ini' }`, `contentType: 'text'`).
  The editor component receives the file text, parses the `OptionSettings=(...)`
  line into fields, and emits the re-serialized text on save.

The editor preserves every key it doesn't surface as a field, keeping the
original formatting; it only rewrites what you change.

### Features

- Form fields for identity, players/world, and rates settings.
- **Relay guardrail:** warns when `PublicIP` is set and offers one-click clear
  (relevant to the WireGuard relay setup — don't leak your home IP).
- **Running-server warning:** detects `process_active` and reminds you to stop
  the server before saving (Palworld overwrites the file on shutdown).
- Falls back to a raw text editor if the file doesn't match the expected shape.

## Build

Requires only **Docker** and **git** on the host — TinyGo and Node run in
containers.

```sh
./build.sh          # or: make build
```

This will:
1. clone the GameAP SDK into `./.sdk/gameap` at the tag matching your panel
   (`SDK_TAG`, default `v4.3.0`);
2. build the frontend bundle (Vite) → `frontend/dist/plugin.js` + `plugin.css`;
3. compile everything to `gameap-addon.wasm` with TinyGo.

## Install

In the panel: **Administration → Plugins → Upload**, select
`gameap-addon.wasm`. Then open `PalWorldSettings.ini` in the file manager — the
"Palworld Settings" editor will be offered.

## Known unknowns (validate on first build)

- **Go/TinyGo version compatibility.** The GameAP module targets `go 1.25`;
  confirm the pinned `tinygo/tinygo` image supports it, and bump `TINYGO_IMAGE`
  in `build.sh` if needed.
- **SDK import via local `replace`.** `github.com/gameap/gameap` is v4.x with no
  `/v4` module path, so we vendor it via `./.sdk/gameap`. `go mod tidy` on first
  build will pin the indirect deps.
- **CSS output name.** Vite's emitted CSS filename is normalized to `plugin.css`
  by `build.sh` before the Go `//go:embed`.

## Layout

```
main.go                         Go/WASM shell (GetInfo + GetFrontendBundle)
go.mod                          replace github.com/gameap/gameap => ./.sdk/gameap
build.sh / Makefile             Dockerized build
frontend/
  src/index.ts                  plugin definition + file-editor registration
  src/components/PalWorldSettingsEditor.vue   parse / form / serialize
  vite.config.js                lib build, externalizes vue/pinia/axios to window
```
