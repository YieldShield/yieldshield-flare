import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
const manifest = JSON.parse(readFileSync(".local/deployment.json"));
if (manifest.chainId !== 31337 || manifest.rpcUrl !== "http://127.0.0.1:8547")
  throw new Error("Local-only configuration required");
const child = spawn(
  "npm",
  ["run", "dev", "--", "--port", "5184", "--strictPort"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      VITE_LOCAL_DEMO: "true",
      VITE_LOCAL_WALLET: process.argv.includes("--wallet") ? "true" : "false",
      VITE_LOCAL_MANIFEST: JSON.stringify(manifest),
    },
  },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
