import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
} from "node:fs";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  toHex,
  encodeDeployData,
  encodeFunctionData,
  formatEther,
  formatGwei,
  formatUnits,
  getAbiItem,
  parseAbi,
  parseTransaction,
  recoverTransactionAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { avalancheFuji } from "viem/chains";
import { fileURLToPath } from "node:url";
import {
  artifactProvenance,
  exchangeInventory,
  featuredMarkets,
  openRound,
  planArtifacts,
  replaceFeaturedMarkets,
  roundPrefix,
  setupMarkets,
} from "./setup-markets.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
process.chdir(root);
const argv = process.argv.slice(2);
const broadcast = argv.includes("--broadcast");
const replacing = argv.includes("--replace-featured");
const force = argv.includes("--force");
if (force && !replacing)
  throw new Error("--force only applies together with --replace-featured.");
const retryAt = argv.indexOf("--retry-reverted");
const retryLabel = retryAt >= 0 ? argv[retryAt + 1] : null;
if (retryAt >= 0 && (!retryLabel || retryLabel.startsWith("--")))
  throw new Error("--retry-reverted needs the label of the reverted step.");
if (retryLabel && !broadcast)
  throw new Error("--retry-reverted only applies together with --broadcast.");
/** A signed `deadline` argument stays valid this long; expired unsent intents are re-signed. */
const DEADLINE_WINDOW = 3600n;
/** An unsent intent this close to its deadline is re-signed instead of rebroadcast. */
const DEADLINE_MARGIN = 300n;
/**
 * Sum of the gas limits of all 26 plan steps (24.77M; 24.52M used), measured by a full
 * broadcast against a chain-43113 Anvil. Remeasure when contracts or the plan change.
 */
const PLAN_GAS = 24_800_000n;
const GAS_HEADROOM_PERCENT = 130n;
/**
 * Gas limits of a replacement round including both top-ups (14.43M; 14.19M used): faucet,
 * bvaDEMO deposit, two approvals and five creations, measured by --replace-featured
 * broadcasts against a Fuji fork. Remeasure when contracts or the round change.
 */
const REPLACEMENT_GAS = 14_450_000n;
/** A new replacement round starts only once a featured market closes within this window. */
const REPLACE_WINDOW = 7n * 86400n;
/** Markets whose creation reads the Chainlink-backed reference oracle. */
const REFERENCE_MARKETS = ["referencePool", "wrappedPool", "vaultBackingPool"];
const POLL_MS = 1500;
const WAIT_TIMEOUT_MS = 10 * 60 * 1000;
const CONTRACT_FIELDS = [
  "backingToken",
  "scenarioOracle",
  "referenceOracle",
  "wrapper",
  "vault",
  "backingVault",
  "vaultOracle",
  "factory",
  "exchange",
  "referencePool",
  "scenarioPool",
  "wrappedPool",
  "vaultPool",
  "vaultBackingPool",
];
const manifestPath = "config/deployment.json";
const manifest = JSON.parse(readFileSync(manifestPath));
const save = () =>
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
if (manifest.version !== 2)
  throw new Error("This deployment plan requires manifest version 2.");
if (manifest.chainId !== 43113)
  throw new Error("Manifest must target Fuji 43113");
const c = createPublicClient({
  chain: avalancheFuji,
  transport: http(manifest.rpcUrl),
});
if ((await c.getChainId()) !== 43113)
  throw new Error("RPC identity mismatch; stopped");
const secretPath = ".secrets/fuji-test-signer.json";
if (!existsSync(secretPath))
  throw new Error(
    "Missing dedicated test signer. See docs/OPERATIONS.md. Never reuse a mainnet signer.",
  );
const { privateKey } = JSON.parse(readFileSync(secretPath));
const account = privateKeyToAccount(privateKey);
if (account.address.toLowerCase() !== manifest.deployer.toLowerCase())
  throw new Error("Unexpected test signer");
