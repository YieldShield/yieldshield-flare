import { test, expect } from "@playwright/test";
test("undeployed UI, no-wallet feedback and scenario disclosures", async ({
  page,
}) => {
  await page.goto("/protect");
  await expect(
    page.getByRole("button", { name: "Awaiting Fuji deployment" }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Ethereum-compatible wallet",
  );
  await page.goto("/how-it-works");
  await page.getByRole("slider").fill("60");
  await expect(page.getByText("+60%", { exact: true })).toBeVisible();
  await expect(
    page.getByText(/At maturity, remaining assets are surrendered/),
  ).toBeVisible();
});
test("denied browser storage does not prevent rendering", async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new Error("storage unavailable");
    };
  });
  await page.goto("/portfolio");
  await expect(
    page.getByRole("heading", { name: "Wallet balances." }),
  ).toBeVisible();
});
test("wallet account and network changes clear the connected session", async ({
  page,
}) => {
  await page.addInitScript(() => {
    let account = "0x1111111111111111111111111111111111111111";
    let chain = "0xa869";
    const listeners: Record<string, Set<(...args: unknown[]) => void>> = {};
    const provider = {
      async request({ method }: { method: string }) {
        if (method === "eth_requestAccounts" || method === "eth_accounts")
          return [account];
        if (method === "eth_chainId") return chain;
        if (method === "wallet_switchEthereumChain") {
          chain = "0xa869";
          return null;
        }
        throw new Error(`Unexpected wallet method ${method}`);
      },
      on(event: string, callback: (...args: unknown[]) => void) {
        (listeners[event] ??= new Set()).add(callback);
      },
      removeListener(event: string, callback: (...args: unknown[]) => void) {
        listeners[event]?.delete(callback);
      },
    };
    Object.assign(window, {
      ethereum: provider,
      testWalletChange(event: string) {
        if (event === "accountsChanged")
          account = "0x2222222222222222222222222222222222222222";
        else chain = "0x1";
        listeners[event]?.forEach((callback) =>
          callback(event === "accountsChanged" ? [account] : chain),
        );
      },
    });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Connect wallet", exact: false })
    .first()
    .click();
  await expect(page.getByRole("button", { name: /0x1111…1111/ })).toBeVisible();
  await page.evaluate(() =>
    (window as any).testWalletChange("accountsChanged"),
  );
  await expect(
    page.getByRole("button", { name: "Connect wallet", exact: false }).first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Connect wallet", exact: false })
    .first()
    .click();
  await expect(page.getByRole("button", { name: /0x2222…2222/ })).toBeVisible();
  await page.evaluate(() => (window as any).testWalletChange("chainChanged"));
  await expect(
    page.getByRole("button", { name: "Connect wallet", exact: false }).first(),
  ).toBeVisible();
});
