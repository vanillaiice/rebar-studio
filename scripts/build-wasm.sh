#!/bin/sh
# Builds the reb engine to WebAssembly into public/, with the browser assets it ships.
# The engine version is pinned in go.mod (go get -tool github.com/vanillaiice/reb/cmd/wasm@vX.Y.Z);
# set REB_DIR to build a local reb checkout instead.
set -eu
cd "$(dirname "$0")/.."
out="$PWD/public"

if [ -n "${REB_DIR:-}" ]; then
  reb="$REB_DIR"
  GOOS=js GOARCH=wasm go build -C "$reb" -trimpath -ldflags="-s -w" -o "$out/rebcompiler.wasm" ./cmd/wasm
else
  GOOS=js GOARCH=wasm go build -trimpath -ldflags="-s -w" -o "$out/rebcompiler.wasm" github.com/vanillaiice/reb/cmd/wasm
  reb="$(go list -m -f '{{.Dir}}' github.com/vanillaiice/reb)"
fi

# install, not cp: module cache files are read-only, and a read-only copy would block the next build.
install -m 644 "$(go env GOROOT)/lib/wasm/wasm_exec.js" "$out/wasm_exec.js"
install -m 644 "$reb/assets/tailwindcss.js" "$out/tailwindcss.js"
install -m 644 "$reb/assets/paged.polyfill.js" "$out/paged.polyfill.js"
