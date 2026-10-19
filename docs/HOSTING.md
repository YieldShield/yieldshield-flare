# Hosting (prepared, not created)

**Nothing here has been created or published yet.** As of 19 October 2026:

- no Vercel project or domain exists for this repository;
- no public deployment has been made;
- the GitHub repository is private.

This page is the plan for the owner to carry out.

## Target

| Item | Value |
|---|---|
| Vercel project | `yieldshield-flare`, in the existing YieldShield team |
| Production domain | `flare.yieldshield.ai` (a subdomain of the existing `yieldshield.ai`) |
| Git source | `YieldShield/yieldshield-flare`, branch `main` |
| Framework preset | Vite |
| Install command | `npm ci --ignore-scripts` |
| Build command | `npm run build`, which runs `tsc --noEmit && vite build` |
| Output directory | `dist` |
| Node.js | 22 or newer |
| Environment variables | None. Public identities come from `config/deployment.json`; there is no server signer, API key or database |

## Security headers

`vercel.json` is unchanged from the template. It rewrites every non-asset route to the SPA entry point, sends long-lived immutable caching for `/assets/*`, and sends these headers on every response:

- `Content-Security-Policy: frame-ancestors 'none'; base-uri 'self'; object-src 'none'`
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`

`.vercelignore` excludes:

- `.git`, `.secrets`, `.env*` and `.local`;
- `node_modules`, `contracts/out` and `contracts/cache`;
- test results and Playwright reports.

## Owner steps

1. Create the Vercel project from the GitHub repository with the settings above. Keep deployment protection on previews.
2. Add the domain `flare.yieldshield.ai` and create the DNS record Vercel asks for.
3. Check the production URL:
   - the headers above are present;
   - `/status` shows FTSOv2 FLR/USD as valid;
   - `/markets` shows the deployment gate while the manifest is `awaiting-testnet-gas`;
   - deep routes such as `/protect?pool=reference` load;
   - at 390 px there is no horizontal overflow.
4. After the Coston2 deployment is verified, rebuild from the commit that records the `deployed-and-verified` manifest. Confirm the bundle contains the factory address and no `awaiting-testnet-gas`. Then record the deployment ID and commit here.

Publishing the site before the contracts are deployed is safe. Every write stays disabled and is labeled "Awaiting Coston2 deployment", while the status page already shows the live FTSOv2 reading. Decide whether to publish before or after funding.

## What the site must say

The site is already built with these labels. Keep them on every release:

- "Flare Testnet Coston2" and "TESTNET ONLY";
- sDEMO is "not USDT0, no value";
- FTSOv2 prices are reference prices for test assets with no value;
- local test results do not confirm a Coston2 deployment.
