# Website deployment

The website in [`site/`](../site) is a fully static Astro build, served by **Cloudflare Workers static assets** (assets only: no Worker script, no bindings, no database, no secrets).

## Build

| Item | Value |
| --- | --- |
| Runtime | Node.js ≥ 22.18, because the scripts are TypeScript run with Node's built-in type stripping (`site/.nvmrc`; if the build image ignores it, set the build variable `NODE_VERSION=22`) |
| Install | `npm ci` (in `site/`) |
| Build command | `npm run build` (in `site/`) |
| Output directory | `site/dist` |
| Deploy command | `npx wrangler deploy` (in `site/`, uses `site/wrangler.jsonc`) |
| Environment variables | `SITE_URL` (optional, **not secret**): the public origin, e.g. `https://debug-runbooks.<account>.workers.dev` or a custom domain. Used for canonical URLs, `og:url` and `sitemap.xml`. When it is unset the build still succeeds but omits them and prints a warning. |
| Secrets | None. No GitHub API token is used. |

`npm run build` runs three steps:

1. `scripts/build-activity.ts` reads git history and writes `src/data/activity.json`.
2. `astro build` renders all pages. The content loader fails the build if a runbook contains a known-format secret.
3. `scripts/scan-output.ts` scans `dist/` for known-format secrets, unredacted home paths and hostname emails, and fails the build if it finds any.

### Git history in CI

The activity trace needs full git history. If the build clone is shallow, the script runs `git fetch --unshallow` (the repository is public, so no credentials are needed). If that fails, it falls back to the committed `site/src/data/activity.snapshot.json` and the page labels the data "Snapshot as of …".

Refresh the snapshot occasionally with `node scripts/build-activity.ts --snapshot` and commit it.

## Cloudflare setup (one-time, dashboard)

1. **Workers & Pages → Create → Import a repository**, then select `wafisupri/debug-runbooks`.
2. Set:
   - **Root directory:** `site`
   - **Build command:** `npm run build`
   - **Deploy command:** `npx wrangler deploy`
   - **Production branch:** `main`
3. Under **Settings → Variables**, add the build variable `SITE_URL` once the production URL is known.
4. Enable **non-production branch builds** to get preview URLs for pull requests.

A custom domain can be added later under **Settings → Domains & Routes**. Workers custom domains require the domain's nameservers to be on Cloudflare.

## Preview workflow

- Every push to a non-production branch builds a preview version with its own URL, and production is untouched.
- Merging to `main` deploys production.
- Locally: `npm run build && npm run preview` in `site/`.

## Verification after deploy

```bash
curl -sI https://<site>/ | head -5                 # 200, security headers from public/_headers
curl -s https://<site>/robots.txt                  # includes Sitemap: when SITE_URL is set
curl -s https://<site>/sitemap-index.xml | head    # present when SITE_URL is set
curl -sI https://<site>/does-not-exist/            # 404 with the site's 404 page
```

Check the activity label on the home page. It should read "From git history", not "Snapshot as of", unless the fallback was intended.

## Rollback

Workers keeps previous versions. Roll back from **Deployments** in the dashboard, or with `npx wrangler rollback` in `site/`.
