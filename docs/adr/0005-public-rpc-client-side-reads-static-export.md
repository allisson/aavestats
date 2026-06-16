# Public RPC only, client-side reads, static export

We read every Position directly from public RPC endpoints, from the user's
browser, and ship the app as a static export. This supersedes the "server-side"
half of ADR 0001 (the RPC-vs-subgraph and no-backend-storage decisions there
still stand).

ADR 0001 ran reads server-side for two reasons: to keep RPC keys off the client,
and to avoid backend storage. By committing to **public RPC endpoints only** (no
keyed Alchemy/Infura URL), the first reason disappears — there is no secret to
hide. The pinned publicnode endpoints all return `access-control-allow-origin: *`,
so the browser can call them directly. With reads in the browser there is nothing
left for the Next.js server to do, so we set `output: 'export'` and serve the app
as static files from any CDN.

What we gain: no server to run or deploy, no env configuration, and RPC load that
distributes across each visitor's IP instead of concentrating on one server
egress. The no-backend-storage intent of ADR 0001 is honored more fully — there
is no backend at all.

What we give up, deliberately and irreversibly: a static client app cannot hide
an API key, so we can never adopt a keyed RPC for better rate limits or
reliability without re-introducing a server. We accept dependence on public RPC
availability and rate limits, and viem now ships in the client bundle. This is a
considered trade of reliability headroom for zero-infrastructure simplicity — do
not re-introduce a server "for security" without revisiting this decision.
