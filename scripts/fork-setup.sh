#!/usr/bin/env bash
# Prepares a running fork (scripts/fork.sh): freezes the clock, funds a wallet with MON, AUSD
# (Perpl collateral) and USDC (Kuru quote) by impersonating existing holders, and deploys the 0xbow
# Privacy Pools if this fork doesn't have them yet (needs RELAYER_PRIVATE_KEY in frontend/.env.local).
# Usage: scripts/fork-setup.sh <wallet-address> [relayer-address]
set -euo pipefail
WALLET=${1:?usage: fork-setup.sh <wallet-address> [relayer-address]}
RELAYER=${2:-0x674f9e09E6fB102498bF9eb4744b247E4D5b0B54}
RPC=${RPC:-http://127.0.0.1:8545}
AUSD=0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC
USDC=0xb01DC575a7ef75e58A05D2bde73ab79f8e7dd0Be
PERPL_EXCHANGE=0x1964C32f0bE608E7D29302AFF5E61268E72080cc # holds AUSD collateral
KURU_CORE=0xe08573a1Ecc4aa507c9626071fA0c4513caf7906      # holds USDC
HUNDRED_MON=0x56BC75E2D63100000

rpc() { cast rpc "$@" --rpc-url $RPC >/dev/null; }

# Pin the clock at the current block time. Re-running must not move it forward: Perpl rejects
# trades once its mark price is ~60s older than the block time, so every second counts. Run this
# right after scripts/fork.sh, before the fork's own 1s blocks age the prices.
NOW=$(cast block latest --field timestamp --rpc-url $RPC)
rpc anvil_setBlockTimestampInterval 0
rpc anvil_setTime "$NOW"

for addr in "$WALLET" "$RELAYER" "$PERPL_EXCHANGE" "$KURU_CORE"; do
  rpc anvil_setBalance "$addr" $HUNDRED_MON
done

send() { cast send "$@" --unlocked --rpc-url $RPC --gas-limit 300000 >/dev/null; }
send "$AUSD" 'transfer(address,uint256)' "$WALLET" 20000000000 --from $PERPL_EXCHANGE # 20,000 AUSD
send "$USDC" 'transfer(address,uint256)' "$WALLET" 20000000000 --from $KURU_CORE      # 20,000 USDC

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOYMENT="$ROOT/frontend/lib/privacyPools.json"
ENTRYPOINT=$(jq -r .entrypoint "$DEPLOYMENT")
if [ "$(cast code "$ENTRYPOINT" --rpc-url $RPC)" = "0x" ]; then
  KEY=$(grep '^RELAYER_PRIVATE_KEY=' "$ROOT/frontend/.env.local" | cut -d= -f2-)
  (cd "$ROOT/contracts" && forge script script/DeployPrivacyPools.s.sol --rpc-url $RPC --private-key "$KEY" --broadcast --slow >/dev/null)
  cp "$ROOT/contracts/deployments/10143.json" "$DEPLOYMENT"
  echo "Deployed Privacy Pools: entrypoint $(jq -r .entrypoint "$DEPLOYMENT") (restart pnpm dev to pick it up)"
fi

echo "Fork ready at $RPC (clock frozen at $NOW)"
echo "  $WALLET: 100 MON, $(cast call $AUSD 'balanceOf(address)(uint256)' "$WALLET" --rpc-url $RPC | cut -d' ' -f1) AUSD units, $(cast call $USDC 'balanceOf(address)(uint256)' "$WALLET" --rpc-url $RPC | cut -d' ' -f1) USDC units"
echo "  relayer $RELAYER: 100 MON"
