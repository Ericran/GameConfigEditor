# gameap-addon — Palworld Settings Editor plugin

A [GameAP](https://github.com/gameap/gameap) plugin that adds a structured
editor for `PalWorldSettings.ini` to the panel's file manager. Instead of
hand-editing one 2,000-character comma-separated line (and risking a stray
newline that resets the server to defaults), you get labelled form fields.

## Status

**Builds.** `./build.sh` produces `gameap-addon.wasm` (~4.7 MB) end-to-end on a
clean host with only Docker + git. Validated on the build host against the GameAP
v4.3.0 SDK. Not yet load-tested in the panel against a live
`PalWorldSettings.ini`.

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

## Build notes / gotchas (resolved)

- **Go 1.26 required.** The GameAP v4.3.0 SDK declares `go 1.26` /
  `toolchain go1.26.5`, so the TinyGo image must support Go 1.26 — TinyGo 0.39
  (Go ≤1.25) fails. Pinned to `tinygo/tinygo:0.41.1`.
- **gRPC stub trim.** `pkg/plugin/proto` pulls in `pkg/proto`, which ships
  host-side `*_grpc.pb.go` files whose TLS code TinyGo can't compile. `build.sh`
  deletes them from the vendored SDK (they're unused by the guest).
- **SDK vendored via `replace`.** `github.com/gameap/gameap` is v4.x with no
  `/v4` module path, so it can't be `go get`-ed; `build.sh` checks it out into
  `./.sdk/gameap` and `go.mod` replaces to it.
- **CSS output name** is normalized to `plugin.css` before the Go `//go:embed`.

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
