import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { store } from "../db/store";

export async function treasuryRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/treasury/report
   * Quarterly transparency report: balance, proposals, bounty payouts.
   */
  fastify.get("/api/treasury/report", async () => {
    return store.getTreasuryReport();
  });

  /**
   * GET /api/treasury/proposals
   * List all treasury proposals.
   */
  fastify.get(
    "/api/treasury/proposals",
    async (
      request: FastifyRequest<{ Querystring: { open?: string } }>,
    ) => {
      const openOnly = request.query.open === "true";
      const proposals = store.treasuryProposals;
      return openOnly ? proposals.filter(p => p.closedAt === undefined) : proposals;
    }
  );

  /**
   * POST /api/treasury/proposals
   * Create a new treasury spending proposal.
   */
  fastify.post(
    "/api/treasury/proposals",
    {
      schema: {
        body: {
          type: "object",
          required: ["title", "description", "amountRequested", "createdBy"],
          properties: {
            title:           { type: "string", minLength: 1, maxLength: 200 },
            description:     { type: "string", minLength: 1, maxLength: 2000 },
            amountRequested: { type: "number", minimum: 1 },
            createdBy:       { type: "string" },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Body: {
          title: string;
          description: string;
          amountRequested: number;
          createdBy: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      const { title, description, amountRequested, createdBy } = request.body;

      if (!store.getAgent(createdBy)) {
        return reply.code(404).send({ error: "Creator agent not found" });
      }

      const proposal = store.createTreasuryProposal(title, description, amountRequested, createdBy);
      return reply.code(201).send(proposal);
    }
  );

  /**
   * POST /api/treasury/vote
   * Cast a reputation-weighted vote on a treasury proposal.
   * Body: { proposalId, agentId, vote: "yes" | "no" | "abstain" }
   */
  fastify.post(
    "/api/treasury/vote",
    {
      schema: {
        body: {
          type: "object",
          required: ["proposalId", "agentId", "vote"],
          properties: {
            proposalId: { type: "string" },
            agentId:    { type: "string" },
            vote:       { type: "string", enum: ["yes", "no", "abstain"] },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Body: { proposalId: string; agentId: string; vote: "yes" | "no" | "abstain" };
      }>,
      reply: FastifyReply
    ) => {
      const { proposalId, agentId, vote } = request.body;

      if (!store.getAgent(agentId)) {
        return reply.code(404).send({ error: "Agent not found" });
      }

      const record = store.castTreasuryVote(proposalId, agentId, vote);
      if (!record) {
        return reply.code(409).send({ error: "Proposal not found or already closed" });
      }

      return record;
    }
  );

  /**
   * GET /api/treasury/proposals/:id
   */
  fastify.get(
    "/api/treasury/proposals/:id",
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      const proposal = store.getTreasuryProposal(request.params.id);
      if (!proposal) return reply.code(404).send({ error: "Proposal not found" });

      // Aggregate weighted vote totals
      const totals = { yes: 0, no: 0, abstain: 0 };
      for (const v of proposal.votes) {
        totals[v.vote] += v.weight;
      }

      return { ...proposal, weightedTotals: totals };
    }
  );
}
