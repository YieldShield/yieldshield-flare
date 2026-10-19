// Copies the ABIs the app and scripts use from contracts/out (run after `npm run test:contracts`).
import { readFileSync, writeFileSync } from "node:fs";
const sources = {
  ShieldPool: "ShieldPool.sol/ShieldPool.json",
  ShieldFactory: "ShieldMarket.sol/ShieldFactory.json",
  ShieldExchange: "ShieldMarket.sol/ShieldExchange.json",
  ShieldDemoVault: "ShieldMarket.sol/ShieldDemoVault.json",
  ShieldBackingVault: "ShieldMarket.sol/ShieldBackingVault.json",
  ShieldDemoDollar: "DemoAssets.sol/ShieldDemoDollar.json",
  ShieldFtsoV2Oracle: "ShieldFtsoV2Oracle.sol/ShieldFtsoV2Oracle.json",
};
for (const [name, path] of Object.entries(sources))
  writeFileSync(
    `config/abi/${name}.json`,
    JSON.stringify(JSON.parse(readFileSync(`contracts/out/${path}`)).abi, null, 2) + "\n",
  );
console.log(`Exported ${Object.keys(sources).length} ABIs to config/abi/.`);
