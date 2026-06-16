# GitHub Pages project page, deployed via GitHub Actions

We host the static export (ADR 0005) on **GitHub Pages as a project page** at
`https://allisson.github.io/aavestats/`, published by a **GitHub Actions** job
that runs after CI passes.

ADR 0005 made the app a static export "servable from any CDN" but did not pick a
host. Pages is the lowest-friction choice for a public repo: no account beyond
GitHub, no DNS, no cost. A _project_ page (served under the repo-name subpath)
rather than a user page or custom domain means we don't consume the one
`allisson.github.io` user-page slot and don't have to own a domain.

The subpath has one consequence: routes and assets must resolve under
`/aavestats/`, so `next.config.mjs` hardcodes `basePath: "/aavestats"`. We
hardcode it unconditionally — it applies in `next dev` too (local dev serves at
`localhost:3000/aavestats`) — so dev and prod configs stay identical and any
subpath-relative link bug surfaces locally instead of only on Pages.

We publish with the **GitHub Actions** Pages path (`upload-pages-artifact` +
`deploy-pages`) rather than "deploy from a branch". This keeps build artifacts
out of git, reuses the existing `ci.yml` build, and skips Jekyll entirely — so
Next's underscore-prefixed `_next/` asset dir needs no `.nojekyll` workaround.
The deploy is a job gated on `needs: check` and `github.ref == 'refs/heads/main'`,
so nothing ships unless lint, format, test, and build are green on `main`.

What we give up: the host and the repo name are now baked into `basePath`. Moving
to a custom domain or renaming the repo is a config change (and a Pages setting),
not a no-op — but it only _removes_ the basePath, so it doesn't constrain the
code. The repo's **Settings → Pages → Source** must be set to "GitHub Actions"
once by hand (or via `gh api`); it cannot be set by the workflow itself.
