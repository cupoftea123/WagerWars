export const WAGER_WARS_ADDRESS = (process.env.NEXT_PUBLIC_WAGER_WARS_ADDRESS || "0x") as `0x${string}`;
export const USDC_ADDRESS = (process.env.NEXT_PUBLIC_USDC_ADDRESS || "0x5425890298aed601595a70AB815c96711a31Bc65") as `0x${string}`;

export const WAGER_WARS_ABI = [
  {
    name: "createMatch",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "matchId", type: "bytes32" },
      { name: "wagerAmount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "joinMatch",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "matchId", type: "bytes32" }],
    outputs: [],
  },
  {
    name: "settleMatch",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "matchId", type: "bytes32" },
      { name: "winner", type: "address" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
  {
    name: "cancelMatch",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "matchId", type: "bytes32" }],
    outputs: [],
  },
  {
    name: "withdraw",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    name: "pendingWithdrawals",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "getMatch",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "matchId", type: "bytes32" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "player1", type: "address" },
          { name: "player2", type: "address" },
          { name: "wagerAmount", type: "uint256" },
          { name: "status", type: "uint8" },
          { name: "winner", type: "address" },
          { name: "createdAt", type: "uint256" },
          { name: "expiresAt", type: "uint256" },
        ],
      },
    ],
  },
] as const;

export const MATCH_PAYOUT_EVENT = {
  name: "MatchPayout",
  type: "event",
  inputs: [
    { name: "matchId", type: "bytes32", indexed: true },
    { name: "player", type: "address", indexed: true },
    { name: "amount", type: "uint256", indexed: false },
  ],
} as const;

export const MATCH_SETTLED_EVENT = {
  name: "MatchSettled",
  type: "event",
  inputs: [
    { name: "matchId", type: "bytes32", indexed: true },
    { name: "winner", type: "address", indexed: true },
    { name: "payout", type: "uint256", indexed: false },
    { name: "fee", type: "uint256", indexed: false },
  ],
} as const;

export const ERC20_ABI = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;
