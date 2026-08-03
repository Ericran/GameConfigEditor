#!/usr/bin/env bash
# Build the GameAP-GameConfigEditor plugin (.wasm) using Docker only.
# Nothing needs to be installed on the host except Docker + git.
#
# Usage:
#   ./build.sh              build the plugin (default)
#   ./build.sh clean        remove build artifacts, keep the SDK checkout
#   ./build.sh distclean    also drop the SDK checkout and caches
set -euo pipefail
cd "$(dirname "$0")"

SDK_REF="${SDK_REF:-${SDK_TAG:-v4.4.0}}"     # tag or branch matching the installed panel; SDK_TAG remains compatible
SDK_URL="${SDK_URL:-https://github.com/gameap/gameap.git}"
NODE_IMAGE="${NODE_IMAGE:-node:24-bookworm}"
TINYGO_IMAGE="${TINYGO_IMAGE:-tinygo/tinygo:0.41.1}"  # must support Go 1.26 (the GameAP SDK requires it)
OUT="${OUT:-GameAP-GameConfigEditor.wasm}"
U="$(id -u):$(id -g)"

# Where the Go build/module/GOPATH caches live. Deliberately outside the source
# tree, in the user's cache directory: under the Actions runner $PWD is a fresh
# workspace per job, so a cache inside it would be cold every run AND impossible
# to delete afterwards (see the chmod below), stranding hundreds of MB a build.
# Keeping it here means CI needs no override, so no machine-specific path has to
# be written into the workflow.
CACHE_DIR="${CACHE_DIR:-${XDG_CACHE_HOME:-$HOME/.cache}/gameap-build}"

# Go marks its module cache read-only - files 0444, module dirs 0555 - so
# `rm -rf` fails on it even as the owner, because unlinking an entry needs write
# permission on its parent directory. Anything deleting the cache has to make it
# writable first.
rm_cache() {
  [ -e "$1" ] || return 0
  chmod -R u+w "$1" 2>/dev/null || true
  rm -rf "$1"
}

case "${1:-build}" in
  clean|distclean)
    # dist/.gitkeep is tracked (see .gitignore) so the directory survives a clean.
    rm -rf frontend/dist/* frontend/node_modules "${OUT}"
    touch frontend/dist/.gitkeep
    if [ "$1" = distclean ]; then
      rm -rf .sdk
      rm_cache "$CACHE_DIR"
    fi
    echo ">> cleaned (${1})"
    exit 0
    ;;
  build) ;;
  *)
    echo "!! unknown command '$1' - expected build, clean or distclean" >&2
    exit 1
    ;;
esac

# VERSION is the single source of truth: main.go embeds it, and vite.config.ts
# reads it to inject __PLUGIN_VERSION__. Nothing else declares a version, so
# there is no longer anything to keep in step.
GO_VER=$(tr -d '[:space:]' < VERSION)
[ -n "$GO_VER" ] || { echo "!! VERSION is empty" >&2; exit 1; }
echo ">> building version ${GO_VER}"

# The guard that matters: has the artifact changed while the version stayed put?
# Matching version files never caught this - it is how two different .wasm files
# both shipped as 2026.8.3. If HEAD still carries the last tag's version but any
# input to the build has moved since that tag, the binary will differ from the
# released one under the same number. Warn rather than fail; building repeatedly
# mid-development is normal.
#
# The pathspec is every input that reaches the artifact, which is wider than the
# source: this script pins the Node and TinyGo images, and vite.config.ts decides
# externals, IIFE wrapping and lib output. A toolchain or bundler-config change
# with no source change still produces a different .wasm, and that was invisible
# to the first version of this list. frontend/vitest.config.ts is deliberately
# absent - tests do not reach the binary.
#
# Local-only in practice: CI checks out shallow with no tags, so `git describe`
# finds nothing on a branch push and this block skips. The check that guards a
# release is in .forgejo/workflows/frontend.yml, which fails the job outright
# when a tag and VERSION disagree.
if command -v git >/dev/null && git rev-parse --git-dir >/dev/null 2>&1; then
  LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || true)
  if [ -n "$LAST_TAG" ] && [ "$LAST_TAG" = "v${GO_VER}" ] \
     && ! git diff --quiet "$LAST_TAG" -- \
            VERSION main.go build.sh \
            frontend/src frontend/vite.config.ts \
            frontend/package.json frontend/package-lock.json 2>/dev/null; then
    echo "!! warning: build inputs changed since ${LAST_TAG} but VERSION is still ${GO_VER}." >&2
    echo "!!          this artifact will differ from the one released as ${GO_VER}." >&2
    echo "!!          bump VERSION before publishing." >&2
  fi
fi

# package.json's version is cosmetic - nothing reads it, VERSION is the source of
# truth (see the README build notes). It is still hand-synced on a bump so npm's
# own output isn't stale, and a hand-synced copy drifts eventually, so say so
# rather than letting it quietly report a number the plugin never shipped under.
PKG_VER=$(grep -oE '"version"[[:space:]]*:[[:space:]]*"[^"]+"' frontend/package.json | head -1 | grep -oE '"[^"]+"$' | tr -d '"')
if [ -n "$PKG_VER" ] && [ "$PKG_VER" != "$GO_VER" ]; then
  echo "!! warning: frontend/package.json says ${PKG_VER}, VERSION says ${GO_VER}." >&2
  echo "!!          nothing reads package.json's version, but it should not lie." >&2
fi

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
# PLUGIN_VERSION is passed in because only frontend/ is mounted here - the
# repo-root VERSION file that vite.config.ts otherwise reads is not visible
# from inside this container.
docker run --rm -u "$U" -e HOME=/tmp -e PLUGIN_VERSION="$GO_VER" \
  -v "$PWD/frontend:/app" -w /app "${NODE_IMAGE}" \
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

echo ">> [3/3] Compile WASM (TinyGo) in ${TINYGO_IMAGE} (cache: ${CACHE_DIR})"
mkdir -p "$CACHE_DIR"
# The cache is mounted separately at /cache rather than living under /src, so it
# can sit outside an ephemeral CI workspace and survive between jobs.
docker run --rm -u "$U" \
  -e HOME=/tmp \
  -e GOCACHE=/cache/go-build \
  -e GOMODCACHE=/cache/gomod \
  -e GOPATH=/cache/gopath \
  -e OUT="$OUT" \
  -v "$CACHE_DIR:/cache" \
  -v "$PWD:/src" -w /src "${TINYGO_IMAGE}" \
  sh -c 'cp go.mod .build.mod; trap "rm -f .build.mod .build.sum" EXIT; GOFLAGS=-modfile=.build.mod go mod tidy && GOFLAGS=-modfile=.build.mod tinygo build -o "$OUT" -target=wasip1 -buildmode=c-shared -scheduler=none .'

echo ">> Done: ${OUT}"
echo ">> Install it via the GameAP panel: Administration -> Plugins -> Upload -> ${OUT}"
