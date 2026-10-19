# Navigation and content simplification

> Historical review from 11 October 2026, when Fuji contracts were not yet deployed. They were deployed and verified on 12 October 2026; see [HOSTING.md](HOSTING.md) for the current release.

Reviewed 11 October 2026. Scope: the Avalanche application, preserving its Alpine identity and all existing workflows.

## Research and decisions

- Clear text labels avoid ambiguity in navigation icons. Replace the eleven decorative icon/link rows with a shorter list of primary tasks. [NN/g: Icon Usability](https://www.nngroup.com/articles/icon-usability/).
- Keep frequent actions visible and give secondary tools a clear entry point. Five primary links is a choice for this application's tasks, not a universal research rule. [NN/g: Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/).
- Shorten repeated content first. Put only optional explanations in specifically named details; keep material fees, maturity, surrender conditions and transaction limits visible at decision time. [GOV.UK: Details](https://design-system.service.gov.uk/components/details/).
- Navigation disclosures use buttons and ordinary links, with expanded state, keyboard access, Escape dismissal and focus restoration. They are not application-style ARIA menus. [W3C: Disclosure Navigation](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/examples/disclosure-navigation/).
- Review focus visibility, form labels, layout overflow and touch targets against the [Vercel Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines/blob/main/command.md).

## Baseline

The production app showed eleven primary sidebar destinations. Desktop page word counts were 264 for Protect, 351 for Trade and 255 for Provide. These measure `document.body.innerText` split on whitespace across the whole rendered page, including navigation, numerals, labels and footer, without a connected wallet and with the default market. They are a density comparison, not a claim about user testing. [Baseline data](evidence/ui-simplification/baseline.json).

Fuji deployment stays deferred and the application continues to show that status. The existing contract and transaction verification remains documented in [E2E_REPORT.md](E2E_REPORT.md).

## Implementation and checks

Separate commits implement five primary text links (`4158402`), shorter copy and optional background details (`c3f22e0`), one compact pending-deployment notice (`dc97d11`), and correct focus after selecting the current page from a disclosure (`aca905c`). Portfolio groups Positions, Balances and Activity with local tabs. More retains all supporting tools; mobile uses an explicit Menu button.

Matched desktop counts after the changes are Protect **190** (28% fewer), Trade **219** (38% fewer) and Provide **193** (24% fewer). Menus and optional explanations were closed for both measurements. [After data](evidence/ui-simplification/after.json).

Ten JavaScript tests and the production build pass. Independent source review found no hidden essential terms or changed transaction logic. Browser checks verified desktop More opening, Tab navigation, Escape/focus restoration, optional-details keyboard access, and the 320px mobile Menu with no page overflow. Selecting the current route, a same-path query change and a different route all leave focus on the page heading. Portfolio tabs retain the selected pool. Protect → Trade → Faucet → Trade → Protect retains the wrapped pool and exact entered amount; Fuji transactions remain disabled as intended.

These are UI and navigation checks. Contract/signing evidence is from the preceding E2E release and was not rerun for this presentation-only change. Production deployment and screenshots are recorded in [HOSTING.md](HOSTING.md).
