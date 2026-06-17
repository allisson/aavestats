import { createPublicClient, http } from "viem";
import { getChain, type AaveChain } from "@/lib/chains";

/**
 * The single place a Watched-Address read builds its on-chain client: validate
 * the chain, pin the public RPC, bound the timeout. Every reader (position,
 * breakdown, catalog) goes through here, so the endpoint and timeout policy live
 * in one place rather than being inlined three times (see ADR 0001 / 0005 —
 * reads run in the browser against public RPC, no keyed endpoint).
 */
export function aaveClient(chainId: number) {
  const cfg = getChain(chainId);
  if (!cfg) throw new Error(`Unsupported chain: ${chainId}`);
  const client = createPublicClient({
    chain: cfg.chain,
    // Pinned public endpoint (viem's chain default is unreliable for some
    // chains). Bounded timeout so a dead RPC fails fast.
    transport: http(cfg.rpc, { timeout: 12_000 }),
  });
  return { cfg, client };
}

/** The configured client type these readers pass around. */
export type AaveClient = ReturnType<typeof aaveClient>["client"];
export type { AaveChain };
