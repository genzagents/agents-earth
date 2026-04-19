/**
 * Escrow Service — interacts with BountyEscrow.sol on Base L2.
 *
 * On-chain mode requires:
 *   BASE_RPC_URL             — Base L2 JSON-RPC endpoint
 *   BOUNTY_ESCROW_ADDRESS    — deployed BountyEscrow contract address
 *   DEPLOYER_PRIVATE_KEY     — tx signing key (Hardhat/Anvil: optional)
 *
 * Falls back to an in-memory simulation when env vars are absent.
 */

const BASE_RPC_URL          = process.env.BASE_RPC_URL;
const BOUNTY_ESCROW_ADDRESS = process.env.BOUNTY_ESCROW_ADDRESS as `0x${string}` | undefined;
const DEPLOYER_PRIVATE_KEY  = process.env.DEPLOYER_PRIVATE_KEY;

const onChainEnabled = !!(BASE_RPC_URL && BOUNTY_ESCROW_ADDRESS);

// ---------------------------------------------------------------------------
// In-memory simulation (for local dev / CI)
// ---------------------------------------------------------------------------

interface MemEscrow {
  depositor: string;
  amountWei: bigint;
  released: boolean;
  refunded: boolean;
  releaseTxHash?: string;
  refundTxHash?: string;
}

const memEscrows = new Map<string, MemEscrow>();

// ---------------------------------------------------------------------------
// Encoding helpers
// ---------------------------------------------------------------------------

function pad32(hex: string): string {
  return hex.replace(/^0x/, "").padStart(64, "0");
}

function encodeUint256(n: bigint): string {
  return n.toString(16).padStart(64, "0");
}

/** UUID → bytes32 hex (strips hyphens) */
function uuidToBytes32(uuid: string): string {
  return "0x" + uuid.replace(/-/g, "").padStart(64, "0");
}

/** keccak256("depositEscrow(bytes32)") first 4 bytes */
const DEPOSIT_SELECTOR = "6c06a6e0";

/** keccak256("releaseEscrow(bytes32,address)") first 4 bytes */
const RELEASE_SELECTOR = "a4f6e2a1";

/** keccak256("refundEscrow(bytes32)") first 4 bytes */
const REFUND_SELECTOR = "b6e7be1f";

/** keccak256("getEscrow(bytes32)") first 4 bytes */
const GET_ESCROW_SELECTOR = "7e9a0e4c";

function encodeDepositEscrow(bountyId32: string): string {
  return `0x${DEPOSIT_SELECTOR}${pad32(bountyId32)}`;
}

function encodeReleaseEscrow(bountyId32: string, recipient: string): string {
  return `0x${RELEASE_SELECTOR}${pad32(bountyId32)}${pad32(recipient)}`;
}

function encodeRefundEscrow(bountyId32: string): string {
  return `0x${REFUND_SELECTOR}${pad32(bountyId32)}`;
}

function encodeGetEscrow(bountyId32: string): string {
  return `0x${GET_ESCROW_SELECTOR}${pad32(bountyId32)}`;
}

// ---------------------------------------------------------------------------
// JSON-RPC helper
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

