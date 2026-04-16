import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`[deploy] Deploying RegistryDID with account: ${deployer.address}`);
  console.log(`[deploy] Balance: ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH`);

  const RegistryDID = await ethers.getContractFactory("RegistryDID");
  const registry = await RegistryDID.deploy();
  await registry.waitForDeployment();

  const address = await registry.getAddress();
  console.log(`[deploy] RegistryDID deployed to: ${address}`);

  // Write deployment address to a local file for reference
  const deploymentPath = path.join(__dirname, "..", "deployments.json");
  let deployments: Record<string, string> = {};
  if (fs.existsSync(deploymentPath)) {
    deployments = JSON.parse(fs.readFileSync(deploymentPath, "utf-8"));
  }
  const network = (await ethers.provider.getNetwork()).name;
  deployments[network] = address;
  fs.writeFileSync(deploymentPath, JSON.stringify(deployments, null, 2));
  console.log(`[deploy] Saved address to deployments.json (network: ${network})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
