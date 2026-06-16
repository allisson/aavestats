# aavestats

A dashboard to view Aave v3 positions and simulate how they behave as collateral
prices fall — when and how Aave would liquidate them.

See [`CONTEXT.md`](./CONTEXT.md) for the domain glossary and
[`docs/adr/`](./docs/adr/) for key decisions.

## Getting started

```bash
npm install
cp .env.example .env   # optional: add your own RPC URLs (falls back to public RPCs)
npm run dev
```

Open http://localhost:3000, pick a chain, and add a wallet address to watch. The
watchlist persists in your browser and shows a health-factor badge per address;
click one to open its full breakdown, with an "updated N ago" indicator and a
Refresh button. RPC reads run server-side so your RPC keys never reach the
browser.

## Status

Reads a position's per-asset breakdown on-chain (E-Mode aware) and simulates the
full Aave v3 liquidation **cascade** — close factor + liquidation bonus, replayed
as the health factor re-crosses 1, including collateral exhaustion / bad debt.
Drop one or more collateral prices and watch how Aave reacts; each collateral
shows its liquidation price.

See `CLAUDE.md` for remaining gaps (isolation mode; the v3.1 small-position rule).
