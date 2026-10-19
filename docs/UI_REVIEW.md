# UI review — 11 October 2026

> Historical review from 11 October 2026, when Fuji contracts were not yet deployed. They were deployed and verified on 12 October 2026; see [HOSTING.md](HOSTING.md) for the current release.

Published application: `c539d9218880c76ef1c87584a4fc850302f6c7b2` at https://avalanche.yieldshield.ai. Vercel deployment `dpl_DBwk4uJNNiyaQWT8J3ptTUJ6f8C8` is READY; repository, branch, exact commit and custom-domain alias were verified. The later repository-banner merge and evidence commits contain no application changes.

## Fixes committed separately

- `0898fa6`: skip-to-content, route titles, breadcrumb labels and keyboard focus on the new page heading.
- `9649735`: compact mobile menu, 44px navigation targets and a visible amount-field focus outline.
- `db5b954`: semantic form labels, input names and units, decimal guidance, native select readability and heading hierarchy.
- `03ee79a`: conventional ICO and PNG favicon fallbacks and an Apple touch icon, retaining the existing Alpine SVG mark.
- `7f46621`: load fonts through document links instead of a CSS import waterfall.
- `2a77878`: preserve trade and conversion drafts through funding detours and refresh; prevent unrelated role navigation from inheriting amounts.
- `e20deec`: distinguish unavailable onchain data from prepared deployment terms and deployment status.
- `c539d92`: malformed route escapes no longer crash navigation.

## Verification

- Production build and five exact-unit tests pass. The existing bundle-size advisory remains; no new build error occurred.
- Browser checks at desktop, 320px and 390px covered page overflow, menu expansion/collapse, 44px navigation targets, 16px select text, visible 3px amount focus outline, skip navigation, route heading focus and document titles.
- A direct wrapped trade draft of `0.125` and a backing-vault conversion draft of `123.45` survived funding round-trips and refresh. A provider flow retained its original `120 bvaDEMO` requirement while the edited `125 aDEMO` conversion draft remained independent.
- On the public custom domain, SVG, ICO, PNG and touch icons returned HTTP 200 with the correct image media types. The page declares the icons; ICO and touch images were visually checked at 32×32 and 180×180.
- The deployed protection page and mobile menu were verified again after publication. No horizontal document overflow occurred at 390px and every expanded menu link measured 44px high. The final public browser console had no recorded errors.
- [Published desktop](evidence/ui-protect-desktop.jpg) and [published mobile](evidence/ui-protect-mobile.jpg) screenshots show the updated protection route.

No contract or deployment manifest changes were made. Fuji broadcasting remains deferred, and public wallet actions remain gated until deployment is verified. Wallet transactions were not executed in this UI pass; the earlier local native lifecycle evidence is separate. Both grant applications remain held for user review.
