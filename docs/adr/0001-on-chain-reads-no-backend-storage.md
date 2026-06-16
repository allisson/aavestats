# Read Positions on-chain via RPC, with no backend storage

We read Position data (collateral, debt, liquidation thresholds, E-Mode, prices)
directly from the Aave v3 contracts over an RPC endpoint using viem, rather than
from the Aave subgraph or a hosted API. This guarantees the numbers match what
Aave itself uses and removes a third-party uptime/lag dependency, at the cost of
more contract wiring. RPC calls run server-side in Next.js route handlers so RPC
keys stay off the client.

We also store nothing server-side: every view is a fresh on-chain read, and the
list of Watched Addresses lives in the URL / browser localStorage. This keeps v1
free of a database, accounts, and schedulers. Historical snapshots and alerting
are explicitly deferred — they would reintroduce storage and background jobs.
