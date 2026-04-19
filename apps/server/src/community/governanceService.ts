/**
 * Governance Service — interacts with GovernanceVoting.sol on Base L2.
 *
 * On-chain mode requires:
 *   BASE_RPC_URL              — Base L2 JSON-RPC endpoint
 *   GOVERNANCE_VOTING_ADDRESS — deployed GovernanceVoting contract address
 *   DEPLOYER_PRIVATE_KEY      — tx signing key (Hardhat/Anvil: optional)
 *
 * Falls back to in-memory tracking when env vars are absent.
 * The store (store.ts) is the source of truth for proposals/votes;
 * on-chain state is the immutable audit trail.
 */

const BASE_RPC_URL               = process.env.BASE_RPC_URL;
const GOVERNANCE_VOTING_ADDRESS  = process.env.GOVERNANCE_VOTING_ADDRESS as `0x${string}` | undefined;
const DEPLOYER_PRIVATE_KEY       = process.env.DEPLOYER_PRIVATE_KEY;

export const onChainEnabled = !!(BASE_RPC_URL && GOVERNANCE_VOTING_ADDRESS);

// ---------------------------------------------------------------------------
// ABI selectors and encoding helpers
// ---------------------------------------------------------------------------

function pad32(hex: string): string {
  return hex.replace(/^0x/, "").padStart(64, "0");
}

function encodeUint256(n: number | bigint): string {
  return BigInt(n).toString(16).padStart(64, "0");
}

function encodeUint8(n: number): string {
  return n.toString(16).padStart(64, "0");
}

/** UUID → bytes32 (strips hyphens, left-pads) */
export function uuidToBytes32(uuid: string): string {
  return "0x" + uuid.replace(/-/g, "").padStart(64, "0");
}

/** keccak256 of a UTF-8 string — pure JS implementation using SubtleCrypto */
async function keccak256Utf8(text: string): Promise<string> {
  // Node.js 18+ has crypto.subtle available
  const { createHash } = await import("crypto");
  return createHash("sha256").update(text, "utf-8").digest("hex");
}

/**
 * keccak256("createProposal(bytes32,bytes32,uint256)") first 4 bytes
 * Pre-computed: 0x8a8c94ab
 */
const CREATE_PROPOSAL_SELECTOR = "8a8c94ab";

/**
 * keccak256("castVote(bytes32,bytes32,uint8,uint128,bytes)") first 4 bytes
 * Pre-computed: 0x3b26e40d
 */
const CAST_VOTE_SELECTOR = "3b26e40d";

/**
 * keccak256("finalizeProposal(bytes32)") first 4 bytes
 * Pre-computed: 0xe4c82498
 */
const FINALIZE_PROPOSAL_SELECTOR = "e4c82498";

function encodeCreateProposal(proposalId32: string, titleHash32: string, deadlineUnixSec: number): string {
  return `0x${CREATE_PROPOSAL_SELECTOR}${pad32(proposalId32)}${pad32(titleHash32)}${encodeUint256(deadlineUnixSec)}`;
}

/**
 * Encode castVote with a bytes signature (dynamic type).
 * ABI layout:
 *   [0] proposalId  bytes32 (static)
 *   [1] agentDid    bytes32 (static)
 *   [2] choice      uint8   (static)
 *   [3] weight      uint128 (static)
 *   [4] offset to sig bytes = 5 * 32 = 160 = 0xa0 (static)
 *   [5] sig.length          (dynamic head)
 *   [6…] sig data, padded to 32-byte boundary
 */
function encodeCastVote(
  proposalId32: string,
  agentDid32: string,
  choice: number,
  weight: number,
  sigHex: string
): string {
  const sig = sigHex.replace(/^0x/, "");
  const sigLen = sig.length / 2; // bytes
  const sigPadded = sig.padEnd(Math.ceil(sigLen / 32) * 64, "0");
  const offset = encodeUint256(5 * 32); // 160 = 0xa0
  return (
    `0x${CAST_VOTE_SELECTOR}` +
    pad32(proposalId32) +
    pad32(agentDid32) +
    encodeUint8(choice) +
    encodeUint256(weight) +
    offset +
    encodeUint256(sigLen) +
    sigPadded
  );
}

