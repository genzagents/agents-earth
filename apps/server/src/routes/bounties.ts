import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { store } from "../db/store";
import type { BountyStatus } from "../db/store";

export async function bountyRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/bounties
   * List bounties, optionally filtered by status.
   */
  fastify.get(
    "/api/bounties",
    async (
      request: FastifyRequest<{ Querystring: { status?: BountyStatus } }>,
    ) => {
      const { status } = request.query;
      const bounties = store.bounties;
      return status ? bounties.filter(b => b.status === status) : bounties;
    }
  );

  /**
   * GET /api/bounties/:id
   */
  fastify.get(
    "/api/bounties/:id",
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      const bounty = store.getBounty(request.params.id);
      if (!bounty) return reply.code(404).send({ error: "Bounty not found" });
      return bounty;
    }
  );

  /**
   * POST /api/bounties
   * Create a commons-funded bounty (deducted from treasury).
   * Body: { title, description, reward, createdBy }
   */
  fastify.post(
    "/api/bounties",
    {
      schema: {
        body: {
          type: "object",
          required: ["title", "description", "reward", "createdBy"],
          properties: {
            title:       { type: "string", minLength: 1, maxLength: 200 },
            description: { type: "string", minLength: 1, maxLength: 2000 },
            reward:      { type: "number", minimum: 1 },
            createdBy:   { type: "string" },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Body: { title: string; description: string; reward: number; createdBy: string };
      }>,
      reply: FastifyReply
    ) => {
      const { title, description, reward, createdBy } = request.body;

      if (!store.getAgent(createdBy)) {
        return reply.code(404).send({ error: "Creator agent not found" });
      }

      const bounty = store.createBounty(title, description, reward, createdBy);
      if (!bounty) {
        return reply.code(402).send({
          error: "Insufficient treasury funds",
          treasuryBalance: store.treasuryBalance,
          requested: reward,
        });
      }

      return reply.code(201).send(bounty);
    }
  );

  /**
   * POST /api/bounties/:id/claim
   * Claim a bounty (status: open → claimed).
   */
  fastify.post(
    "/api/bounties/:id/claim",
    {
      schema: {
        body: {
          type: "object",
          required: ["agentId"],
          properties: { agentId: { type: "string" } },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { agentId: string };
      }>,
      reply: FastifyReply
    ) => {
      const { id } = request.params;
      const { agentId } = request.body;

      if (!store.getAgent(agentId)) {
        return reply.code(404).send({ error: "Agent not found" });
      }

      const bounty = store.claimBounty(id, agentId);
      if (!bounty) {
        return reply.code(409).send({ error: "Bounty not found or not in open state" });
      }

      return bounty;
    }
  );

  /**
   * POST /api/bounties/:id/submit
   * Submit completed work (status: claimed → submitted).
   */
  fastify.post(
    "/api/bounties/:id/submit",
    {
      schema: {
        body: {
          type: "object",
          required: ["agentId"],
          properties: { agentId: { type: "string" } },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { agentId: string };
      }>,
      reply: FastifyReply
    ) => {
      const { id } = request.params;
      const { agentId } = request.body;

      const bounty = store.submitBounty(id, agentId);
      if (!bounty) {
        return reply.code(409).send({ error: "Bounty not found, not claimed, or claimedBy mismatch" });
      }

      return bounty;
    }
  );

  /**
   * POST /api/bounties/:id/resolve
   * Resolve (approve or reject) a submitted bounty.
   * Approval: pays reward + marks resolved.
   * Rejection: re-opens for next attempt (up to 3), then fails + slashes reputation.
   */
  fastify.post(
    "/api/bounties/:id/resolve",
    {
      schema: {
        body: {
          type: "object",
          required: ["approved"],
          properties: { approved: { type: "boolean" } },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { approved: boolean };
      }>,
      reply: FastifyReply
    ) => {
      const { id } = request.params;
      const { approved } = request.body;

      const bounty = store.resolveBounty(id, approved);
      if (!bounty) {
        return reply.code(409).send({ error: "Bounty not found or not in submitted state" });
      }

      return bounty;
    }
  );
}