if (!existsSync("contracts/out"))
  throw new Error("Build the contracts first: npm run test:contracts");
const artifacts = planArtifacts();
const provenance = artifactProvenance(artifacts);
const git = (...args) =>
  execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
let commit = null,
  uncommitted = [];
try {
  commit = git("rev-parse", "HEAD").trim();
  uncommitted = git(
    "status",
    "--porcelain",
    "--",
    "contracts/src",
    "contracts/foundry.toml",
    "scripts",
  )
    .split("\n")
    .filter(Boolean)
    .map((line) => line.slice(3));
} catch {}
const changedArtifacts = manifest.source
  ? Object.keys(provenance.hashes).filter(
      (id) =>
        JSON.stringify(manifest.source.artifacts?.[id]) !==
        JSON.stringify(provenance.hashes[id]),
    )
  : [];
const intentsRoot = ".secrets/transactions";
const legacyIntents = existsSync(intentsRoot)
  ? readdirSync(intentsRoot).filter((name) => name.endsWith(".json"))
  : [];
const balance = await c.getBalance({ address: account.address });
// Funding for the steps not yet recorded: gas at today's max fee with 30% headroom, plus the
// native AVAX the plan sends (awAVAX deposit and exchange inventory).
const recordedLabels = new Set(manifest.transactions.map((t) => t.label));
const open = replacing ? openRound(manifest) : null;
const round = replacing
  ? (open?.round ?? (manifest.replacements?.length ?? 0) + 1)
  : null;
const usedGas = manifest.transactions
  .filter((t) => !replacing || t.label.startsWith(roundPrefix(round)))
  .reduce((sum, t) => sum + BigInt(t.gasUsed ?? 0), 0n);
const planGas = replacing ? REPLACEMENT_GAS : PLAN_GAS;
const remainingGas = usedGas < planGas ? planGas - usedGas : 0n;
// A replacement round sends no AVAX; its seeds are aDEMO and bvaDEMO.
const remainingValue = replacing
  ? 0n
  : (recordedLabels.has("wrapper-funded-deposit")
      ? 0n
      : exchangeInventory.wrapper) +
    (recordedLabels.has("exchange-native-inventory")
      ? 0n
      : exchangeInventory.native);
const { maxFeePerGas } = await c.estimateFeesPerGas();
const gasCost = (maxFeePerGas * remainingGas * GAS_HEADROOM_PERCENT) / 100n;
const required = gasCost + remainingValue;
console.log(
  JSON.stringify({
    chainId: 43113,
    deployer: account.address,
    balanceWei: String(balance),
    requiredWei: String(required),
    deploymentId: manifest.deploymentId ?? null,
    recordedTransactions: manifest.transactions.length,
    replacementRound: round,
    commit,
    uncommitted,
    staleSources: provenance.stale.length,
    broadcast,
  }),
);
console.log(
  `Funding: requires ${formatEther(required)} AVAX = ${remainingGas} gas x ${formatGwei(maxFeePerGas)} gwei max fee x ${Number(GAS_HEADROOM_PERCENT) / 100} (${formatEther(gasCost)} AVAX) + ${formatEther(remainingValue)} AVAX sent by the plan. Balance: ${formatEther(balance)} AVAX.`,
);
if (uncommitted.length)
  console.log(`Uncommitted deployment inputs: ${uncommitted.join(", ")}`);
if (legacyIntents.length)
  console.log(
    `Ignoring ${legacyIntents.length} unbound intent file(s) written by an older script directly in ${intentsRoot}/. They are never reused; check on the explorer that none is pending before archiving them.`,
  );
