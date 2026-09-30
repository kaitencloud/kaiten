#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
WASM_OUT_DIR="$APP_DIR/public/wasm"

cd "$SCRIPT_DIR"

if ! command -v cargo >/dev/null 2>&1; then
  echo "Error: cargo is not installed or not in PATH"
  exit 1
fi

if ! command -v wasm-pack >/dev/null 2>&1; then
  echo "Error: wasm-pack is not installed."
  echo "Install it with: cargo install wasm-pack"
  exit 1
fi

if command -v rustup >/dev/null 2>&1; then
  echo "Ensuring Rust wasm target..."
  rustup target add wasm32-unknown-unknown >/dev/null
fi

echo "Building Rust Wasm..."
mkdir -p "$WASM_OUT_DIR"
# The files wasm-pack writes into the output directory. (It writes a .gitignore
# there too and overwrites it on every run, so it is not listed.) Removing them
# first means a build that fails cannot leave the module of an earlier build in
# place.
rm -f \
  "$WASM_OUT_DIR/cel-engine.js" \
  "$WASM_OUT_DIR/cel-engine.d.ts" \
  "$WASM_OUT_DIR/cel-engine_bg.wasm" \
  "$WASM_OUT_DIR/cel-engine_bg.wasm.d.ts" \
  "$WASM_OUT_DIR/package.json"

# Arguments after `--` go to cargo (wasm-pack's own convention), for example
# `./build.sh -- --locked`. That only reaches cargo's build: wasm-pack resolves the
# crate first, through a `cargo metadata` call that ignores the flag and rewrites a
# stale Cargo.lock. To fail on a stale lock, run `cargo fetch --locked` before
# this script, as app/Dockerfile does.
wasm-pack build \
  --release \
  --target web \
  --out-dir "$WASM_OUT_DIR" \
  --out-name cel-engine \
  "$@"

echo "Done!"
