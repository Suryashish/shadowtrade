#!/usr/bin/env bash
# Local Monad testnet fork with the real Perpl + Kuru contracts.
# Block time is frozen at the fork timestamp so on-chain oracles (Perpl's 60s mark/oracle
# window, Kuru's withdrawal-limiter price feed) never go stale. Blocks still mine every 1s.
set -euo pipefail
exec anvil \
  --fork-url "${MONAD_RPC_URL:-https://testnet-rpc.monad.xyz}" \
  --port 8545 \
  --block-time 1 \
  --auto-impersonate \
  --silent
