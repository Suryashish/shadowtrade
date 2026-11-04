// The SDK bundles snarkjs (WASM + workers); load it on demand so pages that never prove don't pay for it.
export async function loadPrivacySdk() {
  // The SDK's own Commitment.nullifierHash is the precommitment, not the on-chain spent-nullifier hash,
  // so the pool module needs the same Poseidon the circuits use.
  const [sdk, { poseidon }] = await Promise.all([import("@0xbow/privacy-pools-core-sdk"), import("maci-crypto/build/ts/hashing.js")]);
  return { ...sdk, poseidon };
}
export type { Hash, MasterKeys, Secret } from "@0xbow/privacy-pools-core-sdk";
