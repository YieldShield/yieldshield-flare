# Hosting (prepared, not created)

**Nothing here has been created or published yet.** As of 19 October 2026:

- no Vercel project or domain exists for this repository;
- no public deployment has been made;
- the GitHub repository is private.

The contracts, however, are deployed and verified on Coston2: deployment `coston2-2026-10-19T07-50-55Z-34db01`, factory `0xd6488c73f25663f3ba252aab053932cb5fae1f3c`. The manifest on `main` is `deployed-and-verified`, so a build from `main` enables writes against it.

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
3. Check the production build:
   - the entry bundle contains the factory `0xd6488c73f25663f3ba252aab053932cb5fae1f3c`, `deployed-and-verified` and no `awaiting-testnet-gas`.
4. Check the production URL:
   - the headers above are present;
   - `/status` shows FTSOv2 FLR/USD as valid and the deployed adapter price;
   - `/markets` lists the five live markets with their price and available entry claims, and no deployment gate;
   - deep routes such as `/protect?pool=reference` load;
   - at 390 px there is no horizontal overflow.
5. Do the first real wallet-extension transaction on the published site. MetaMask on Coston2 is enough: for example, the sDEMO faucet claim and one protection. Record its hash in [E2E_REPORT](E2E_REPORT.md). Then record the Vercel deployment ID and commit here.
6. Republish after every featured-market replacement. The first is due before 18 November 2026, 07:51 UTC. The site must list the new market addresses.

## What the site must say

The site is already built with these labels. Keep them on every release:

- "Flare Testnet Coston2" and "TESTNET ONLY";
- sDEMO is "not USDT0, no value";
- FTSOv2 prices are reference prices for test assets with no value;
- local test results do not confirm a Coston2 deployment.