/** Mirrors ShieldChainlinkOracle.price(): reference markets cannot be created on a stale feed. */
async function checkFeed() {
  const feed = manifest.chainlinkFeed;
  const [code, block] = await Promise.all([
    c.getCode({ address: feed }),
    c.getBlock(),
  ]);
  if (!code || code === "0x") return `no contract at chainlinkFeed ${feed}`;
  const abi = parseAbi([
    "function decimals() view returns (uint8)",
    "function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)",
  ]);
  const [decimals, [round, answer, , updatedAt, answeredInRound]] =
    await Promise.all([
      c.readContract({ address: feed, abi, functionName: "decimals" }),
      c.readContract({ address: feed, abi, functionName: "latestRoundData" }),
    ]);
  const age = block.timestamp - updatedAt;
  const maxAge = BigInt(manifest.maxPriceAge);
  console.log(
    `Chainlink AVAX/USD ${feed}: ${formatUnits(answer, decimals)}, updated ${age}s ago (maxPriceAge ${maxAge}s).`,
  );
  if (
    answer <= 0n ||
    answeredInRound < round ||
    updatedAt === 0n ||
    updatedAt > block.timestamp
  )
    return "the Chainlink feed's latest round is invalid or incomplete";
  if (age > maxAge)
    return `the Chainlink feed was last updated ${age}s ago, beyond maxPriceAge ${maxAge}s, so reference market creation would revert; retry after its next update`;
  if (age + 300n > maxAge)
    console.log(
      "Warning: the feed may go stale before reference markets are created. A stale feed stops the run before signing that step; resume after the next update.",
    );
  return null;
}
const blockers = [];
if (balance < required)
  blockers.push(
    `balance ${formatEther(balance)} AVAX is below the required ${formatEther(required)} AVAX; fund ${account.address} with faucet test AVAX only`,
  );
if (
  replacing
    ? REFERENCE_MARKETS.some((field) => !open?.created?.[field])
    : REFERENCE_MARKETS.some((field) => !manifest[field])
) {
  const feedProblem = await checkFeed();
  if (feedProblem) blockers.push(feedProblem);
}
if (replacing) blockers.push(...(await replacementProblems()));
/** Why a replacement round cannot run now; an open round may always resume. */
async function replacementProblems() {
  if (!manifest.deploymentId || featuredMarkets(manifest).some(([f]) => !manifest[f]))
    return ["there are no deployed featured markets to replace; run the full deployment first"];
  const problems = [];
  const { factory, pool } = artifacts;
  const remaining = featuredMarkets(manifest).filter(
    ([field]) => !open?.created?.[field],
  ).length;
  const [registered, limit] = await Promise.all([
    c.readContract({ address: manifest.factory, abi: factory.abi, functionName: "allPools" }),
    c.readContract({ address: manifest.factory, abi: factory.abi, functionName: "MAX_POOLS" }),
  ]);
  console.log(
    `Factory market slots: ${registered.length} of ${limit} lifetime slots used; this round needs ${remaining}.`,
  );
  if (BigInt(registered.length + remaining) > limit)
    problems.push(
      `the factory has ${registered.length} of its ${limit} lifetime market slots in use, too few for ${remaining} replacement markets`,
    );
  if (open) {
    console.log(`Resuming replacement round ${open.round}, opened ${open.openedAt}.`);
    return problems;
  }
  if (manifest.status !== "deployed-and-verified")
    problems.push(
      `the deployment is ${manifest.status}; run npm run verify:fuji before replacing its featured markets`,
    );
  const now = (await c.getBlock()).timestamp;
  const maturities = await Promise.all(
    featuredMarkets(manifest).map(([field]) =>
      c.readContract({ address: manifest[field], abi: pool.abi, functionName: "maturity" }),
    ),
  );
  const earliest = maturities.reduce((a, b) => (b < a ? b : a));
  const closes = new Date(Number(earliest) * 1000).toISOString();
  console.log(`Replacement round ${round}: the earliest featured market closes ${closes}.`);
  if (earliest - now > REPLACE_WINDOW && !force)
    problems.push(
      `the featured markets accept protection until ${closes}; replacing them more than ${REPLACE_WINDOW / 86400n} days early spends 5 of the factory's lifetime slots for little extra time. Rerun closer to that date, or pass --force`,
    );
  return problems;
}
if (provenance.stale.length)
  blockers.push(
    `contracts/out was not compiled from the current sources (${provenance.stale.join(", ")}); rebuild with npm run test:contracts`,
  );
