/**
 * Multisig Service — deploys WorkingGroupWallet contracts via WorkingGroupFactory
 * on Base L2, and manages the company-level treasury multisig.
 *
 * On-chain mode requires:
 *   BASE_RPC_URL              — Base L2 JSON-RPC endpoint
 *   WG_FACTORY_ADDRESS        — deployed WorkingGroupFactory contract address
 *   TREASURY_MULTISIG_ADDRESS — pre-deployed treasury Safe/multisig address
 *   DEPLOYER_PRIVATE_KEY      — hex private key for tx signing (Hardhat/Anvil: optional)
 *
 * When these env vars are absent the service falls back to deterministic in-memory
 * addresses so local dev / CI can proceed without a live chain.
 */

const BASE_RPC_URL         = process.env.BASE_RPC_URL;
const WG_FACTORY_ADDRESS   = process.env.WG_FACTORY_ADDRESS as `0x${string}` | undefined;
const TREASURY_ADDRESS     = process.env.TREASURY_MULTISIG_ADDRESS as `0x${string}` | undefined;
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;

const onChainEnabled = !!(BASE_RPC_URL && WG_FACTORY_ADDRESS);

// ---------------------------------------------------------------------------
// In-memory fallback store: groupId (hex) → simulated wallet address
// ---------------------------------------------------------------------------
const memWallets = new Map<string, string>();
let memTreasuryAddress: string | null = TREASURY_ADDRESS ?? null;

// ---------------------------------------------------------------------------
// Minimal ABI encoding helpers
// ---------------------------------------------------------------------------

/** keccak256("createGroupWallet(bytes32,address[],uint256)") first 4 bytes */
const CREATE_WALLET_SELECTOR = "7f2c47d3";

/** keccak256("getWallet(bytes32)") first 4 bytes */
const GET_WALLET_SELECTOR = "b0c3ec6e";

function pad32(hex: string): string {
  return hex.replace(/^0x/, "").padStart(64, "0");
}

/** Encode bytes32 groupId */
function encodeBytes32(value: string): string {
  return pad32(value);
}

/** Encode a uint256 */
function encodeUint256(n: number | bigint): string {
  return BigInt(n).toString(16).padStart(64, "0");
}

/** Encode a dynamic address array for ABI encoding (offset + length + elements) */
function encodeAddressArray(addresses: string[]): { head: string; tail: string } {
  // Dynamic type: head = offset to data (computed by caller), tail = length + elements
  const len = encodeUint256(addresses.length);
  const elements = addresses.map(a => pad32(a.toLowerCase().replace(/^0x/, "")));
  return {
    head: "", // offset will be inserted by caller
    tail: len + elements.join(""),
  };
}

/**
 * Encode a call to createGroupWallet(bytes32 groupId, address[] owners, uint256 threshold)
 *
 * ABI layout (all 32-byte slots):
 *   [0]  groupId  (bytes32, static)
 *   [1]  offset to owners[] = 0x60 = 96  (after 3 static slots: groupId, offset, threshold)
 *   [2]  threshold (uint256, static)
 *   [3]  owners.length
 *   [4…] owners[i]
 */
function encodeCreateGroupWallet(groupId32: string, owners: string[], threshold: number): string {
  const g = pad32(groupId32);
  // Offset for the dynamic `owners` array: it comes after the 3rd static slot (slot index 2)
  // slot 0 = groupId, slot 1 = offset, slot 2 = threshold → dynamic data starts at byte 96 (0x60)
  const ownersOffset = encodeUint256(96);
  const t = encodeUint256(threshold);
  const ownersLen = encodeUint256(owners.length);
  const ownersData = owners.map(a => pad32(a.replace(/^0x/, ""))).join("");
  return `0x${CREATE_WALLET_SELECTOR}${g}${ownersOffset}${t}${ownersLen}${ownersData}`;
}

/** Encode a call to getWallet(bytes32 groupId) */
function encodeGetWallet(groupId32: string): string {
  return `0x${GET_WALLET_SELECTOR}${pad32(groupId32)}`;
}

// ---------------------------------------------------------------------------
// JSON-RPC helper (mirrors did/registry.ts pattern)
// ---------------------------------------------------------------------------

