/**
 * DID Service — orchestrates DID issuance for AgentColony agents.
 *
 * At agent creation call `issueAgentDID(agentId)`:
 * - Generates an Ed25519 key pair
 * - Builds the W3C DID document
 * - Anchors the document hash on Base (or in-memory fallback)
 * - Returns the DID string ("did:genz:<agentId>") and the document
 */

import { buildDIDDocument, generateAgentKeyPair, hashDocument, uuidToBytes32, type DIDDocument } from "./document";
import { anchorOnChain } from "./registry";

// In-process store: agentId → { document, publicKeyHex }
const didStore = new Map<string, { document: DIDDocument; publicKeyHex: string }>();

export interface IssuedDID {
  did: string;
  document: DIDDocument;
  documentHash: string;
}

/**
 * Issue a did:genz DID for an agent.
 * Idempotent — returns the existing DID if already issued.
 */
export async function issueAgentDID(agentId: string): Promise<IssuedDID> {
  const existing = didStore.get(agentId);
  if (existing) {
    return {
      did: existing.document.id,
      document: existing.document,
      documentHash: hashDocument(existing.document),
    };
  }

  const { publicKeyHex } = generateAgentKeyPair();
  const document = buildDIDDocument(agentId, publicKeyHex, new Date());
  const documentHash = hashDocument(document);
  const agentId32 = uuidToBytes32(agentId);

  // Anchor on-chain (non-blocking — failure is logged but does not abort creation)
  anchorOnChain(agentId32, documentHash).catch((err: unknown) => {
    console.error("[did/service] Failed to anchor DID on-chain:", err);
  });

  didStore.set(agentId, { document, publicKeyHex });

  return {
    did: `did:genz:${agentId}`,
    document,
    documentHash,
  };
}

/**
 * Resolve a did:genz DID string to its document.
 * Returns null if not found.
 */
export function resolveDID(did: string): DIDDocument | null {
  const match = did.match(/^did:genz:([0-9a-f-]{36})$/i);
  if (!match) return null;
  const agentId = match[1].toLowerCase();
  return didStore.get(agentId)?.document ?? null;
}

/**
 * Resolve by agentId directly.
 */
export function resolveByAgentId(agentId: string): DIDDocument | null {
  return didStore.get(agentId)?.document ?? null;
}