async function sendTransaction(to: string, data: string, valueHex?: string): Promise<string> {
  const from = DEPLOYER_PRIVATE_KEY
    ? `0x${DEPLOYER_PRIVATE_KEY.slice(-40)}`
    : "0x0000000000000000000000000000000000000001"; // placeholder for Anvil unlocked acct
  const txParams: Record<string, string> = { from, to, data, gas: "0x30d40" };
  if (valueHex) txParams.value = valueHex;
  return (await rpcCall("eth_sendTransaction", [txParams])) as string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Lock `amountWei` ETH in escrow for `bountyId`.
 * Returns the transaction hash.
 */
export async function depositEscrow(
  bountyId: string,
  amountWei: bigint,
  depositorAgentId: string
): Promise<string> {
  const bountyId32 = uuidToBytes32(bountyId);

  if (!onChainEnabled) {
    if (memEscrows.has(bountyId)) throw new Error(`Escrow already exists for bounty ${bountyId}`);
    const mockTxHash = "0x" + bountyId.replace(/-/g, "").padStart(64, "0");
    memEscrows.set(bountyId, {
      depositor: depositorAgentId,
      amountWei,
      released: false,
      refunded: false,
    });
    console.log(`[escrowService] (mock) deposited ${amountWei} wei for bounty ${bountyId}`);
    return mockTxHash;
  }

  const data = encodeDepositEscrow(bountyId32);
  const valueHex = `0x${amountWei.toString(16)}`;
  return await sendTransaction(BOUNTY_ESCROW_ADDRESS!, data, valueHex);
}

/**
 * Release escrowed funds to `recipientAddress` on bounty resolution.
 * Only callable from the deployer / owner account.
 */
export async function releaseEscrow(
  bountyId: string,
  recipientAddress: string
): Promise<string> {
  const bountyId32 = uuidToBytes32(bountyId);

  if (!onChainEnabled) {
    const escrow = memEscrows.get(bountyId);
    if (!escrow) throw new Error(`No escrow found for bounty ${bountyId}`);
    if (escrow.released || escrow.refunded) throw new Error(`Escrow for ${bountyId} already settled`);
    const mockTxHash = "0x" + "11" + bountyId.replace(/-/g, "").slice(0, 62);
    escrow.released = true;
    escrow.releaseTxHash = mockTxHash;
    console.log(`[escrowService] (mock) released ${escrow.amountWei} wei for bounty ${bountyId} → ${recipientAddress}`);
    return mockTxHash;
  }

  const data = encodeReleaseEscrow(bountyId32, recipientAddress);
  return await sendTransaction(BOUNTY_ESCROW_ADDRESS!, data);
}

/**
 * Refund escrowed funds back to the depositor on failure / expiry.
 */
export async function refundEscrow(bountyId: string): Promise<string> {
  const bountyId32 = uuidToBytes32(bountyId);

  if (!onChainEnabled) {
    const escrow = memEscrows.get(bountyId);
    if (!escrow) throw new Error(`No escrow found for bounty ${bountyId}`);
    if (escrow.released || escrow.refunded) throw new Error(`Escrow for ${bountyId} already settled`);
    const mockTxHash = "0x" + "22" + bountyId.replace(/-/g, "").slice(0, 62);
    escrow.refunded = true;
    escrow.refundTxHash = mockTxHash;
    console.log(`[escrowService] (mock) refunded ${escrow.amountWei} wei for bounty ${bountyId}`);
    return mockTxHash;
  }

  const data = encodeRefundEscrow(bountyId32);
  return await sendTransaction(BOUNTY_ESCROW_ADDRESS!, data);
}

/**
 * Read the escrow state for a bounty from the chain (or in-memory fallback).
 */
export async function getEscrowState(bountyId: string): Promise<{
  depositor: string;
  amountWei: string;
  released: boolean;
  refunded: boolean;
} | null> {
  if (!onChainEnabled) {
    const e = memEscrows.get(bountyId);
    if (!e) return null;
    return {
      depositor: e.depositor,
      amountWei: e.amountWei.toString(),
      released: e.released,
      refunded: e.refunded,
    };
  }

  const bountyId32 = uuidToBytes32(bountyId);
  const data = encodeGetEscrow(bountyId32);
  const result = (await rpcCall("eth_call", [
    { to: BOUNTY_ESCROW_ADDRESS, data },
    "latest",
  ])) as string;

  if (!result || result === "0x") return null;

  // ABI-decode: (address depositor, uint256 amount, bool released, bool refunded)
  // Each value is padded to 32 bytes
  const hex = result.replace(/^0x/, "");
  const depositor = "0x" + hex.slice(24, 64);    // address is last 20 bytes of slot 0
  const amountWei = BigInt("0x" + hex.slice(64, 128)).toString();
  const released  = hex.slice(128, 192) !== "0".repeat(63) + "0";
  const refunded  = hex.slice(192, 256) !== "0".repeat(63) + "0";

  return { depositor, amountWei, released, refunded };
}

export { onChainEnabled };
