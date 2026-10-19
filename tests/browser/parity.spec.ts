import { test, expect } from "@playwright/test";
const routes: [string, string][] = [
  ["/", "Explore the upside."],
  ["/markets", "Find your market."],
  ["/protect", "Choose your protection."],
  ["/provide", "Put your capital to work."],
  ["/trade", "Trade. Then protect."],
  ["/positions", "My positions."],
  ["/portfolio", "Wallet balances."],
  ["/activity", "Activity."],
  ["/create-pool", "Set the terms. Supply the seed."],
  ["/faucet", "Get ready for the route."],
  ["/status", "Verify the ground beneath you."],
  ["/assets", "Know what you hold."],
  ["/how-it-works", "Two roles. One explicit tradeoff."],
  ["/legal", "An experiment with clear limits."],
];
test("direct routes render and remain readable at390px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [path, title] of routes) {
    await page.goto(path);
    await expect(
      page.getByRole("heading", { name: title, exact: false }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  await page.goto("/positions/reference:1?pool=reference");
  await expect(
    page.getByRole("heading", { name: "Position details." }),
  ).toBeVisible();
});
test("funding detour retains asset, amount, role and backing conversion", async ({
  page,
}) => {
  await page.goto("/protect?pool=wrapped");
  await page.getByLabel("Amount", { exact: true }).fill("0.25");
  await page.getByRole("link", { name: "Get an asset", exact: true }).click();
  await expect(page.getByLabel("Asset", { exact: true })).toHaveValue(
    "wrapped",
  );
  await expect(page.getByLabel("Amount", { exact: true })).toHaveValue("0.25");
  await page.getByRole("link", { name: "Get aDEMO", exact: true }).click();
  expect(page.url()).toContain("amount=0.25");
  await page.getByRole("link", { name: "Return to acquisition" }).click();
  await page
    .getByRole("link", { name: "Return to protection with your amount" })
    .click();
  await expect(page.getByLabel("Amount", { exact: true })).toHaveValue("0.25");
  await page.goBack();
  await expect(page.getByLabel("Asset", { exact: true })).toHaveValue(
    "wrapped",
  );
  await page.goto("/provide?pool=vault-backed&amount=500");
  await page.getByRole("link", { name: "Get an asset", exact: true }).click();
  await expect(page.getByLabel("Conversion", { exact: true })).toHaveValue(
    "deposit-backing",
  );
  await expect(
    page.getByLabel("Conversion amount", { exact: true }),
  ).toHaveValue("500");
});
test("unknown pool and mismatched detail reject silently redirected financial intent", async ({
  page,
}) => {
  await page.goto("/protect?pool=unknown");
  await expect(
    page.getByRole("heading", { name: "Invalid market selection" }),
  ).toBeVisible();
  await expect(page.getByLabel("Amount", { exact: true })).toHaveCount(0);
  await page.goto("/pools/wrapped?pool=reference");
  await expect(
    page.getByRole("heading", { name: "Invalid market selection" }),
  ).toBeVisible();
});