if (!commit)
  blockers.push(
    "cannot read the git commit; deploy from a git checkout so the manifest records its source",
  );
if (uncommitted.some((path) => path.startsWith("contracts/")))
  blockers.push(
    "contract sources have uncommitted changes; commit them so the recorded commit reproduces the bytecode",
  );
if (manifest.deploymentId && changedArtifacts.length)
  blockers.push(
    `these artifacts differ from the build deployment ${manifest.deploymentId} started with at ${manifest.source.commit}: ${changedArtifacts.join(", ")}; check out that commit and rebuild, or start over (docs/OPERATIONS.md, "Starting over")`,
  );
if (!broadcast) {
  console.log(
    blockers.length
      ? `Preflight: not ready to broadcast.\n${blockers.map((b) => `  - ${b}`).join("\n")}`
      : "Preflight: ready. --broadcast is required to spend test AVAX.",
  );
  process.exit(blockers.length ? 1 : 0);
}
if (blockers.length)
  throw new Error(
    `Not broadcasting; nothing was sent.\n${blockers.map((b) => `  - ${b}`).join("\n")}`,
  );
const w = createWalletClient({
  account,
  chain: avalancheFuji,
  transport: http(manifest.rpcUrl),
});
const source = {
  commit,
  uncommitted,
  compiler: artifacts.pool.metadata?.compiler?.version ?? null,
  artifacts: provenance.hashes,
};
if (manifest.deploymentId && !manifest.source) {
  manifest.source = source;
  save();
} else if (manifest.deploymentId && manifest.source.commit !== commit)
  console.log(
    `Resuming deployment ${manifest.deploymentId} (started at ${manifest.source.commit}) from ${commit}; its artifacts are identical.`,
  );
if (!manifest.deploymentId) {
  if (
    manifest.transactions.length ||
    CONTRACT_FIELDS.some((field) => manifest[field])
  )
    throw new Error(
      'The manifest records deployment progress without a deploymentId, so its signed intents cannot be matched safely. Restore the pre-deployment manifest (docs/OPERATIONS.md, "Starting over") before broadcasting.',
    );
  manifest.deploymentId = `fuji-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}Z-${randomBytes(3).toString("hex")}`;
  manifest.failedTransactions = [];
  manifest.source = source;
  save();
  console.log(
    `Started deployment ${manifest.deploymentId}; its signed intents live in ${intentsRoot}/${manifest.deploymentId}/.`,
  );
}
manifest.failedTransactions ??= [];
const intentDir = `${intentsRoot}/${manifest.deploymentId}`;
mkdirSync(intentDir, { recursive: true, mode: 0o700 });
const intentFile = (label) => `${intentDir}/${label}.json`;
const writeIntent = (intent) =>
  writeFileSync(
    intentFile(intent.label),
    JSON.stringify(intent, null, 2) + "\n",
    { mode: 0o600 },
  );
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const lower = (address) => (address ? address.toLowerCase() : null);
const absent = (name) => (error) => {
  if (error?.name === name) return null;
  throw error;
};
const receiptOf = (hash) =>
  c
    .getTransactionReceipt({ hash })
    .catch(absent("TransactionReceiptNotFoundError"));
const knownTx = (hash) =>
  c.getTransaction({ hash }).catch(absent("TransactionNotFoundError"));
const nonceAt = (blockTag) =>
  c.getTransactionCount({ address: account.address, blockTag });
const latestTimestamp = async () => (await c.getBlock()).timestamp;
const reason = (error) => error?.shortMessage ?? error?.message ?? error;

/**
 * Normalizes one planned step. A function argument named `deadline` is chosen when
 * signing, so the binding covers target, value and calldata with that argument zeroed.
 */