async function rpcCall(method: string, params: unknown[]): Promise<unknown> {
  if (!BASE_RPC_URL) throw new Error("BASE_RPC_URL not set");
  const res = await fetch(BASE_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = (await res.json()) as { result?: unknown; error?: { message: string } };
  if (json.error) throw new Error(`JSON-RPC error: ${json.error.message}`);
  return json.result;
}

async function sendTransaction(to: string, data: string, gasHex = "0x7a120"): Promise<string> {
  if (!DEPLOYER_PRIVATE_KEY) {
    // In local Hardhat/Anvil the node manages the account — use eth_sendTransaction
    const txHash = (await rpcCall("eth_sendTransaction", [
      { from: `0x${DEPLOYER_PRIVATE_KEY?.slice(-40) ?? "0".repeat(40)}`, to, data, gas: gasHex },
    ])) as string;
    return txHash;
  }
  // With a private key, production would use eth_signTransaction + eth_sendRawTransaction.
  // For this iteration we rely on the node having the account unlocked (Anvil / Hardhat).
  const txHash = (await rpcCall("eth_sendTransaction", [
    { from: `0x${DEPLOYER_PRIVATE_KEY.slice(-40)}`, to, data, gas: gasHex },
  ])) as string;
  return txHash;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * UUID → bytes32 hex (strips hyphens, left-pads to 32 bytes).
 */
function uuidToGroupId(uuid: string): string {
  return "0x" + uuid.replace(/-/g, "").padStart(64, "0");
}

/**
 * Deploy a new WorkingGroupWallet for `groupId` via the factory.
 * Returns the deployed wallet address and tx hash.
 */
export async function createGroupWallet(
  groupId: string,
  memberAddresses: string[],
  threshold: number
): Promise<{ walletAddress: string; txHash: string }> {
  const groupId32 = uuidToGroupId(groupId);

  if (!onChainEnabled) {
    // Deterministic mock address: keccak-ish derivation from groupId
    const mockAddr = "0x" + groupId.replace(/-/g, "").slice(0, 40).toLowerCase();
    memWallets.set(groupId32, mockAddr);
    console.log(`[multisigService] (mock) group wallet for ${groupId}: ${mockAddr}`);
    return { walletAddress: mockAddr, txHash: "0x" + "0".repeat(64) };
  }

  const data = encodeCreateGroupWallet(groupId32, memberAddresses, threshold);
  const txHash = await sendTransaction(WG_FACTORY_ADDRESS!, data, "0x7a120");

  // After tx mines, read back the wallet address from the factory
  const getWalletData = encodeGetWallet(groupId32);
  const result = (await rpcCall("eth_call", [
    { to: WG_FACTORY_ADDRESS, data: getWalletData },
    "latest",
  ])) as string;

  // Result is ABI-encoded address (32 bytes, right-aligned)
  const walletAddress = "0x" + result.slice(-40);
  memWallets.set(groupId32, walletAddress);

  return { walletAddress, txHash };
}

/**
 * Return the on-chain (or in-memory) wallet address for a group.
 * Returns null if not deployed.
 */
export async function getGroupWalletAddress(groupId: string): Promise<string | null> {
  const groupId32 = uuidToGroupId(groupId);

  const memHit = memWallets.get(groupId32);
  if (memHit) return memHit;

  if (!onChainEnabled) return null;

  const data = encodeGetWallet(groupId32);
  const result = (await rpcCall("eth_call", [
    { to: WG_FACTORY_ADDRESS, data },
    "latest",
  ])) as string;

  if (!result || result === "0x" + "0".repeat(64)) return null;
  return "0x" + result.slice(-40);
}

/**
 * Return the treasury multisig address.
 * In production this is set via TREASURY_MULTISIG_ADDRESS env var;
 * in dev/CI a deterministic mock address is returned.
 */
export function getTreasuryAddress(): string {
  if (memTreasuryAddress) return memTreasuryAddress;
  // Fallback mock
  const mock = "0x" + "dead".repeat(10);
  memTreasuryAddress = mock;
  return mock;
}

export { onChainEnabled };
