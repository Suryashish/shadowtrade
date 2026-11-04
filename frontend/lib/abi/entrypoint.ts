const withdrawalStruct = {
  type: "tuple",
  name: "_withdrawal",
  components: [
    { name: "processooor", type: "address" },
    { name: "data", type: "bytes" },
  ],
} as const;

const withdrawProofStruct = {
  type: "tuple",
  name: "_proof",
  components: [
    { name: "pA", type: "uint256[2]" },
    { name: "pB", type: "uint256[2][2]" },
    { name: "pC", type: "uint256[2]" },
    { name: "pubSignals", type: "uint256[8]" },
  ],
} as const;

// Pool reverts bubble up through Entrypoint.relay, so their errors are listed here to be decoded by name.
const poolErrors = ["IncorrectASPRoot", "UnknownStateRoot", "NullifierAlreadySpent", "InvalidProof", "ContextMismatch", "InvalidProcessooor", "ScopeMismatch"].map(
  (name) => ({ type: "error", name, inputs: [] }) as const,
);

export const entrypointAbi = [
  {
    type: "function",
    name: "deposit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_asset", type: "address" },
      { name: "_value", type: "uint256" },
      { name: "_precommitment", type: "uint256" },
    ],
    outputs: [{ name: "_commitment", type: "uint256" }],
  },
  {
    type: "function",
    name: "relay",
    stateMutability: "nonpayable",
    inputs: [withdrawalStruct, withdrawProofStruct, { name: "_scope", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "updateRoot",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_root", type: "uint256" },
      { name: "_ipfsCID", type: "string" },
    ],
    outputs: [{ name: "_index", type: "uint256" }],
  },
  { type: "function", name: "latestRoot", stateMutability: "view", inputs: [], outputs: [{ name: "_root", type: "uint256" }] },
  {
    type: "function",
    name: "assetConfig",
    stateMutability: "view",
    inputs: [{ name: "_asset", type: "address" }],
    outputs: [
      { name: "pool", type: "address" },
      { name: "minimumDepositAmount", type: "uint256" },
      { name: "vettingFeeBPS", type: "uint256" },
      { name: "maxRelayFeeBPS", type: "uint256" },
    ],
  },
  { type: "error", name: "PrecommitmentAlreadyUsed", inputs: [] },
  { type: "error", name: "RelayFeeGreaterThanMax", inputs: [] },
  { type: "error", name: "EmptyRoot", inputs: [] },
  ...poolErrors,
] as const;

/** Decoded `Withdrawal.data` for relayed withdrawals (0xbow `IEntrypoint.RelayData`). */
export const relayDataParams = [
  {
    type: "tuple",
    components: [
      { name: "recipient", type: "address" },
      { name: "feeRecipient", type: "address" },
      { name: "relayFeeBPS", type: "uint256" },
    ],
  },
] as const;