function describe(request) {
  let plan;
  if (request.bytecode)
    plan = {
      to: null,
      value: 0n,
      bytecodeHash: keccak256(request.bytecode),
      deadlineIndex: -1,
      encode: () =>
        encodeDeployData({
          abi: request.abi,
          bytecode: request.bytecode,
          args: request.args,
        }),
    };
  else if (request.abi) {
    const args = request.args ?? [];
    const item = getAbiItem({
      abi: request.abi,
      name: request.functionName,
      args,
    });
    const deadlineIndex = item.inputs.findIndex(
      (input) => input.name === "deadline",
    );
    plan = {
      to: request.address,
      value: request.value ?? 0n,
      bytecodeHash: null,
      deadlineIndex,
      encode: (deadline) =>
        encodeFunctionData({
          abi: request.abi,
          functionName: request.functionName,
          args: deadlineIndex < 0 ? args : args.with(deadlineIndex, deadline),
        }),
    };
  } else
    plan = {
      to: request.to,
      value: request.value ?? 0n,
      bytecodeHash: null,
      deadlineIndex: -1,
      encode: () => "0x",
    };
  plan.to = lower(plan.to);
  plan.payloadHash = keccak256(
    toHex(
      JSON.stringify({
        to: plan.to,
        value: String(plan.value),
        data: plan.encode(0n),
      }),
    ),
  );
  return plan;
}

async function signIntent(label, plan, nonce) {
  const deadline =
    plan.deadlineIndex < 0 ? null : (await latestTimestamp()) + DEADLINE_WINDOW;
  const prepared = await w
    .prepareTransactionRequest({
      account,
      to: plan.to ?? undefined,
      data: plan.encode(deadline ?? 0n),
      value: plan.value,
      nonce,
    })
    .catch((error) => {
      throw new Error(
        `${label}: the node rejected this step while estimating gas, so nothing was signed or sent: ${reason(error)}`,
        { cause: error },
      );
    });
  const serialized = await account.signTransaction(prepared);
  return {
    version: 1,
    label,
    deploymentId: manifest.deploymentId,
    chainId: 43113,
    from: account.address,
    nonce,
    to: plan.to,
    value: String(plan.value),
    payloadHash: plan.payloadHash,
    bytecodeHash: plan.bytecodeHash,
    deadline: deadline === null ? null : String(deadline),
    hash: keccak256(serialized),
    serialized,
    signedAt: new Date().toISOString(),
    previous: [],
  };
}

/** Every reason the stored intent is not exactly the current step for this signer and deployment. */
async function bindingProblems(intent, plan) {
  if (intent.version !== 1 || !Array.isArray(intent.previous))
    return ["it has no chain, signer, nonce or payload binding"];
  const problems = [];
  if (intent.deploymentId !== manifest.deploymentId)
    problems.push(`it belongs to deployment ${intent.deploymentId}`);
  if (intent.chainId !== 43113)
    problems.push(`it targets chain ${intent.chainId}`);
  if (lower(intent.from) !== lower(account.address))
    problems.push(`it was signed by ${intent.from}`);
  if (intent.bytecodeHash !== plan.bytecodeHash)
    problems.push(
      "the contract artifact in contracts/out changed since it was signed",
    );
  if (intent.payloadHash !== plan.payloadHash)
    problems.push("its target, value or calldata differ from the current plan");
  for (const signed of [intent, ...intent.previous]) {
    const tx = parseTransaction(signed.serialized);
    const from = await recoverTransactionAddress({
      serializedTransaction: signed.serialized,
    });
    const data = plan.encode(
      signed.deadline === null ? 0n : BigInt(signed.deadline),
    );
    if (
      keccak256(signed.serialized) !== signed.hash ||
      lower(from) !== lower(intent.from) ||
      tx.chainId !== intent.chainId ||
      tx.nonce !== intent.nonce ||
      lower(tx.to) !== intent.to ||
      (tx.value ?? 0n) !== BigInt(intent.value) ||
      (tx.data ?? "0x") !== data
    )
      problems.push(
        `signed transaction ${signed.hash} does not match the current step`,
      );
  }
  return problems;
}

