import { setLocalWallet } from "./chain";
/** Disposable local verification wallet. This module is excluded from production builds. */
export async function installLocalWallet() {
  const rpc = "http://127.0.0.1:8547";
  if (
    !import.meta.env.DEV ||
    import.meta.env.VITE_LOCAL_WALLET !== "true" ||
    location.hostname !== "127.0.0.1" ||
    location.port !== "5184"
  )
    throw new Error(
      "The verification wallet is restricted to local development.",
    );
  let id = 0;
  async function call(method: string, params: unknown[] = []) {
    const response = await fetch(rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
    });
    const result = await response.json();
    if (result.error)
      throw Object.assign(new Error(result.error.message), {
        code: result.error.code,
      });
    return result.result;
  }
  if ((await call("eth_chainId")) !== "0x7a69")
    throw new Error("Expected disposable Anvil chain 31337.");
  const accounts: string[] = await call("eth_accounts");
  if (accounts.length < 4)
    throw new Error("Expected disposable unlocked Anvil accounts.");
  let selected = accounts[2],
    rejectNext = false,
    pauseNext = false;
  let resume: (() => void) | undefined;
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  const allowed = new Set([
    "eth_chainId",
    "eth_call",
    "eth_getCode",
    "eth_getBalance",
    "eth_getTransactionCount",
    "eth_getTransactionReceipt",
    "eth_getTransactionByHash",
    "eth_getBlockByNumber",
    "eth_estimateGas",
    "eth_gasPrice",
    "eth_maxPriorityFeePerGas",
    "eth_sendTransaction",
  ]);
  setLocalWallet({
    async request({
      method,
      params = [],
    }: {
      method: string;
      params?: unknown[];
    }) {
      if ((await call("eth_chainId")) !== "0x7a69")
        throw new Error("Local chain changed; signing disabled.");
      if (method === "eth_requestAccounts" || method === "eth_accounts")
        return [selected];
      if (method === "wallet_switchEthereumChain") {
        if ((params[0] as { chainId?: string })?.chainId !== "0x7a69")
          throw new Error("Only local chain 31337 is allowed.");
        return null;
      }
      if (!allowed.has(method))
        throw new Error(`Unsupported local wallet method: ${method}`);
      if (method === "eth_sendTransaction") {
        if (rejectNext) {
          rejectNext = false;
          rejectButton.textContent = "Reject next signature";
          throw Object.assign(new Error("User rejected the request."), {
            code: 4001,
          });
        }
        if (pauseNext) {
          pauseNext = false;
          pauseButton.textContent = "Pause next signature";
          resumeButton.hidden = false;
          await new Promise<void>((resolve) => {
            resume = resolve;
          });
          resumeButton.hidden = true;
          if ((await call("eth_chainId")) !== "0x7a69")
            throw new Error("Local chain changed while signing was paused.");
        }
        const tx = params[0] as { from?: string; to?: string };
        if (tx.from?.toLowerCase() !== selected.toLowerCase())
          throw new Error("Local account changed before signing.");
        if (!tx.to)
          throw new Error(
            "The browser verification wallet does not deploy contracts directly.",
          );
      }
      return call(method, params);
    },
    on(event: string, callback: (...args: unknown[]) => void) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(callback);
    },
    removeListener(event: string, callback: (...args: unknown[]) => void) {
      listeners.get(event)?.delete(callback);
    },
  } as Window["ethereum"]);
  const panel = document.createElement("details");
  panel.style.cssText =
    "position:fixed;bottom:8px;right:8px;z-index:1000;background:#fff9da;border:2px solid #6b4b00;padding:10px;font:12px system-ui;max-width:calc(100vw - 40px);color:#342800";
  panel.open = true;
  const summary = document.createElement("summary");
  summary.textContent = "LOCAL TEST WALLET · chain 31337";
  const label = document.createElement("label");
  label.textContent = "Disposable test account ";
  const select = document.createElement("select");
  select.setAttribute("aria-label", "Disposable test account");
  accounts.slice(0, 4).forEach((address, index) => {
    const option = document.createElement("option");
    option.value = address;
    option.textContent = `${index}: ${address}`;
    select.append(option);
  });
  select.value = selected;
  select.addEventListener("change", () => {
    selected = select.value;
    listeners.get("accountsChanged")?.forEach((fn) => fn([selected]));
  });
  label.append(select);
  const rejectButton = document.createElement("button");
  rejectButton.textContent = "Reject next signature";
  rejectButton.addEventListener("click", () => {
    rejectNext = true;
    rejectButton.textContent = "Next signature will be rejected";
  });
  const pauseButton = document.createElement("button");
  pauseButton.textContent = "Pause next signature";
  pauseButton.addEventListener("click", () => {
    pauseNext = true;
    pauseButton.textContent = "Next signature will pause";
  });
  const resumeButton = document.createElement("button");
  resumeButton.textContent = "Resume local signature";
  resumeButton.hidden = true;
  resumeButton.addEventListener("click", () => {
    resume?.();
    resume = undefined;
  });
  const networkButton = document.createElement("button");
  networkButton.textContent = "Simulate network change (local only)";
  networkButton.addEventListener("click", () => {
    listeners.get("chainChanged")?.forEach((fn) => fn("0x7a69"));
  });
  panel.append(
    summary,
    label,
    document.createElement("br"),
    rejectButton,
    pauseButton,
    resumeButton,
    networkButton,
  );
  document.body.append(panel);
}
