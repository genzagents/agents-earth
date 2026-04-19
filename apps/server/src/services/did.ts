import crypto from "crypto";
import { createPublicClient, createWalletClient, http, keccak256, toHex, type Hash } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import type { Agent } from "@agentcolony/shared";

const BASE_RPC_URL = process.env.BASE_RPC_URL;
const DID_SIGNER_PRIVATE_KEY = process.env.DID_SIGNER_PRIVATE_KEY as `0x${string}` | undefined;

interface DIDDocument {
  "@context": string[];
  id: string;
  verificationMethod: { id: string; type: string; controller: string; blockchainAccountId: string }[];
  authentication: string[];
  created: string;
  agentId: string;
  agentName: string;
}

function deriveAgentAddress(agentId: string): `0x${string}` {
  const hash = crypto.createHash("sha256").update(`agentcolony:${agentId}`).digest("hex");
  return `0x${hash.slice(0, 40)}` as `0x${string}`;
}

function buildDIDDocument(agent: Agent): DIDDocument {
  const address = deriveAgentAddress(agent.id);
  const did = `did:ethr:base:${address}`;
  return {
    "@context": ["https://www.w3.org/ns/did/v1", "https://w3id.org/security/suites/secp256k1recovery-2020/v2"],
    id: did,
    verificationMethod: [{ id: `${did}#controller`, type: "EcdsaSecp256k1RecoveryMethod2020", controller: did, blockchainAccountId: `eip155:8453:${address}` }],
    authentication: [`${did}#controller`],
    created: new Date().toISOString(),
    agentId: agent.id,
    agentName: agent.name,
  };
}

async function anchorOnBase(didDocument: DIDDocument): Promise<Hash | null> {
  if (!BASE_RPC_URL || !DID_SIGNER_PRIVATE_KEY) {
    console.info("[did] BASE_RPC_URL or DID_SIGNER_PRIVATE_KEY not set — skipping on-chain anchoring");
    return null;
  }
  const account = privateKeyToAccount(DID_SIGNER_PRIVATE_KEY);
  const publicClient = createPublicClient({ chain: base, transport: http(BASE_RPC_URL) });
  const walletClient = createWalletClient({ chain: base, transport: http(BASE_RPC_URL), account });
  const docHash = keccak256(toHex(JSON.stringify(didDocument)));
  const txHash = await walletClient.sendTransaction({ to: account.address, value: 0n, data: docHash });
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  console.info(`[did] Anchored DID ${didDocument.id} on Base L2 — tx: ${txHash}`);
  return txHash;
}

export interface DIDResult { did: string; document: DIDDocument; anchorTx: string | null; }

export async function createDID(agent: Agent): Promise<DIDResult> {
  const document = buildDIDDocument(agent);
  const anchorTx = await anchorOnBase(document);
  return { did: document.id, document, anchorTx };
}
