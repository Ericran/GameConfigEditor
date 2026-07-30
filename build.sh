#!/usr/bin/env bash
# Build the GameAP-GameConfigEditor plugin (.wasm) using Docker only.
# Nothing needs to be installed on the host except Docker + git.
set -euo pipefail
cd "$(dirname "$0")"

SDK_REF="${SDK_REF:-${SDK_TAG:-v4.3.0}}"     # tag or branch matching the installed panel; SDK_TAG remains compatible
SDK_URL="${SDK_URL:-https://github.com/gameap/gameap.git}"
NODE_IMAGE="${NODE_IMAGE:-node:22-bookworm}"
TINYGO_IMAGE="${TINYGO_IMAGE:-tinygo/tinygo:0.41.1}"  # must support Go 1.26 (GameAP v4.3.0 SDK requires it)
OUT="${OUT:-GameAP-GameConfigEditor.wasm}"
U="$(id -u):$(id -g)"

# Guard: the plugin version lives in three files and must match. Bump all three.
GO_VER=$(grep -oE 'Version:[[:space:]]*"[0-9.]+"' main.go | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
PKG_VER=$(grep -oE '"version"[[:space:]]*:[[:space:]]*"[0-9.]+"' frontend/package.json | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
TS_VER=$(grep -oE "version:[[:space:]]*'[0-9.]+'" frontend/src/index.ts | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
if [ "$GO_VER" != "$PKG_VER" ] || [ "$GO_VER" != "$TS_VER" ]; then
  echo "!! version mismatch - main.go=$GO_VER package.json=$PKG_VER index.ts=$TS_VER" >&2
  exit 1
fi
echo ">> building version ${GO_VER}"

echo ">> [1/3] Ensure GameAP SDK checkout (./.sdk/gameap @ ${SDK_REF})"
if [ ! -d .sdk/gameap/.git ]; then
  mkdir -p .sdk
  git clone --depth 1 --branch "${SDK_REF}" "${SDK_URL}" .sdk/gameap
else
  # Reset cache-only SDK edits, update an overridden origin, then fetch the
  # requested ref by name so tags and moving branches use the same path.
  git -C .sdk/gameap reset --hard
  CURRENT_SDK_URL="$(git -C .sdk/gameap remote get-url origin)"
  if [ "$CURRENT_SDK_URL" != "$SDK_URL" ]; then
    echo ">> SDK origin changed; updating to ${SDK_URL}"
    git -C .sdk/gameap remote set-url origin "$SDK_URL"
  fi
  git -C .sdk/gameap fetch --force --tags origin "$SDK_REF"
  CURRENT_SDK_COMMIT=$(git -C .sdk/gameap rev-parse HEAD)
  DESIRED_SDK_COMMIT=$(git -C .sdk/gameap rev-parse FETCH_HEAD)
  if [ "$CURRENT_SDK_COMMIT" != "$DESIRED_SDK_COMMIT" ]; then
    echo ">> SDK checkout does not match ${SDK_REF}; switching"
    git -C .sdk/gameap checkout --detach FETCH_HEAD
  fi
fi

# The guest only needs the message types from pkg/proto, but that package also
# ships host-side gRPC service stubs (*_grpc.pb.go) whose TLS code TinyGo can't
# compile (its crypto/tls is partial - no tls.Config.Clone). Drop them; this is
# what the official trimmed "gameap-api" SDK does. Safe: unused by the guest.
rm -f .sdk/gameap/pkg/proto/*_grpc.pb.go

echo ">> [2/3] Build frontend bundle (Vite) in ${NODE_IMAGE}"
# `npm ci` (not `install`) so the bundle we embed is built from the committed
# lockfile rather than whatever is newest in-range today. Note it replaces
# frontend/node_modules wholesale - that directory is bind-mounted, so a build
# also resets your local install to match the lockfile.
docker run --rm -u "$U" -e HOME=/tmp -v "$PWD/frontend:/app" -w /app "${NODE_IMAGE}" \
  sh -c "npm ci --no-audit --no-fund && npm run build"

# Vite is configured (build.lib.fileName / cssFileName) to emit exactly the two
# names main.go embeds, so there is nothing to rename here - just verify.
[ -f frontend/dist/plugin.js ] || { echo "!! frontend build did not produce plugin.js" >&2; exit 1; }
# go:embed fails on a missing file; Tailwind always emits CSS, so an absent
# plugin.css means something changed upstream. Don't break the build, but say so.
if [ ! -f frontend/dist/plugin.css ]; then
  echo "!! warning: no plugin.css emitted - embedding an empty stylesheet" >&2
  : > frontend/dist/plugin.css
fi

echo ">> [3/3] Compile WASM (TinyGo) in ${TINYGO_IMAGE}"
docker run --rm -u "$U" \
  -e HOME=/tmp \
  -e GOCACHE=/src/.cache/go-build \
  -e GOMODCACHE=/src/.cache/gomod \
  -e GOPATH=/src/.cache/gopath \
  -e OUT="$OUT" \
  -v "$PWD:/src" -w /src "${TINYGO_IMAGE}" \
  sh -c 'cp go.mod .build.mod; trap "rm -f .build.mod .build.sum" EXIT; GOFLAGS=-modfile=.build.mod go mod tidy && GOFLAGS=-modfile=.build.mod tinygo build -o "$OUT" -target=wasip1 -buildmode=c-shared -scheduler=none .'

echo ">> Done: ${OUT}"
echo ">> Install it via the GameAP panel: Administration -> Plugins -> Upload -> ${OUT}"
