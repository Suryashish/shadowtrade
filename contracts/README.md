## ShadowTrade contracts

ShadowTrade uses the audited, unmodified [0xbow Privacy Pools](https://github.com/0xbow-io/privacy-pools-core) contracts (Apache-2.0): one UUPS `Entrypoint` behind an ERC1967 proxy, one `PrivacyPoolComplex` per token (AUSD, USDC), and the Groth16 withdrawal and ragequit verifiers. `install-deps.sh` fetches the sources and `remappings.txt` maps them (`pp/`); this repo only adds the deploy script and tests.

- `script/DeployPrivacyPools.s.sol`: deploys everything, registers the pools (minimum deposit 1 token, vetting fee 0, max relay fee 10 bps) and writes `../frontend/lib/deployments.json`. The broadcaster becomes the Entrypoint owner; `POSTMAN_ADDRESS` is the ASP postman (our relayer key).
- `test/PrivacyPools.t.sol`: deployment, registration, roles and the deposit path. The proof and withdraw path needs circuit artifacts and is covered by the frontend end-to-end test.
- `src/ShadowPool.sol`: the old non-ZK stand-in. No longer used by the app.

Status: deployed on the local fork only (`scripts/fork-setup.sh`), not on live testnet. The owner role can upgrade the Entrypoint and change pool config, so use a multisig or a dedicated key for any shared deployment.

### Commands

```shell
forge build
forge test
# for a real network, add --rpc-url, --broadcast and a signer
POSTMAN_ADDRESS=<relayer> forge script script/DeployPrivacyPools.s.sol
```
