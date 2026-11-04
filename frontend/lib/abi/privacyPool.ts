// The slice of the 0xbow PrivacyPool the app reads: its event log is the source of truth for notes.
export const privacyPoolAbi = [
  {
    type: "event",
    name: "Deposited",
    inputs: [
      { name: "_depositor", type: "address", indexed: true },
      { name: "_commitment", type: "uint256", indexed: false },
      { name: "_label", type: "uint256", indexed: false },
      { name: "_value", type: "uint256", indexed: false },
      { name: "_precommitmentHash", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Withdrawn",
    inputs: [
      { name: "_processooor", type: "address", indexed: true },
      { name: "_value", type: "uint256", indexed: false },
      { name: "_spentNullifier", type: "uint256", indexed: false },
      { name: "_newCommitment", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Ragequit",
    inputs: [
      { name: "_ragequitter", type: "address", indexed: true },
      { name: "_commitment", type: "uint256", indexed: false },
      { name: "_label", type: "uint256", indexed: false },
      { name: "_value", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "LeafInserted",
    inputs: [
      { name: "_index", type: "uint256", indexed: false },
      { name: "_leaf", type: "uint256", indexed: false },
      { name: "_root", type: "uint256", indexed: false },
    ],
  },
] as const;
