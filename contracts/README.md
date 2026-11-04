# ShadowTrade contracts

Foundry project. Deploys [0xbow Privacy Pools](https://github.com/0xbow-io/privacy-pools-core) (ZK) with ERC20 pools for AUSD and USDC on Monad.

NOTICE: `src/privacy-pools/` is vendored unmodified (Apache-2.0) from
https://github.com/0xbow-io/privacy-pools-core, `packages/contracts`, commit `df4bf730214bf9d0c717a9258f7a74861758c269`.

## Setup

```sh
forge install foundry-rs/forge-std --no-git   # into lib/
npm install --legacy-peer-deps                # OpenZeppelin 5.1.0 / upgradeable 5.0.2, lean-imt 2.0.0, poseidon-solidity 0.0.5
forge build
forge test
```

`--legacy-peer-deps` is needed because upgradeable 5.0.2 peers on contracts 5.0.2 while Privacy Pools pins 5.1.0.

## Poseidon libraries

`PoseidonT3` / `PoseidonT4` are linked at their canonical CREATE2 addresses (`foundry.toml` `libraries`). The deploy script
deploys any that are missing through the deterministic deployment proxy `0x4e59b44847b379578588920cA78FbF26c0B4956C`, using
`script/poseidon/*.hex` (`salt ++ initcode`, regenerated from the npm package with
`node -e "const p=require('poseidon-solidity');require('fs').writeFileSync('script/poseidon/PoseidonT4.hex',p.PoseidonT4.salt+p.PoseidonT4.bytecode.slice(2))"`).

## Deploy

The deployer must hold the owner role, i.e. be `POOL_OWNER` (defaults to the deployer).

```sh
forge script script/DeployPrivacyPools.s.sol --rpc-url <RPC_URL> --private-key "$KEY" --broadcast --slow
```

Writes `deployments/<chainId>.json` (entrypoint, pools with scopes, verifiers, deployment block).
