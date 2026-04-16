import crypto from "crypto";

export interface ProvenanceEntry {
  event: "created" | "memory_imported" | "source_linked" | "updated";
  source: string;
  timestamp: string;
  documentHash: string;
}

export interface DIDDocument {
  "@context": string[];
  id: string;
  controller: string;
  verificationMethod: Array<{
    id: string;
    type: string;
    controller: string;
    publicKeyMultibase: string;
  }>;
  authentication: string[];
  service: Array<{
    id: string;
    type: string;
    serviceEndpoint: string;
  }>;
  created: string;
  provenanceLog: ProvenanceEntry[];
  deactivated?: boolean;
}

const BASE_URL = process.env.PUBLIC_URL || "https://genzagents.io";

/** Base58btc alphabet (Bitcoin alphabet used in Multibase `z` prefix) */
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function encodeBase58(buffer: Buffer): string {
  const digits: number[] = [0];
  for (const byte of buffer) {
    let carry = byte;
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  // Add leading '1' characters for leading zero bytes
  let result = "";
  for (const byte of buffer) {
    if (byte !== 0) break;
    result += "1";
  }
  for (let i = digits.length - 1; i >= 0; i--) {
    result += BASE58_ALPHABET[digits[i]];
  }
  return result;
}

/** Generate a new Ed25519 key pair for the agent. Returns the keys as hex strings. */
export function generateAgentKeyPair(): { publicKeyHex: string; privateKeyHex: string } {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
  const pubDer = publicKey.export({ type: "spki", format: "der" });
  const privDer = privateKey.export({ type: "pkcs8", format: "der" });
  // Ed25519 SPKI DER: last 32 bytes are the raw public key
  const rawPub = Buffer.from(pubDer).slice(-32);
  // Ed25519 PKCS8 DER: last 32 bytes are the raw private key
  const rawPriv = Buffer.from(privDer).slice(-32);
  return {
    publicKeyHex: rawPub.toString("hex"),
    privateKeyHex: rawPriv.toString("hex"),
  };
}

/** Encode a raw public key (Buffer or hex string) as Multibase base58btc (z prefix). */
function toPublicKeyMultibase(pubKeyHex: string): string {
  const raw = Buffer.from(pubKeyHex, "hex");
  // Prepend ed25519-pub multicodec varint (0xed, 0x01)
  const multicodec = Buffer.concat([Buffer.from([0xed, 0x01]), raw]);
  return "z" + encodeBase58(multicodec);
}

/** Build a canonical DID document for an agent. */
export function buildDIDDocument(agentId: string, publicKeyHex: string, createdAt?: Date): DIDDocument {
  const did = `did:genz:${agentId}`;
  const now = (createdAt ?? new Date()).toISOString();

  const doc: Omit<DIDDocument, "provenanceLog"> & { provenanceLog: ProvenanceEntry[] } = {
    "@context": [
      "https://www.w3.org/ns/did/v1",
      "https://genzagents.io/ns/did/v1",
    ],
    id: did,
    controller: did,
    verificationMethod: [
      {
        id: `${did}#agent-key`,
        type: "Ed25519VerificationKey2020",
        controller: did,
        publicKeyMultibase: toPublicKeyMultibase(publicKeyHex),
      },
    ],
    authentication: [`${did}#agent-key`],
    service: [
      {
        id: `${did}#profile`,
        type: "AgentColonyProfile",
        serviceEndpoint: `${BASE_URL}/agents/${agentId}`,
      },
      {
        id: `${did}#resolver`,
        type: "DIDResolver",
        serviceEndpoint: `${BASE_URL}/api/did/resolve/${encodeURIComponent(did)}`,
      },
    ],
    created: now,
    provenanceLog: [],
  };

  // Compute initial hash (without provenance entry, then add entry with that hash)
  const initialHash = hashDocument(doc as DIDDocument);
  doc.provenanceLog.push({
    event: "created",
    source: "AgentColony",
    timestamp: now,
    documentHash: initialHash,
  });

  return doc as DIDDocument;
}

/** Compute SHA-256 of the canonical JSON representation of a DID document. */
export function hashDocument(doc: DIDDocument): string {
  // Canonicalise: sort keys deterministically
  const canonical = JSON.stringify(doc, Object.keys(doc).sort());
  return crypto.createHash("sha256").update(canonical, "utf8").digest("hex");
}

/** Convert a UUID string to a bytes32 hex value (for the on-chain registry). */
export function uuidToBytes32(uuid: string): `0x${string}` {
  // Strip hyphens → 32 hex chars → zero-pad to 64 hex chars (bytes32)
  const hex = uuid.replace(/-/g, "");
  return `0x${hex.padEnd(64, "0")}` as `0x${string}`;
}
