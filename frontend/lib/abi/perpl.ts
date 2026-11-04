// Subset of the Perpl Exchange ABI (testnet exchange impl, contract v1.7.5).
export const perplExchangeAbi = [
  {
    "type": "function",
    "name": "createAccount",
    "stateMutability": "nonpayable",
    "inputs": [
      {
        "name": "amountCNS",
        "type": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "accountId",
        "type": "uint256"
      }
    ]
  },
  {
    "type": "function",
    "name": "depositCollateral",
    "stateMutability": "nonpayable",
    "inputs": [
      {
        "name": "amountCNS",
        "type": "uint256"
      }
    ],
    "outputs": []
  },
  {
    "type": "function",
    "name": "execOrder",
    "stateMutability": "nonpayable",
    "inputs": [
      {
        "name": "orderDesc",
        "type": "tuple",
        "components": [
          {
            "name": "orderDescId",
            "type": "uint256"
          },
          {
            "name": "perpId",
            "type": "uint256"
          },
          {
            "name": "orderType",
            "type": "uint8"
          },
          {
            "name": "orderId",
            "type": "uint256"
          },
          {
            "name": "pricePNS",
            "type": "uint256"
          },
          {
            "name": "lotLNS",
            "type": "uint256"
          },
          {
            "name": "expiryBlock",
            "type": "uint256"
          },
          {
            "name": "postOnly",
            "type": "bool"
          },
          {
            "name": "fillOrKill",
            "type": "bool"
          },
          {
            "name": "immediateOrCancel",
            "type": "bool"
          },
          {
            "name": "maxMatches",
            "type": "uint256"
          },
          {
            "name": "leverageHdths",
            "type": "uint256"
          },
          {
            "name": "lastExecutionBlock",
            "type": "uint256"
          },
          {
            "name": "amountCNS",
            "type": "uint256"
          },
          {
            "name": "maxNegPnlCollatBPS",
            "type": "uint256"
          }
        ]
      }
    ],
    "outputs": [
      {
        "name": "signature",
        "type": "tuple",
        "components": [
          {
            "name": "perpId",
            "type": "uint256"
          },
          {
            "name": "orderId",
            "type": "uint256"
          }
        ]
      }
    ]
  },
  {
    "type": "function",
    "name": "getAccountByAddr",
    "stateMutability": "view",
    "inputs": [
      {
        "name": "accountAddress",
        "type": "address"
      }
    ],
    "outputs": [
      {
        "name": "accountInfo",
        "type": "tuple",
        "components": [
          {
            "name": "accountId",
            "type": "uint256"
          },
          {
            "name": "balanceCNS",
            "type": "uint256"
          },
          {
            "name": "lockedBalanceCNS",
            "type": "uint256"
          },
          {
            "name": "frozen",
            "type": "uint8"
          },
          {
            "name": "accountAddr",
            "type": "address"
          },
          {
            "name": "positions",
            "type": "tuple",
            "components": [
              {
                "name": "bank1",
                "type": "uint256"
              },
              {
                "name": "bank2",
                "type": "uint256"
              },
              {
                "name": "bank3",
                "type": "uint256"
              },
              {
                "name": "bank4",
                "type": "uint256"
              }
            ]
          }
        ]
      }
    ]
  },
  {
    "type": "function",
    "name": "getMarginFractions",
    "stateMutability": "view",
    "inputs": [
      {
        "name": "perpId",
        "type": "uint256"
      },
      {
        "name": "lotLNS",
        "type": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "perpInitMarginFracHdths",
        "type": "uint256"
      },
      {
        "name": "perpMaintMarginFracHdths",
        "type": "uint256"
      },
      {
        "name": "dynamicInitMarginFracHdths",
        "type": "uint256"
      },
      {
        "name": "oiMaxLNS",
        "type": "uint256"
      },
      {
        "name": "unityDescentThreshHdths",
        "type": "uint256"
      },
      {
        "name": "overColDescentThreshHdths",
        "type": "uint256"
      }
    ]
  },
  {
    "type": "function",
    "name": "getPerpetualInfoV2",
    "stateMutability": "view",
    "inputs": [
      {
        "name": "perpId",
        "type": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "perpetualInfo",
        "type": "tuple",
        "components": [
          {
            "name": "name",
            "type": "string"
          },
          {
            "name": "symbol",
            "type": "string"
          },
          {
            "name": "priceDecimals",
            "type": "uint256"
          },
          {
            "name": "lotDecimals",
            "type": "uint256"
          },
          {
            "name": "linkFeedId",
            "type": "bytes32"
          },
          {
            "name": "priceTolPer100K",
            "type": "uint256"
          },
          {
            "name": "marginTol",
            "type": "uint256"
          },
          {
            "name": "marginTolDecimals",
            "type": "uint256"
          },
          {
            "name": "refPriceMaxAgeSec",
            "type": "uint256"
          },
          {
            "name": "positionBalanceCNS",
            "type": "uint256"
          },
          {
            "name": "insuranceBalanceCNS",
            "type": "uint256"
          },
          {
            "name": "markPNS",
            "type": "uint256"
          },
          {
            "name": "markTimestamp",
            "type": "uint256"
          },
          {
            "name": "lastPNS",
            "type": "uint256"
          },
          {
            "name": "lastTimestamp",
            "type": "uint256"
          },
          {
            "name": "oraclePNS",
            "type": "uint256"
          },
          {
            "name": "oracleTimestampSec",
            "type": "uint256"
          },
          {
            "name": "longOpenInterestLNS",
            "type": "uint256"
          },
          {
            "name": "shortOpenInterestLNS",
            "type": "uint256"
          },
          {
            "name": "fundingStartBlock",
            "type": "uint256"
          },
          {
            "name": "fundingRatePct100k",
            "type": "int16"
          },
          {
            "name": "absFundingClampPctPer100K",
            "type": "uint256"
          },
          {
            "name": "status",
            "type": "uint8"
          },
          {
            "name": "basePricePNS",
            "type": "uint256"
          },
          {
            "name": "maxBidPriceONS",
            "type": "uint256"
          },
          {
            "name": "minBidPriceONS",
            "type": "uint256"
          },
          {
            "name": "maxAskPriceONS",
            "type": "uint256"
          },
          {
            "name": "minAskPriceONS",
            "type": "uint256"
          },
          {
            "name": "numOrders",
            "type": "uint256"
          },
          {
            "name": "ignOracle",
            "type": "bool"
          },
          {
            "name": "fundingSumScalingExp",
            "type": "uint256"
          }
        ]
      }
    ]
  },
  {
    "type": "function",
    "name": "getPositionV2",
    "stateMutability": "view",
    "inputs": [
      {
        "name": "perpId",
        "type": "uint256"
      },
      {
        "name": "accountId",
        "type": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "positionInfo",
        "type": "tuple",
        "components": [
          {
            "name": "accountId",
            "type": "uint256"
          },
          {
            "name": "nextNodeId",
            "type": "uint256"
          },
          {
            "name": "prevNodeId",
            "type": "uint256"
          },
          {
            "name": "positionType",
            "type": "uint8"
          },
          {
            "name": "depositCNS",
            "type": "uint256"
          },
          {
            "name": "pricePNS",
            "type": "uint256"
          },
          {
            "name": "lotLNS",
            "type": "uint256"
          },
          {
            "name": "entryBlock",
            "type": "uint256"
          },
          {
            "name": "pnlCNS",
            "type": "int256"
          },
          {
            "name": "deltaPnlCNS",
            "type": "int256"
          },
          {
            "name": "premiumPnlCNS",
            "type": "int256"
          },
          {
            "name": "priceResiduePNSQ16",
            "type": "uint256"
          }
        ]
      },
      {
        "name": "markPricePNS",
        "type": "uint256"
      },
      {
        "name": "markPriceValid",
        "type": "bool"
      }
    ]
  },
  {
    "type": "function",
    "name": "getTakerFee",
    "stateMutability": "view",
    "inputs": [
      {
        "name": "perpId",
        "type": "uint256"
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
    "name": "withdrawCollateral",
    "stateMutability": "nonpayable",
    "inputs": [
      {
        "name": "amountCNS",
        "type": "uint256"
      }
    ],
    "outputs": []
  },
  {
    "type": "error",
    "name": "AccountDoesNotExist",
    "inputs": [
      {
        "name": "accountAddress",
        "type": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "OracleAgeExceedsMax",
    "inputs": [
      {
        "name": "perpId",
        "type": "uint256"
      },
      {
        "name": "oracleTimestamp",
        "type": "uint256"
      },
      {
        "name": "timestamp",
        "type": "uint256"
      },
      {
        "name": "maxAgeSec",
        "type": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "TakerOrderSettlementFailed",
    "inputs": [
      {
        "name": "perpId",
        "type": "uint256"
      },
      {
        "name": "accountId",
        "type": "uint256"
      },
      {
        "name": "entryPricePNS",
        "type": "uint256"
      },
      {
        "name": "collatPricePNS",
        "type": "uint256"
      },
      {
        "name": "pnlPricePNS",
        "type": "uint256"
      },
      {
        "name": "filledLotLNS",
        "type": "uint256"
      },
      {
        "name": "unfillableLotLNS",
        "type": "uint256"
      },
      {
        "name": "resultCode",
        "type": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "ExceedsLastExecutionBlock",
    "inputs": [
      { "name": "arg0", "type": "uint256" }
    ]
  },
  {
    "type": "error",
    "name": "PriceOutOfRange",
    "inputs": [
      { "name": "arg0", "type": "uint256" },
      { "name": "arg1", "type": "uint256" },
      { "name": "arg2", "type": "uint256" }
    ]
  },
  {
    "type": "error",
    "name": "AmountExceedsAvailableBalance",
    "inputs": [
      { "name": "arg0", "type": "uint256" },
      { "name": "arg1", "type": "uint256" },
      { "name": "arg2", "type": "uint256" }
    ]
  },
  {
    "type": "error",
    "name": "CloseOrderExceedsPosition",
    "inputs": [
      { "name": "arg0", "type": "uint256" },
      { "name": "arg1", "type": "uint256" }
    ]
  },
  {
    "type": "error",
    "name": "MarkPriceAgeExceedsMax",
    "inputs": [
      { "name": "arg0", "type": "uint256" },
      { "name": "arg1", "type": "uint256" },
      { "name": "arg2", "type": "uint256" },
      { "name": "arg3", "type": "uint256" }
    ]
  }
] as const;
