#!/usr/bin/env bash
# Build the Palworld settings GameAP plugin (.wasm) using Docker only.
# Nothing needs to be installed on the host except Docker + git.
set -euo pipefail
cd "$(dirname "$0")"

SDK_TAG="${SDK_TAG:-v4.3.0}"                 # match the installed panel version
NODE_IMAGE="${NODE_IMAGE:-node:22-bookworm}"
TINYGO_IMAGE="${TINYGO_IMAGE:-tinygo/tinygo:0.41.1}"  # must support Go 1.26 (GameAP v4.3.0 SDK requires it)
OUT="${OUT:-gameap-addon.wasm}"
U="$(id -u):$(id -g)"

# Guard: the plugin version lives in three files and must match. Bump all three.
GO_VER=$(grep -oE 'Version:[[:space:]]*"[0-9.]+"' main.go | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
PKG_VER=$(grep -oE '"version"[[:space:]]*:[[:space:]]*"[0-9.]+"' frontend/package.json | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
TS_VER=$(grep -oE "version:[[:space:]]*'[0-9.]+'" frontend/src/index.ts | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
if [ "$GO_VER" != "$PKG_VER" ] || [ "$GO_VER" != "$TS_VER" ]; then
  echo "!! version mismatch — main.go=$GO_VER package.json=$PKG_VER index.ts=$TS_VER" >&2
  exit 1
fi
echo ">> building version ${GO_VER}"

echo ">> [1/4] Ensure GameAP SDK checkout (./.sdk/gameap @ ${SDK_TAG})"
if [ ! -d .sdk/gameap/.git ]; then
  mkdir -p .sdk
  git clone --depth 1 --branch "${SDK_TAG}" https://github.com/gameap/gameap.git .sdk/gameap
fi

# The guest only needs the message types from pkg/proto, but that package also
# ships host-side gRPC service stubs (*_grpc.pb.go) whose TLS code TinyGo can't
# compile (its crypto/tls is partial — no tls.Config.Clone). Drop them; this is
# what the official trimmed "gameap-api" SDK does. Safe: unused by the guest.
rm -f .sdk/gameap/pkg/proto/*_grpc.pb.go

echo ">> [2/4] Build frontend bundle (Vite) in ${NODE_IMAGE}"
docker run --rm -u "$U" -e HOME=/tmp -v "$PWD/frontend:/app" -w /app "${NODE_IMAGE}" \
  sh -c "npm install --no-audit --no-fund && npm run build"

echo ">> [3/4] Normalize CSS -> frontend/dist/plugin.css"
srccss="$(ls frontend/dist/*.css 2>/dev/null | grep -v '/plugin\.css$' | head -1 || true)"
if [ -n "${srccss:-}" ]; then cp "${srccss}" frontend/dist/plugin.css; else : > frontend/dist/plugin.css; fi
[ -f frontend/dist/plugin.js ] || { echo "!! frontend build did not produce plugin.js"; exit 1; }

echo ">> [4/4] Compile WASM (TinyGo) in ${TINYGO_IMAGE}"
docker run --rm -u "$U" \
  -e HOME=/tmp \
  -e GOCACHE=/src/.cache/go-build \
  -e GOMODCACHE=/src/.cache/gomod \
  -e GOPATH=/src/.cache/gopath \
  -v "$PWD:/src" -w /src "${TINYGO_IMAGE}" \
  sh -c "go mod tidy && tinygo build -o '${OUT}' -target=wasip1 -buildmode=c-shared -scheduler=none ."

echo ">> Done: ${OUT}"
echo ">> Install it via the GameAP panel: Administration -> Plugins -> Upload -> ${OUT}"
