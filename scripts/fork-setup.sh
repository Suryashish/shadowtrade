#!/usr/bin/env bash
# Prepares a running fork (scripts/fork.sh): freezes the clock and funds a wallet with
# MON, AUSD (Perpl collateral) and USDC (Kuru quote) by impersonating existing holders.
# Also deploys 0xbow Privacy Pools (contracts/script/DeployPrivacyPools.s.sol) and writes frontend/lib/deployments.json.
# Usage: [PORT=8545] scripts/fork-setup.sh <wallet-address> [relayer-address]   (relayer is also the ASP postman)
set -euo pipefail
WALLET=${1:?usage: fork-setup.sh <wallet-address> [relayer-address]}
RELAYER=${2:-0x674f9e09E6fB102498bF9eb4744b247E4D5b0B54}
RPC=http://127.0.0.1:${PORT:-8545}
AUSD=0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC
USDC=0xb01DC575a7ef75e58A05D2bde73ab79f8e7dd0Be
PERPL_EXCHANGE=0x1964C32f0bE608E7D29302AFF5E61268E72080cc # holds AUSD collateral
KURU_CORE=0xe08573a1Ecc4aa507c9626071fA0c4513caf7906      # holds USDC
HUNDRED_MON=0x56BC75E2D63100000

rpc() { cast rpc "$@" --rpc-url $RPC >/dev/null; }

# +1 so a block mined between this read and the freeze can't be newer than the frozen time.
NOW=$(( $(cast block latest --field timestamp --rpc-url $RPC) + 1 ))
rpc anvil_setBlockTimestampInterval 0
rpc evm_setNextBlockTimestamp "$NOW"

for addr in "$WALLET" "$RELAYER" "$PERPL_EXCHANGE" "$KURU_CORE"; do
  rpc anvil_setBalance "$addr" $HUNDRED_MON
done

send() { cast send "$@" --unlocked --rpc-url $RPC --gas-limit 300000 >/dev/null; }
send "$AUSD" 'transfer(address,uint256)' "$WALLET" 20000000000 --from $PERPL_EXCHANGE # 20,000 AUSD
send "$USDC" 'transfer(address,uint256)' "$WALLET" 20000000000 --from $KURU_CORE      # 20,000 USDC

echo "Fork ready at $RPC (clock frozen at $NOW)"
echo "  $WALLET: 100 MON, $(cast call $AUSD 'balanceOf(address)(uint256)' "$WALLET" --rpc-url $RPC | cut -d' ' -f1) AUSD units, $(cast call $USDC 'balanceOf(address)(uint256)' "$WALLET" --rpc-url $RPC | cut -d' ' -f1) USDC units"
echo "  relayer $RELAYER: 100 MON"

# Privacy Pools: the anvil dev account #0 deploys and owns the Entrypoint; the relayer is the ASP postman.
DEPLOYER=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
rpc anvil_setBalance "$DEPLOYER" $HUNDRED_MON
(cd "$(dirname "$0")/../contracts" && bash install-deps.sh >/dev/null &&
  # forge on Windows can fail to create the broadcast log directory itself.
  mkdir -p broadcast/DeployPrivacyPools.s.sol/10143 &&
  POSTMAN_ADDRESS=$RELAYER forge script script/DeployPrivacyPools.s.sol --rpc-url $RPC --broadcast \
    --unlocked --sender $DEPLOYER --gas-estimate-multiplier 150 --silent)
echo "  Privacy Pools deployed -> frontend/lib/deployments.json"
