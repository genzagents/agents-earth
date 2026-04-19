import { updateUserWallet } from "./userStore";

const PRIVY_APP_ID = process.env.PRIVY_APP_ID ?? "";
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET ?? "";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let privyClientCache: any = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getPrivyClient(): any {
  if (!privyClientCache) {
    if (!PRIVY_APP_ID || !PRIVY_APP_SECRET) {
      throw new Error("PRIVY_APP_ID and PRIVY_APP_SECRET env vars are required for wallet provisioning");
    }
    // Deferred require so missing package doesn't crash on module load (e.g. in tests)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PrivyClient } = require("@privy-io/server-auth");
    privyClientCache = new PrivyClient(PRIVY_APP_ID, PRIVY_APP_SECRET);
  }
  return privyClientCache;
}

/**
 * Provisions an EVM wallet on Base for the given user via Privy.
 * If provisioning fails (e.g. missing API keys in dev), logs a warning and returns null.
 *
 * @param userId  Internal user UUID
 * @param email   User email — used as the Privy "did:email" identifier
 * @returns       The provisioned wallet address, or null on failure
 */
export async function provisionWallet(userId: string, email: string): Promise<string | null> {
  if (!PRIVY_APP_ID || !PRIVY_APP_SECRET) {
    console.warn("[wallet] PRIVY_APP_ID/PRIVY_APP_SECRET not set — skipping wallet provisioning");
    return null;
  }

  try {
    const privy = getPrivyClient();

    // Create or retrieve the Privy user by email DID
    const privyUser = await privy.importUser({
      linkedAccounts: [{ type: "email", address: email }],
      createEthereumWallet: true,
    });

    // Find the embedded EVM wallet address
    const evmWallet = privyUser.linkedAccounts.find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (a: any) => a.type === "wallet" && a.walletClientType === "privy"
    );

    if (!evmWallet || evmWallet.type !== "wallet") {
      console.warn("[wallet] No EVM wallet returned by Privy for user", userId);
      return null;
    }

    const address = evmWallet.address ?? null;
    if (!address) {
      console.warn("[wallet] EVM wallet has no address for user", userId);
      return null;
    }

    // Persist on user record
    await updateUserWallet(userId, address);

    return address;
  } catch (err) {
    console.warn("[wallet] Privy wallet provisioning failed:", err);
    return null;
  }
}

/**
 * Returns true if wallet provisioning is configured (env vars present).
 */
export function isWalletProvisioningEnabled(): boolean {
  return Boolean(PRIVY_APP_ID && PRIVY_APP_SECRET);
}
