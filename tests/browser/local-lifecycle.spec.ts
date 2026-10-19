import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createPublicClient, http, encodeFunctionData, parseAbi } from "viem";
const enabled = process.env.SHIELD_LOCAL_E2E === "1";
test("local signed browser journey: faucet → provider → funded buy → protect → partial exit → claim", async ({
  page,
}) => {
  test.skip(!enabled, "Explicit local-only chain setup required.");
  test.setTimeout(180000);
  const m = JSON.parse(readFileSync(".local/deployment.json", "utf8"));
  const rpc = createPublicClient({ transport: http("http://127.0.0.1:8547") });
  expect(await rpc.getChainId()).toBe(31337);
  const accounts = (await rpc.request({
    method: "eth_accounts",
  } as any)) as string[];
  const account = accounts[2];
  await page.exposeFunction("__walletRpc", async (request: any) => {
    if (
      request.method === "eth_requestAccounts" ||
      request.method === "eth_accounts"
    )
      return [account];
    if (request.method === "wallet_switchEthereumChain") return null;
    if (request.method === "wallet_addEthereumChain") return null;
    return rpc.request(request);
  });
  await page.addInitScript(() => {
    (window as any).ethereum = {
      request: (r: any) => (window as any).__walletRpc(r),
      on: () => {},
      removeListener: () => {},
    };
  });
  await page.goto("http://127.0.0.1:5184/faucet");
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .first()
    .click();
  await expect(page.getByRole("button", { name: "Claim aDEMO" })).toBeEnabled();
  await page.getByRole("button", { name: "Claim aDEMO" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Claim test aDEMO confirmed.",
    { timeout: 30000 },
  );
  await page.goto("http://127.0.0.1:5184/provide?pool=wrapped");
  // The authorized wallet is restored after a full page load without another prompt.
  await expect(
    page.getByRole("button", { name: "Connect wallet", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Amount", { exact: true }).fill("500");
  await page.getByRole("button", { name: "Review provision" }).click();
  await page.getByRole("button", { name: "Confirm capital provision" }).click();
  await expect(
    page.getByRole("heading", { name: "Capital provided." }),
  ).toBeVisible({ timeout: 30000 });
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Trade", exact: true })
    .click();
  await page.getByLabel("Asset", { exact: true }).selectOption("wrapped");
  await page.getByLabel("Amount", { exact: true }).fill("0.001");
  await page.getByRole("button", { name: "Review trade", exact: true }).click();
  await expect(page.getByText("Maximum payment")).toBeVisible();
  await page.getByRole("button", { name: "Confirm buy" }).click();
  await expect(
    page.getByRole("heading", { name: "Trade confirmed." }),
  ).toBeVisible({ timeout: 30000 });
  await page.getByRole("link", { name: "Protect this exact amount" }).click();
  await expect(page.getByLabel("Amount", { exact: true })).toHaveValue("0.001");
  await page.getByRole("button", { name: "Review protection" }).click();
  await page.getByRole("button", { name: "Confirm protection" }).click();
  await expect(
    page.getByRole("heading", { name: "Protection opened." }),
  ).toBeVisible({ timeout: 30000 });
  await page.getByRole("link", { name: "View position" }).click();
  await rpc.request({ method: "evm_increaseTime", params: [61] } as any);
  await rpc.request({ method: "evm_mine", params: [] } as any);
  await rpc.request({
    method: "eth_sendTransaction",
    params: [
      {
        from: accounts[0],
        to: m.referenceOracle,
        data: encodeFunctionData({
          abi: parseAbi(["function set(uint256)"]),
          functionName: "set",
          args: [50000000n],
        }),
      },
    ],
  } as any);
  await page.getByLabel("Amount to exit", { exact: true }).fill("0.0005");
  await page.getByRole("button", { name: "Review exit", exact: true }).click();
  await page.getByRole("button", { name: "Confirm exit", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "Partial asset exit confirmed.",
    { timeout: 30000 },
  );
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Portfolio", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Claim earned fees", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Claim provider rewards confirmed.",
    { timeout: 30000 },
  );
  await page
    .getByRole("navigation", { name: "Portfolio navigation" })
    .getByRole("link", { name: "Activity", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Claim provider rewards", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Portfolio navigation" })
    .getByRole("link", { name: "Balances", exact: true })
    .click();
  await page.getByRole("button", { name: /Disconnect/ }).click();
  await expect(
    page.getByRole("heading", { name: "Connect your wallet" }),
  ).toBeVisible();
});
test("an in-flight quote cannot revive a previous asset review", async ({
  page,
}) => {
  test.skip(!enabled, "Explicit local-only chain setup required.");
  const m = JSON.parse(readFileSync(".local/deployment.json", "utf8"));
  const rpc = createPublicClient({ transport: http("http://127.0.0.1:8547") });
  expect(await rpc.getChainId()).toBe(31337);
  const accounts = (await rpc.request({
    method: "eth_accounts",
  } as any)) as string[];
  const account = accounts[3];
  await rpc.request({
    method: "eth_sendTransaction",
    params: [
      {
        from: account,
        to: m.backingToken,
        data: encodeFunctionData({
          abi: parseAbi(["function faucet()"]),
          functionName: "faucet",
        }),
      },
    ],
  } as any);
  await page.exposeFunction("__walletRpc", async (r: any) => {
    if (["eth_requestAccounts", "eth_accounts"].includes(r.method))
      return [account];
    if (r.method === "wallet_switchEthereumChain") return null;
    return rpc.request(r);
  });
  await page.addInitScript(() => {
    (window as any).ethereum = {
      request: (r: any) => (window as any).__walletRpc(r),
      on: () => {},
      removeListener: () => {},
    };
  });
  await page.goto("http://127.0.0.1:5184/trade");
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .first()
    .click();
  await page.getByLabel("Asset", { exact: true }).selectOption("wrapped");
  await page.getByLabel("Amount", { exact: true }).fill("0.001");
  let release!: () => void, intercepted!: () => void;
  const held = new Promise<void>((r) => (release = r)),
    arrived = new Promise<void>((r) => (intercepted = r));
  await page.route("http://127.0.0.1:8547/", async (route) => {
    const body = route.request().postDataJSON();
    // Local reads may arrive as JSON-RPC batches.
    if (
      (Array.isArray(body) ? body : [body]).some(
        (call: any) =>
          call.method === "eth_call" &&
          call.params?.[0]?.to?.toLowerCase() === m.exchange.toLowerCase(),
      )
    ) {
      intercepted();
      await held;
    }
    await route.continue();
  });
  await page.getByRole("button", { name: "Review trade", exact: true }).click();
  await arrived;
  await page.getByLabel("Asset", { exact: true }).selectOption("vault");
  release();
  await expect(page.getByRole("alert")).toContainText("Review again.");
  await expect(page.getByRole("button", { name: "Confirm buy" })).toHaveCount(
    0,
  );
});
