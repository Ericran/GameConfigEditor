#!/usr/bin/env bash
# Build the Palworld settings GameAP plugin (.wasm) using Docker only.
# Nothing needs to be installed on the host except Docker + git.
set -euo pipefail
cd "$(dirname "$0")"

SDK_TAG="${SDK_TAG:-v4.3.0}"                 # match the installed panel version
NODE_IMAGE="${NODE_IMAGE:-node:22-bookworm}"
TINYGO_IMAGE="${TINYGO_IMAGE:-tinygo/tinygo:0.39.0}"
OUT="${OUT:-gameap-addon.wasm}"
U="$(id -u):$(id -g)"

echo ">> [1/4] Ensure GameAP SDK checkout (./.sdk/gameap @ ${SDK_TAG})"
if [ ! -d .sdk/gameap/.git ]; then
  mkdir -p .sdk
  git clone --depth 1 --branch "${SDK_TAG}" https://github.com/gameap/gameap.git .sdk/gameap
fi

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
