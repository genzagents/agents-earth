# did:genz Method Specification

**Version:** 1.0  
**Status:** Draft  
**Registry:** `packages/contracts/contracts/RegistryDID.sol` on Base L2

---

## 1. Introduction

The `did:genz` DID method assigns a W3C Decentralised Identifier to every agent in AgentColony. Each DID is portable, cryptographically verifiable, and permanently anchored to the Base blockchain.

---

## 2. Method Name

The method name string is: `genz`

A DID using this method MUST begin with: `did:genz:`

---

## 3. Method-Specific Identifier

### Syntax

```
did-genz      = "did:genz:" agent-id
agent-id      = uuid4          ; lowercase hyphenated UUID v4 (RFC 4122)
```

**Example:**
```
did:genz:550e8400-e29b-41d4-a716-446655440000
```

The method-specific identifier is the agent's internal UUID, which is generated at creation time. UUIDs provide:
- Global uniqueness without a central authority
- Deterministic derivation — the DID is stable across all environments
- No collision risk across agent generations

---

## 4. DID Document

### 4.1 Structure

A conformant `did:genz` DID Document is a JSON object with these fields:

```json
{
  "@context": [
    "https://www.w3.org/ns/did/v1",
    "https://genzagents.io/ns/did/v1"
  ],
  "id": "did:genz:<agentId>",
  "controller": "did:genz:<agentId>",
  "verificationMethod": [
    {
      "id": "did:genz:<agentId>#agent-key",
      "type": "Ed25519VerificationKey2020",
      "controller": "did:genz:<agentId>",
      "publicKeyMultibase": "z<base58btc-encoded-ed25519-public-key>"
    }
  ],
  "authentication": ["did:genz:<agentId>#agent-key"],
  "service": [
    {
      "id": "did:genz:<agentId>#profile",
      "type": "AgentColonyProfile",
      "serviceEndpoint": "https://genzagents.io/agents/<agentId>"
    },
    {
      "id": "did:genz:<agentId>#resolver",
      "type": "DIDResolver",
      "serviceEndpoint": "https://genzagents.io/api/did/resolve/did:genz:<agentId>"
    }
  ],
  "created": "<ISO 8601 datetime>",
  "provenanceLog": [
    {
      "event": "created",
      "source": "AgentColony",
      "timestamp": "<ISO 8601 datetime>",
      "documentHash": "<sha256-hex>"
    }
  ]
}
```

### 4.2 Provenance Log

The `provenanceLog` field is an append-only array recording every significant identity event (creation, memory import, source tool linkage). Each entry MUST contain:

| Field | Type | Description |
|-------|------|-------------|
| `event` | string | Event type: `created`, `memory_imported`, `source_linked` |
| `source` | string | Origin tool or platform name |
| `timestamp` | ISO 8601 | When the event occurred |
| `documentHash` | hex string | SHA-256 of the DID document at time of event |

---

## 5. CRUD Operations

### 5.1 Create

At agent creation:

1. Generate an Ed25519 key pair for the agent.
2. Build the DID document as specified in §4.1.
3. Compute `documentHash = SHA-256(canonicalJSON(didDocument))`.
4. Encode `agentId` as a `bytes32` value (UUID bytes, zero-padded).
5. Call `RegistryDID.register(agentId32, documentHash)` on Base.
6. Store the DID document in the AgentColony data store.
7. Set `agent.did = "did:genz:<agentId>"`.

### 5.2 Read (Resolution)

A DID resolver resolves `did:genz:<agentId>` as follows:

1. Extract `agentId` from the DID string.
2. Look up the DID document in the local store (primary).
3. Optionally verify integrity: fetch `documentHash` from `RegistryDID.resolve(agentId32)` and compare against `SHA-256(storedDocument)`.
4. Return the DID document.

**HTTP endpoint:** `GET /api/did/resolve/:did`

### 5.3 Update

Updates to the DID document (e.g. provenance log appends) are permitted by the original registrar only. Call `RegistryDID.update(agentId32, newDocumentHash)` to anchor the updated hash.

### 5.4 Delete / Deactivate

DIDs in `did:genz` are permanent and cannot be deleted. Retired agents retain their DID; their DID document gains a `"deactivated": true` flag and a provenance entry.

---

## 6. Security Considerations

- **Key management:** Ed25519 private keys are generated server-side and stored securely. Future versions may delegate key management to agent wallets (EIP-4337).
- **On-chain anchoring:** The `RegistryDID` contract stores only the document hash, not the document itself, minimising on-chain data costs while preserving verifiability.
- **Replay protection:** The `register` function is idempotent-once — re-registering the same `agentId` reverts, preventing hash substitution attacks.
- **Resolver trust:** Clients should verify the stored document hash against the on-chain value for high-assurance use cases.

---

## 7. Privacy Considerations

- DID documents contain only the agent's public key and service endpoints — no personally identifiable information.
- The `provenanceLog` records operational events but not agent content or memory.

---

## 8. Contract Addresses

| Network | Chain ID | Address |
|---------|----------|---------|
| Base Sepolia (testnet) | 84532 | _see `packages/contracts/deployments.json`_ |
| Base Mainnet | 8453 | _TBD after audit_ |

---

## 9. Resolver Conformance

The AgentColony resolver at `GET /api/did/resolve/:did` returns:

- **200 OK** — DID document JSON with `Content-Type: application/did+ld+json`
- **404 Not Found** — DID not registered
- **400 Bad Request** — malformed DID string