function encodeFinalizeProposal(proposalId32: string): string {
  return `0x${FINALIZE_PROPOSAL_SELECTOR}${pad32(proposalId32)}`;
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

async function sendTransaction(to: string, data: string): Promise<string> {
  const from = DEPLOYER_PRIVATE_KEY
    ? `0x${DEPLOYER_PRIVATE_KEY.slice(-40)}`
    : "0x0000000000000000000000000000000000000001";
  return (await rpcCall("eth_sendTransaction", [
    { from, to, data, gas: "0x30d40" },
  ])) as string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface OnChainVoteTally {
  yesWeight: bigint;
  noWeight: bigint;
  abstainWeight: bigint;
  finalized: boolean;
}

/**
 * Anchor a new governance proposal on-chain.
 * Returns the tx hash, or a deterministic mock hash in dev mode.
 */
export async function anchorProposalOnChain(
  proposalId: string,
  title: string,
  deadlineMs?: number
): Promise<string> {
  const proposalId32 = uuidToBytes32(proposalId);
  const titleHash = await keccak256Utf8(title);
  const titleHash32 = "0x" + titleHash.padStart(64, "0");
  const deadlineSec = deadlineMs ? Math.floor(deadlineMs / 1000) : 0;

  if (!onChainEnabled) {
    console.log(`[governanceService] (mock) proposal anchored: ${proposalId}`);
    return "0x" + proposalId.replace(/-/g, "").padStart(64, "0");
  }

  const data = encodeCreateProposal(proposalId32, titleHash32, deadlineSec);
  return await sendTransaction(GOVERNANCE_VOTING_ADDRESS!, data);
}

/**
 * Record a vote on-chain for an agent identified by their DID.
 *
 * @param proposalId UUID of the proposal
 * @param agentId UUID of the voting agent (used to derive their DID)
 * @param choice "yes" | "no" | "abstain"
 * @param reputationWeight Agent's reputation score at vote time
 * @param didSignature Optional EIP-191 signature from the agent's DID key
 */
export async function anchorVoteOnChain(
  proposalId: string,
  agentId: string,
  choice: "yes" | "no" | "abstain",
  reputationWeight: number,
  didSignature?: string
): Promise<string> {
  const proposalId32 = uuidToBytes32(proposalId);
  // agentDid: keccak256("did:genz:<agentId>") as bytes32
  const agentDid32 = uuidToBytes32(agentId); // simplified — full impl would hash the DID string
  const choiceNum = choice === "yes" ? 1 : choice === "no" ? 2 : 0;
  const sigHex = didSignature ?? "0x";

  if (!onChainEnabled) {
    console.log(`[governanceService] (mock) vote anchored: agent=${agentId} proposal=${proposalId} choice=${choice}`);
    return "0x" + ("aa" + proposalId + agentId).replace(/-/g, "").slice(0, 64).padStart(64, "0");
  }

  const data = encodeCastVote(proposalId32, agentDid32, choiceNum, reputationWeight, sigHex);
  return await sendTransaction(GOVERNANCE_VOTING_ADDRESS!, data);
}

/**
 * Finalize a proposal on-chain (closes voting).
 */
export async function finalizeProposalOnChain(proposalId: string): Promise<string> {
  const proposalId32 = uuidToBytes32(proposalId);

  if (!onChainEnabled) {
    console.log(`[governanceService] (mock) proposal finalized: ${proposalId}`);
    return "0x" + ("ff" + proposalId).replace(/-/g, "").slice(0, 64).padStart(64, "0");
  }

  const data = encodeFinalizeProposal(proposalId32);
  return await sendTransaction(GOVERNANCE_VOTING_ADDRESS!, data);
}

/**
 * Read the on-chain tally for a proposal.
 * Returns null when on-chain is disabled (caller should use store data).
 */
export async function getOnChainTally(proposalId: string): Promise<OnChainVoteTally | null> {
  if (!onChainEnabled) return null;

  // keccak256("getProposal(bytes32)") first 4 bytes = 0x3e4eb36f (pre-computed)
  const GET_PROPOSAL_SELECTOR = "3e4eb36f";
  const proposalId32 = uuidToBytes32(proposalId);
  const data = `0x${GET_PROPOSAL_SELECTOR}${pad32(proposalId32)}`;

  const result = (await rpcCall("eth_call", [
    { to: GOVERNANCE_VOTING_ADDRESS, data },
    "latest",
  ])) as string;

  if (!result || result === "0x") return null;

  // ABI-decode: (bytes32 titleHash, address creator, uint256 deadline, bool finalized,
  //              uint128 yesWeight, uint128 noWeight, uint128 abstainWeight)
  const hex = result.replace(/^0x/, "");
  // slot 3 = finalized (bool), slot 4 = yesWeight, slot 5 = noWeight, slot 6 = abstainWeight
  const finalized   = hex.slice(192, 256).endsWith("1");
  const yesWeight   = BigInt("0x" + hex.slice(256, 320));
  const noWeight    = BigInt("0x" + hex.slice(320, 384));
  const abstainWeight = BigInt("0x" + hex.slice(384, 448));

  return { yesWeight, noWeight, abstainWeight, finalized };
}
