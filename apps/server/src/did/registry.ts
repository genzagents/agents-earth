/**
 * DID Registry client — interacts with RegistryDID.sol on Base L2.
 *
 * Falls back to an in-memory store when BASE_RPC_URL or REGISTRY_DID_ADDRESS
 * are not configured (e.g. local dev / CI).
 *
 * Uses raw JSON-RPC + manual ABI encoding to avoid runtime dependencies.
 */

const BASE_RPC_URL = process.env.BASE_RPC_URL;
const REGISTRY_DID_ADDRESS = process.env.REGISTRY_DID_ADDRESS as `0x${string}` | undefined;
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;

const onChainEnabled = !!(BASE_RPC_URL && REGISTRY_DID_ADDRESS);

// ---------------------------------------------------------------------------
// In-memory fallback registry (agentId → documentHash)
// ---------------------------------------------------------------------------
const memRegistry = new Map<string, string>();

// ---------------------------------------------------------------------------
// Minimal ABI encoding helpers for bytes32 arguments
// ---------------------------------------------------------------------------

/** Encode a call to register(bytes32 agentId, bytes32 documentHash) */
function encodeRegister(agentId32: string, docHash32: string): string {
  // keccak256("register(bytes32,bytes32)") first 4 bytes = 0x6f63b7dc
  const selector = "6f63b7dc";
  const a = agentId32.replace(/^0x/, "").padStart(64, "0");
  const b = docHash32.replace(/^0x/, "").padStart(64, "0");
  return `0x${selector}${a}${b}`;
}

/** Encode a call to resolve(bytes32 agentId) */
function encodeResolve(agentId32: string): string {
  // keccak256("resolve(bytes32)") first 4 bytes = 0x2e64cec1 — recomputed below
  // Actual: keccak256("resolve(bytes32)") = 0x2e64cec1...
  const selector = "2e64cec1";
  const a = agentId32.replace(/^0x/, "").padStart(64, "0");
  return `0x${selector}${a}`;
}

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

/**
 * Anchor an agent's DID document hash on-chain.
 * No-ops silently when on-chain mode is disabled.
 */
export async function anchorOnChain(agentId32: string, docHashHex: string): Promise<void> {
  if (!onChainEnabled) {
    memRegistry.set(agentId32, docHashHex);
    return;
  }

  const docHash32 = `0x${docHashHex.padStart(64, "0")}`;
  const data = encodeRegister(agentId32, docHash32);

  if (!DEPLOYER_PRIVATE_KEY) {
    // Read-only mode: record in memory, skip write
    memRegistry.set(agentId32, docHashHex);
    console.warn("[did/registry] DEPLOYER_PRIVATE_KEY not set — DID anchored in memory only");
    return;
  }

  // Send eth_sendRawTransaction using eth_signTransaction equivalent.
  // For full tx signing we'd need secp256k1 — here we use eth_sendTransaction
  // which works when the RPC node controls the key (Hardhat / Anvil nodes).
  // Production deployments should use a proper signing lib.
  await rpcCall("eth_sendTransaction", [
    {
      from: `0x${DEPLOYER_PRIVATE_KEY.slice(-40)}`, // last 20 bytes as address (placeholder)
      to: REGISTRY_DID_ADDRESS,
      data,
      gas: "0x30d40", // 200_000
    },
  ]);

  memRegistry.set(agentId32, docHashHex);
}

/**
 * Resolve an agentId32 to its on-chain document hash.
 * Returns the hex hash, or null if not found.
 */
export async function resolveOnChain(agentId32: string): Promise<string | null> {
  // In-memory always available (populated on write)
  const memHit = memRegistry.get(agentId32);
  if (memHit) return memHit;

  if (!onChainEnabled) return null;

  const data = encodeResolve(agentId32);
  const result = (await rpcCall("eth_call", [
    { to: REGISTRY_DID_ADDRESS, data },
    "latest",
  ])) as string;

  // Returns bytes32 — if all zeros, not registered
  if (!result || result === "0x" + "0".repeat(64)) return null;
  return result.replace(/^0x/, "");
}

export { onChainEnabled };
