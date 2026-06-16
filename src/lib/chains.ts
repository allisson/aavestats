import {
  type Chain,
  mainnet,
  arbitrum,
  optimism,
  base,
  polygon,
} from "viem/chains";

/**
 * Per-chain Aave v3 config. Adding a chain is a single entry here — no code
 * changes elsewhere (see docs/adr/0001). POOL and ORACLE addresses are taken
 * verbatim from bgd-labs/aave-address-book.
 */
export type AaveChain = {
  id: number;
  label: string;
  chain: Chain;
  pool: `0x${string}`;
  oracle: `0x${string}`;
  dataProvider: `0x${string}`; // AaveProtocolDataProvider (decoded per-asset reads)
  rpcEnv: string; // name of the env var holding this chain's RPC URL
};

export const AAVE_CHAINS: AaveChain[] = [
  {
    id: 42161,
    label: "Arbitrum",
    chain: arbitrum,
    pool: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
    oracle: "0xb56c2F0B653B2e0b10C9b928C8580Ac5Df02C7C7",
    dataProvider: "0x243Aa95cAC2a25651eda86e80bEe66114413c43b",
    rpcEnv: "RPC_URL_ARBITRUM",
  },
  {
    id: 1,
    label: "Ethereum",
    chain: mainnet,
    pool: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2",
    oracle: "0x54586bE62E3c3580375aE3723C145253060Ca0C2",
    dataProvider: "0x0a16f2FCC0D44FaE41cc54e079281D84A363bECD",
    rpcEnv: "RPC_URL_ETHEREUM",
  },
  {
    id: 10,
    label: "Optimism",
    chain: optimism,
    pool: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
    oracle: "0xD81eb3728a631871a7eBBaD631b5f424909f0c77",
    dataProvider: "0x243Aa95cAC2a25651eda86e80bEe66114413c43b",
    rpcEnv: "RPC_URL_OPTIMISM",
  },
  {
    id: 8453,
    label: "Base",
    chain: base,
    pool: "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5",
    oracle: "0x2Cc0Fc26eD4563A5ce5e8bdcfe1A2878676Ae156",
    dataProvider: "0x0F43731EB8d45A581f4a36DD74F5f358bc90C73A",
    rpcEnv: "RPC_URL_BASE",
  },
  {
    id: 137,
    label: "Polygon",
    chain: polygon,
    pool: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
    oracle: "0xb023e699F5a33916Ea823A16485e259257cA8Bd1",
    dataProvider: "0x243Aa95cAC2a25651eda86e80bEe66114413c43b",
    rpcEnv: "RPC_URL_POLYGON",
  },
];

export const getChain = (id: number): AaveChain | undefined =>
  AAVE_CHAINS.find((c) => c.id === id);
