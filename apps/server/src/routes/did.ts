import type { FastifyInstance } from "fastify";
import { resolveDID } from "../did/service.js";

export async function didRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/did/resolve/:did
   * Resolves a did:genz DID to its W3C DID Document.
   */
  fastify.get<{ Params: { did: string } }>("/api/did/resolve/:did", async (req, reply) => {
    const rawDid = decodeURIComponent(req.params.did);

    if (!rawDid.startsWith("did:genz:")) {
      return reply.code(400).send({ error: "Invalid DID — only did:genz method is supported" });
    }

    const document = resolveDID(rawDid);
    if (!document) {
      return reply.code(404).send({ error: "DID not found" });
    }

    return reply
      .header("Content-Type", "application/did+ld+json")
      .send(document);
  });

  /**
   * GET /api/did/agent/:agentId
   * Convenience endpoint — resolve by agentId directly.
   */
  fastify.get<{ Params: { agentId: string } }>("/api/did/agent/:agentId", async (req, reply) => {
    const did = `did:genz:${req.params.agentId}`;
    const document = resolveDID(did);
    if (!document) {
      return reply.code(404).send({ error: "DID not found for agent" });
    }
    return reply
      .header("Content-Type", "application/did+ld+json")
      .send(document);
  });
}
