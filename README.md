# 🌊 aavestats

A dashboard to view Aave v3 borrow **Positions** and simulate how they behave as
prices move — when and how Aave would **liquidate** them.

**🔗 Live:** https://allisson.github.io/aavestats/

Add one or more read-only **Watched Addresses**, pick a chain, and see each
Position's collateral, debt, Health Factor, and per-asset liquidation thresholds.
Then run a **Scenario**: shock collateral prices down (and volatile debt prices
up) and watch Aave's full liquidation **cascade** play out on a chart with
draggable price sliders. Or build a **Hypothetical Position** from scratch to
stress-test holdings you don't even have on Aave.

🛡️ No wallet connection, no sign-up, no backend — every read runs in your browser
against public RPC endpoints (see [ADR 0005](./docs/adr/0005-public-rpc-client-side-reads-static-export.md)).

📖 See [`CONTEXT.md`](./CONTEXT.md) for the domain glossary and
[`docs/adr/`](./docs/adr/) for key decisions.

## 🔍 What it does

- 👁️ **Watchlist** — add several addresses; each row shows a live Health Factor
  badge and persists in your browser (`localStorage`). Click one to open its full
  breakdown.
- 🧾 **Position breakdown** — per-asset collateral, debt, liquidation thresholds
  and bonuses, with active **E-Mode** applied. Every view is a fresh on-chain
  snapshot with an "updated N ago" indicator and a Refresh button.
- 📉 **Scenario** — sweep prices and replay the full liquidation cascade (Close
  Factor + Liquidation Bonus, repeated as the Health Factor re-crosses 1,
  including collateral exhaustion / bad debt). A **fall** slider per collateral
  asset and a **rise** slider per volatile debt asset let you stress both sides;
  each slider shows that asset's **liquidation price**.
- 🧪 **Hypothetical Positions** — simulate holdings you don't have on Aave. Build
  one from scratch (pick a chain, add assets, type collateral/debt amounts) or
  **fork** a Watched Address with "Edit as hypothetical." Only amounts are
  editable — every price, threshold, and bonus is read on-chain, and the same
  liquidation math (E-Mode included) runs against it. Saved positions persist as
  recipes and are re-priced live on open (see
  [ADR 0007](./docs/adr/0007-hypothetical-positions-repriced-recipes.md)).
- 🔗 **Multi-chain** — Ethereum, Arbitrum, Optimism, Base, and Polygon (Aave v3).
  Adding a chain is a single config entry in `src/lib/chains.ts`.

## 🚀 Getting started

```bash
npm install
npm run dev
```

Open **http://localhost:3000/aavestats** (the app is served under the `/aavestats`
basePath in dev and prod alike — see [ADR 0006](./docs/adr/0006-github-pages-project-page-deploy.md)),
pick a chain, and add an address to watch. There is nothing to configure — no
`.env`, no RPC keys. Public RPC endpoints are pinned per chain in
`src/lib/chains.ts`.

## 📜 Scripts

```bash
npm run dev            # dev server at http://localhost:3000/aavestats
npm run build          # type-check + static export → ./out
npm run lint           # eslint (flat config, eslint-config-next)
npm run format         # prettier --write .   (format:check verifies in CI)
npm test               # vitest unit tests (cascade engine + position math)
npm run test:watch     # vitest in watch mode
```

## 🧱 Stack

Next.js (App Router) · TypeScript · [viem](https://viem.sh) for on-chain reads ·
Tailwind · Recharts for the Scenario chart.

The app is a **static export** (`output: "export"`, `next build` → `./out`):
every read runs in the browser against public RPCs, so there is no server and no
RPC key to protect.

## 🗂️ Layout

- `src/lib/chains.ts` — per-chain Aave v3 config (Pool, Oracle, Protocol Data
  Provider addresses + public RPC), verified against bgd-labs/aave-address-book.
- `src/lib/aave/` — on-chain reads: aggregate (`position.ts`), per-asset
  breakdown (`breakdown.ts`), the reserve `catalog.ts` (the menu a Hypothetical
  Position is built from), the pure `hypothetical.ts` builder, and IO-free math
  (`positionMath.ts`).
- `src/lib/simulation/cascade.ts` — the deterministic liquidation cascade engine.
- `src/lib/watchlist.ts` / `src/lib/hypotheticals.ts` — `localStorage` persistence
  of watched addresses and saved Hypothetical Position recipes.
- `src/app/` — App Router UI; `actions.ts` holds the client-side viem read
  helpers (run in the browser, not server actions).
- `src/components/` — `Watchlist.tsx` (add form + persisted rows),
  `CascadePanel.tsx` (per-asset table + Scenario chart/sliders),
  `HypotheticalEditor.tsx` (amount-only editor with a live Scenario).
- `*.test.ts` (Vitest) — pin the cascade, liquidation price, reconcile, E-Mode
  override, and the hypothetical builder math.

## 🚢 Deployment

Pushes to `main` deploy the static export to **GitHub Pages** at
https://allisson.github.io/aavestats/ via GitHub Actions
(`.github/workflows/ci.yml`). The `deploy` job is gated on `check` (lint, format,
test, build) passing, so nothing ships unless CI is green. See
[ADR 0006](./docs/adr/0006-github-pages-project-page-deploy.md).

✅ CI runs lint + format:check + test + build on every push to `main` and on pull
requests; the build step guards the static export.

## 🤝 Contributing

- 🎨 Match the existing style; `npm run format` and `npm run lint` before pushing.
- 🧮 Keep the math tests green when touching the cascade or position math.
- 🗣️ Use the domain terms from [`CONTEXT.md`](./CONTEXT.md) exactly (e.g.
  **liquidation**, not "settlement"; **Position**, **Scenario**, **Watched
  Address**, **Hypothetical Position**).
- 📝 Record significant decisions as an ADR in [`docs/adr/`](./docs/adr/).

See [`CLAUDE.md`](./CLAUDE.md) for correctness requirements and known gaps
(isolation mode; the v3.1 small-position close-factor rule).