/** Where the intent (or a version it superseded) stands on chain. */
async function locate(intent) {
  const versions = [intent, ...(intent.previous ?? [])];
  for (const signed of versions) {
    const receipt = await receiptOf(signed.hash);
    if (receipt) return { state: "mined", receipt, signed };
  }
  for (const signed of versions)
    if (await knownTx(signed.hash)) return { state: "pending", signed };
  const latest = await nonceAt("latest");
  if (latest > intent.nonce) return { state: "consumed", latest };
  if (latest < intent.nonce) return { state: "gap", latest };
  return { state: "unsent", latest };
}

function describeState(intent, found) {
  if (found.state === "mined")
    return `mined (${found.receipt.status}) in block ${found.receipt.blockNumber} as ${found.signed.hash}`;
  if (found.state === "pending")
    return `pending in the node's mempool as ${found.signed.hash}`;
  if (found.state === "consumed")
    return `not found, but nonce ${intent.nonce} was already used by another transaction (account nonce ${found.latest})`;
  if (found.state === "gap")
    return `not found; earlier nonces are still unconfirmed (account nonce ${found.latest} < ${intent.nonce})`;
  return `never mined and unknown to the node; nonce ${intent.nonce} is still unused`;
}

async function refuse(intent, problems) {
  const found =
    intent.version === 1 ? await locate(intent).catch(() => null) : null;
  const state = found
    ? describeState(intent, found)
    : `unknown (check ${intent.hash} on the explorer)`;
  const advice = !found
    ? "Leave the file in place and inspect its transaction before deciding how to continue."
    : found.state === "unsent"
      ? `It never mined, so it is safe to move ${intentFile(intent.label)} out of the deployment folder (keep it for the record) and rerun to sign the current step at nonce ${intent.nonce}.`
      : found.state === "pending"
        ? "Wait until it is mined, then decide whether this deployment can continue."
        : 'Its nonce is spent, so this deployment cannot continue consistently; start a new deployment (docs/OPERATIONS.md, "Starting over").';
  throw new Error(
    [
      `Refusing to reuse the stored intent ${intentFile(intent.label)}:`,
      ...problems.map((problem) => `  - ${problem}`),
      `  On chain it is ${state}.`,
      `Nothing was sent. ${advice}`,
    ].join("\n"),
  );
}

function recordFailure(intent, found) {
  const { receipt, signed } = found;
  if (!manifest.failedTransactions.some((t) => t.hash === signed.hash)) {
    manifest.failedTransactions.push({
      label: intent.label,
      hash: signed.hash,
      nonce: intent.nonce,
      blockNumber: String(receipt.blockNumber),
      gasUsed: String(receipt.gasUsed),
      status: receipt.status,
    });
    save();
  }
  return new Error(
    [
      `${intent.label} was mined but reverted (tx ${signed.hash}, nonce ${intent.nonce}, block ${receipt.blockNumber}).`,
      "It is recorded under failedTransactions in the manifest and was not replayed.",
      `Inspect the revert (explorer, or: cast run ${signed.hash} --rpc-url ${manifest.rpcUrl}), fix the cause, then resume with:`,
      `  npm run deploy:fuji -- --broadcast --retry-reverted ${intent.label}`,
    ].join("\n"),
  );
}

async function broadcastIntent(intent) {
  try {
    await c.sendRawTransaction({ serializedTransaction: intent.serialized });
  } catch (error) {
    if (await knownTx(intent.hash)) return;
    throw new Error(
      `${intent.label}: broadcasting ${intent.hash} failed (${reason(error)}). The signed intent is kept; rerun the same command to resume it.`,
      { cause: error },
    );
  }
}

