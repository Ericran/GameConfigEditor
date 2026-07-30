OUT ?= GameAP-GameConfigEditor.wasm

.PHONY: build clean distclean

# Full build: SDK checkout + frontend + wasm (all in Docker).
build:
	./build.sh

# Remove build artifacts but keep the cloned SDK.
clean:
	rm -rf frontend/dist/* frontend/node_modules $(OUT)
	touch frontend/dist/.gitkeep

# Also drop the SDK checkout and caches.
distclean: clean
	rm -rf .sdk .cache
