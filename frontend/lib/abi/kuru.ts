// Subsets of the Kuru Spot V2 ABIs (from @toxicflow-labs/ts-sdk 0.3.0).
export const kuruAccountCoreAbi = [
  {
    "type": "function",
    "name": "deposit",
    "stateMutability": "payable",
    "inputs": [
      {
        "name": "rootOwner",
        "type": "address"
      },
      {
        "name": "token",
        "type": "address"
      },
      {
        "name": "amount",
        "type": "uint256"
      }
    ],
    "outputs": []
  },
  {
    "type": "function",
    "name": "getBalance",
    "stateMutability": "view",
    "inputs": [
      {
        "name": "accountId",
        "type": "uint40"
      },
      {
        "name": "token",
        "type": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256"
      }
    ]
  },
  {
    "type": "function",
    "name": "rootAccountIdOf",
    "stateMutability": "view",
    "inputs": [
      {
        "name": "",
        "type": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint40"
      }
    ]
  },
  {
    "type": "function",
    "name": "withdraw",
    "stateMutability": "nonpayable",
    "inputs": [
      {
        "name": "rootAccountId",
        "type": "uint40"
      },
      {
        "name": "token",
        "type": "address"
      },
      {
        "name": "amount",
        "type": "uint256"
      },
      {
        "name": "recipient",
        "type": "address"
      }
    ],
    "outputs": []
  }
] as const;

export const kuruOrderBookAbi = [
  {
    "type": "function",
    "name": "baseToken",
    "stateMutability": "view",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address"
      }
    ]
  },
  {
    "type": "function",
    "name": "bestBidAsk",
    "stateMutability": "view",
    "inputs": [],
    "outputs": [
      {
        "name": "bid",
        "type": "uint32"
      },
      {
        "name": "ask",
        "type": "uint32"
      }
    ]
  },
  {
    "type": "function",
    "name": "estimateSwap",
    "stateMutability": "view",
    "inputs": [
      {
        "name": "isBuy",
        "type": "bool"
      },
      {
        "name": "amountIn",
        "type": "uint128"
      }
    ],
    "outputs": [
      {
        "name": "result",
        "type": "tuple",
        "components": [
          {
            "name": "amountInUsed",
            "type": "uint128"
          },
          {
            "name": "amountOut",
            "type": "uint128"
          }
        ]
      }
    ]
  },
  {
    "type": "function",
    "name": "getMarketParams",
    "stateMutability": "view",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint32"
      },
      {
        "name": "",
        "type": "uint96"
      },
      {
        "name": "",
        "type": "uint32"
      },
      {
        "name": "",
        "type": "uint96"
      },
      {
        "name": "",
        "type": "uint96"
      },
      {
        "name": "",
        "type": "uint256"
      },
      {
        "name": "",
        "type": "uint256"
      }
    ]
  },
  {
    "type": "function",
    "name": "quoteToken",
    "stateMutability": "view",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address"
      }
    ]
  },
  {
    "type": "function",
    "name": "swap",
    "stateMutability": "nonpayable",
    "inputs": [
      {
        "name": "userId",
        "type": "uint40"
      },
      {
        "name": "isBuy",
        "type": "bool"
      },
      {
        "name": "amountIn",
        "type": "uint128"
      },
      {
        "name": "minAmountOut",
        "type": "uint128"
      },
      {
        "name": "deadline",
        "type": "uint64"
      }
    ],
    "outputs": [
      {
        "name": "result",
        "type": "tuple",
        "components": [
          {
            "name": "amountInUsed",
            "type": "uint128"
          },
          {
            "name": "amountOut",
            "type": "uint128"
          }
        ]
      }
    ]
  },
  {
    "type": "function",
    "name": "getL2Book",
    "stateMutability": "view",
    "inputs": [
      {
        "name": "levels",
        "type": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "bidPrices",
        "type": "uint32[]"
      },
      {
        "name": "bidSizes",
        "type": "uint96[]"
      },
      {
        "name": "askPrices",
        "type": "uint32[]"
      },
      {
        "name": "askSizes",
        "type": "uint96[]"
      }
    ]
  }
] as const;