async function resign(intent, plan, why) {
  const latest = await nonceAt("latest");
  if (latest !== intent.nonce)
    throw new Error(
      `${intent.label}: nonce ${intent.nonce} changed while re-signing (account nonce ${latest}); rerun to re-check.`,
    );
  const fresh = await signIntent(intent.label, plan, intent.nonce);
  fresh.previous = [
    ...intent.previous,
    {
      hash: intent.hash,
      serialized: intent.serialized,
      deadline: intent.deadline,
      signedAt: intent.signedAt,
      supersededAt: fresh.signedAt,
      reason: why,
    },
  ];
  writeIntent(fresh);
  console.log(
    `${intent.label}: re-signed nonce ${intent.nonce} as ${fresh.hash} because ${why}. Superseded ${intent.hash} was never mined and is unknown to the node; both hashes are watched.`,
  );
  await broadcastIntent(fresh);
  return fresh;
}

/** An intent that was never mined and is unknown to the node: rebroadcast it unchanged if still valid. */
async function resend(intent, plan) {
  const pending = await nonceAt("pending");
  if (pending > intent.nonce)
    throw new Error(
      `${intent.label}: the node holds another pending transaction at nonce ${intent.nonce} that is not this intent. Wait for it to confirm (never replace it), then rerun.`,
    );
  const now = await latestTimestamp();
  if (
    intent.deadline !== null &&
    BigInt(intent.deadline) <= now + DEADLINE_MARGIN
  )
    return resign(
      intent,
      plan,
      `its deadline ${intent.deadline} is past or within ${DEADLINE_MARGIN}s of chain time ${now}`,
    );
  try {
    await c.sendRawTransaction({ serializedTransaction: intent.serialized });
    console.log(
      `${intent.label}: rebroadcast the identical signed intent ${intent.hash} (nonce ${intent.nonce}).`,
    );
    return intent;
  } catch (error) {
    if (await knownTx(intent.hash)) return intent;
    return resign(
      intent,
      plan,
      `the node rejected the identical rebroadcast (${reason(error)})`,
    );
  }
}

async function waitFor(intent) {
  const started = Date.now();
  for (;;) {
    let found = await locate(intent);
    if (found.state === "consumed") {
      // A load-balanced RPC can report the new nonce before the receipt.
      await sleep(POLL_MS * 2);
      found = await locate(intent);
      if (found.state === "consumed")
        throw new Error(
          `${intent.label}: ${describeState(intent, found)}. None of this intent's signed versions mined. Inspect ${account.address} on the explorer before doing anything else.`,
        );
    }
    if (found.state === "mined") return found;
    if (Date.now() - started > WAIT_TIMEOUT_MS)
      throw new Error(
        `${intent.label}: ${intent.hash} is ${describeState(intent, found)} after ${WAIT_TIMEOUT_MS / 60000} minutes. Rerun the same command to keep waiting; the intent is only re-signed while it is unknown and its nonce unused.`,
      );
    await sleep(POLL_MS);
  }
}

