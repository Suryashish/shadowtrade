#!/usr/bin/env bash
# Downloads 0xbow Privacy Pools circuit artifacts (from the audited trusted setup) into
# public/artifacts, where the SDK's Circuits loader fetches them. The SDK checks each file's
# SHA-256 against its pinned hashes before use, so a tampered file is rejected at proof time.
set -euo pipefail
COMMIT=df4bf730214bf9d0c717a9258f7a74861758c269
BASE="https://raw.githubusercontent.com/0xbow-io/privacy-pools-core/$COMMIT/packages/circuits"
OUT="$(cd "$(dirname "$0")/.." && pwd)/public/artifacts"
mkdir -p "$OUT"

fetch() {
  [ -s "$OUT/$2" ] && return
  curl -fsSL "$BASE/$1" -o "$OUT/$2.tmp" && mv "$OUT/$2.tmp" "$OUT/$2"
  echo "  fetched $2"
}

for c in commitment withdraw; do
  fetch "build/$c/${c}_js/$c.wasm" "$c.wasm"
  fetch "trusted-setup/final-keys/$c.zkey" "$c.zkey"
  fetch "trusted-setup/final-keys/$c.vkey" "$c.vkey"
done
