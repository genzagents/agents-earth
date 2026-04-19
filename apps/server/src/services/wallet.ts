import { PrivyClient } from "@privy-io/server-auth";

const PRIVY_APP_ID = process.env.PRIVY_APP_ID;
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET;

let privyClient: PrivyClient | null = null;

function getPrivyClient(): PrivyClient | null {
  if (!PRIVY_APP_ID || !PRIVY_APP_SECRET) return null;
  if (!privyClient) privyClient = new PrivyClient(PRIVY_APP_ID, PRIVY_APP_SECRET);
  return privyClient;
}

export interface WalletProvisionResult { walletAddress: string; chainType: "ethereum"; }

export async function provisionWallet(agentId: string): Promise<WalletProvisionResult | null> {
  const privy = getPrivyClient();
  if (!privy) {
    console.info("[wallet] PRIVY_APP_ID or PRIVY_APP_SECRET not set — skipping wallet provisioning");
    return null;
  }

  try {
    const user = await privy.importUser({
      linkedAccounts: [{ type: "custom_auth", customUserId: agentId }],
      createEthereumWallet: true,
      customMetadata: { agentId },
    });
    const ethWallet = user.linkedAccounts.find(
      (a: { type: string }) => a.type === "wallet" && (a as { chainType?: string }).chainType === "ethereum"
    ) as { address: string } | undefined;
    if (!ethWallet) throw new Error(`Privy did not return an Ethereum wallet for agent ${agentId}`);
    console.info(`[wallet] Provisioned wallet ${ethWallet.address} for agent ${agentId}`);
    return { walletAddress: ethWallet.address, chainType: "ethereum" };
  } catch (err: unknown) {
    const isConflict = err instanceof Error && (err.message.includes("409") || err.message.toLowerCase().includes("already exists"));
    if (!isConflict) throw err;
  }

  const existing = await privy.getUserByCustomAuthId(agentId);
  if (!existing) throw new Error(`Agent ${agentId} not found in Privy after conflict — state inconsistency`);

  const ethWallet = existing.linkedAccounts.find(
    (a: { type: string }) => a.type === "wallet" && (a as { chainType?: string }).chainType === "ethereum"
  ) as { address: string } | undefined;

  if (!ethWallet) {
    const updated = await privy.createWallets({ userId: existing.id, createEthereumWallet: true });
    const newWallet = updated.linkedAccounts.find(
      (a: { type: string }) => a.type === "wallet" && (a as { chainType?: string }).chainType === "ethereum"
    ) as { address: string } | undefined;
    if (!newWallet) throw new Error(`Failed to provision wallet for existing Privy user ${existing.id}`);
    console.info(`[wallet] Provisioned wallet ${newWallet.address} for existing agent ${agentId}`);
    return { walletAddress: newWallet.address, chainType: "ethereum" };
  }

  console.info(`[wallet] Returning existing wallet ${ethWallet.address} for agent ${agentId}`);
  return { walletAddress: ethWallet.address, chainType: "ethereum" };
}
