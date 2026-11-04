#!/usr/bin/env bash
# Vendors the pinned Solidity dependencies into contracts/lib (gitignored). Idempotent.
# Versions match 0xbow privacy-pools-core @ df4bf73 (its remappings resolve the same packages via node_modules).
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p lib

clone() { # name url ref
  [ -d "lib/$1/.git" ] && return
  git clone --quiet "$2" "lib/$1"
  git -C "lib/$1" checkout --quiet "$3"
}
npm_pkg() { # dir spec
  [ -d "lib/$1" ] && return
  local tmp; tmp=$(mktemp -d)
  (cd "$tmp" && npm pack --silent "$2" >/dev/null && tar xzf ./*.tgz)
  mv "$tmp/package" "lib/$1"
  rm -rf "$tmp"
}

clone forge-std https://github.com/foundry-rs/forge-std v1.9.7
clone openzeppelin-contracts https://github.com/OpenZeppelin/openzeppelin-contracts v5.1.0
clone openzeppelin-contracts-upgradeable https://github.com/OpenZeppelin/openzeppelin-contracts-upgradeable v5.0.2
clone privacy-pools-core https://github.com/0xbow-io/privacy-pools-core df4bf730214bf9d0c717a9258f7a74861758c269
npm_pkg lean-imt "@zk-kit/lean-imt.sol@2.0.0"
npm_pkg poseidon-solidity "poseidon-solidity@0.0.5"
echo "contracts/lib ready"