let retried = false;
async function send(label, request) {
  const recorded = manifest.transactions.find((t) => t.label === label);
  if (recorded) {
    const receipt = await c.getTransactionReceipt({ hash: recorded.hash });
    if (receipt.status !== "success")
      throw new Error(`Recorded ${label} was not successful`);
    return receipt;
  }
  const plan = describe(request);
  const file = intentFile(label);
  let intent = existsSync(file) ? JSON.parse(readFileSync(file)) : null;
  if (intent) {
    const problems = await bindingProblems(intent, plan);
    if (problems.length) await refuse(intent, problems);
    const found = await locate(intent);
    const reverted =
      found.state === "mined" && found.receipt.status !== "success";
    if (retryLabel === label && !reverted)
      throw new Error(
        `--retry-reverted ${label}: its stored intent did not revert; it is ${describeState(intent, found)}.`,
      );
    if (reverted) {
      const failure = recordFailure(intent, found);
      if (retryLabel !== label) throw failure;
      renameSync(
        file,
        `${intentDir}/${label}.reverted-nonce-${intent.nonce}.json`,
      );
      console.log(
        `${label}: retrying after the recorded revert at nonce ${intent.nonce}; a new intent takes the next nonce.`,
      );
      retried = true;
      intent = null;
    } else if (found.state === "mined") {
      // Mined after the last run stopped but before the manifest recorded it. Adopt it only
      // if the signer has not been used since; otherwise it is left over from an earlier attempt.
      const latest = await nonceAt("latest");
      if (latest !== intent.nonce + 1)
        throw new Error(
          [
            `${label}: the stored intent already mined at nonce ${intent.nonce} (${found.signed.hash}), but the manifest has no record of it and the account has since reached nonce ${latest}.`,
            'It belongs to an earlier attempt (was the manifest reset without removing deploymentId?). Nothing was sent. Start a new deployment (docs/OPERATIONS.md, "Starting over") or restore the manifest that recorded it.',
          ].join("\n"),
        );
    } else if (found.state === "consumed" || found.state === "gap")
      throw new Error(
        `${label}: the stored intent is ${describeState(intent, found)}. Nothing was sent; inspect ${account.address} on the explorer before resuming.`,
      );
    else if (found.state === "unsent") intent = await resend(intent, plan);
  }
  if (!intent) {
    const [latest, pending] = await Promise.all([
      nonceAt("latest"),
      nonceAt("pending"),
    ]);
    if (pending !== latest)
      throw new Error(
        `${account.address} has ${pending - latest} pending transaction(s) that this deployment did not record. Wait for them to confirm (never replace them), then rerun.`,
      );
    intent = await signIntent(label, plan, latest);
    writeIntent(intent);
    await broadcastIntent(intent);
  }
  const found = await waitFor(intent);
  if (found.receipt.status !== "success") throw recordFailure(intent, found);
  manifest.transactions.push({
    label,
    hash: found.signed.hash,
    nonce: intent.nonce,
    blockNumber: String(found.receipt.blockNumber),
    contractAddress: found.receipt.contractAddress,
    gasUsed: String(found.receipt.gasUsed),
  });
  save();
  console.log(`${label}: ${found.signed.hash}`);
  return found.receipt;
}
async function deploy(field, artifact, args = []) {
  if (manifest[field]) {
    const code = await c.getCode({ address: manifest[field] });
    if (!code || code === "0x") throw new Error(`${field} has no code`);
    return;
  }
  const receipt = await send(field, {
    abi: artifact.abi,
    bytecode: artifact.bytecode.object,
    args,
  });
  if (!receipt.contractAddress) throw new Error("No contract address");
  manifest[field] = receipt.contractAddress;
  save();
}
const recordedBefore = manifest.transactions.length;
if (replacing) {
  const done = await replaceFeaturedMarkets({
    manifest,
    account: account.address,
    call: send,
    read: (address, abi, functionName, args = []) =>
      c.readContract({ address, abi, functionName, args }),
    save: async () => save(),
  });
  console.log(
    `Replacement round ${done.round} switched the featured markets: ${featuredMarkets(manifest)
      .map(([field]) => `${field} ${done.retired[field]} -> ${manifest[field]}`)
      .join("; ")}.`,
  );
} else
  await setupMarkets({
    manifest,
    account: account.address,
    deploy,
    save: async () => save(),
    call: send,
  });
if (retryLabel && !retried)
  console.log(
    `Note: --retry-reverted ${retryLabel} matched no reverted step in this run (an earlier run may already have retried it).`,
  );
const mined = manifest.transactions.length - recordedBefore;
console.log(
  mined
    ? `Deployment mined (${mined} new transaction(s)). Run npm run verify:fuji before presenting the markets as verified.`
    : `Nothing to send: all ${manifest.transactions.length} steps were already recorded. Status remains ${manifest.status}.`,
);
