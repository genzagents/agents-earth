import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { store } from "../db/store";

export async function workingGroupRoutes(fastify: FastifyInstance) {
  /**
   * POST /api/working-groups
   * Create a new working group. Requires at least 3 agent members.
   */
  fastify.post(
    "/api/working-groups",
    {
      schema: {
        body: {
          type: "object",
          required: ["name", "memberIds"],
          properties: {
            name:        { type: "string", minLength: 1, maxLength: 100 },
            description: { type: "string", maxLength: 500 },
            memberIds:   { type: "array", items: { type: "string" }, minItems: 3 },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Body: { name: string; description?: string; memberIds: string[] };
      }>,
      reply: FastifyReply
    ) => {
      const { name, description = "", memberIds } = request.body;

      // Deduplicate and validate agents exist
      const uniqueIds = [...new Set(memberIds)];
      if (uniqueIds.length < 3) {
        return reply.code(400).send({ error: "Working group requires at least 3 distinct agents" });
      }

      for (const id of uniqueIds) {
        if (!store.getAgent(id)) {
          return reply.code(404).send({ error: `Agent not found: ${id}` });
        }
      }

      const group = store.createWorkingGroup(name, description, uniqueIds);
      return reply.code(201).send(group);
    }
  );

  /**
   * GET /api/working-groups
   * List all working groups (active by default).
   */
  fastify.get(
    "/api/working-groups",
    async (
      request: FastifyRequest<{ Querystring: { includeArchived?: string } }>,
    ) => {
      const includeArchived = request.query.includeArchived === "true";
      return store.workingGroups.filter(g => includeArchived || !g.archived);
    }
  );

  /**
   * GET /api/working-groups/:id
   */
  fastify.get(
    "/api/working-groups/:id",
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      const group = store.getWorkingGroup(request.params.id);
      if (!group) return reply.code(404).send({ error: "Working group not found" });
      return group;
    }
  );

  /**
   * POST /api/working-groups/:id/members
   * Add a member to an existing group.
   */
  fastify.post(
    "/api/working-groups/:id/members",
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

      const group = store.getWorkingGroup(id);
      if (!group) return reply.code(404).send({ error: "Working group not found" });
      if (group.archived) return reply.code(409).send({ error: "Working group is archived" });

      if (!store.getAgent(agentId)) {
        return reply.code(404).send({ error: "Agent not found" });
      }

      const added = store.addWorkingGroupMember(id, agentId);
      if (!added) return reply.code(409).send({ error: "Agent is already a member" });

      return store.getWorkingGroup(id);
    }
  );

  /**
   * GET /api/working-groups/:id/memory
   * Get the shared memory store of a working group.
   */
  fastify.get(
    "/api/working-groups/:id/memory",
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      const group = store.getWorkingGroup(request.params.id);
      if (!group) return reply.code(404).send({ error: "Working group not found" });
      return { groupId: group.id, entries: group.sharedMemory };
    }
  );

  /**
   * POST /api/working-groups/:id/memory
   * Add an entry to the shared memory.
   */
  fastify.post(
    "/api/working-groups/:id/memory",
    {
      schema: {
        body: {
          type: "object",
          required: ["entry", "agentId"],
          properties: {
            agentId: { type: "string" },
            entry:   { type: "string", minLength: 1, maxLength: 2000 },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { agentId: string; entry: string };
      }>,
      reply: FastifyReply
    ) => {
      const { id } = request.params;
      const { agentId, entry } = request.body;

      const group = store.getWorkingGroup(id);
      if (!group) return reply.code(404).send({ error: "Working group not found" });
      if (!group.memberIds.includes(agentId)) {
        return reply.code(403).send({ error: "Agent is not a member of this group" });
      }

      store.addWorkingGroupMemory(id, entry.trim());
      return reply.code(201).send({ groupId: id, added: entry.trim() });
    }
  );

  /**
   * POST /api/working-groups/:id/votes
   * Create a new internal vote.
   */
  fastify.post(
    "/api/working-groups/:id/votes",
    {
      schema: {
        body: {
          type: "object",
          required: ["question", "options"],
          properties: {
            question: { type: "string", minLength: 1, maxLength: 300 },
            options:  { type: "array", items: { type: "string" }, minItems: 2, maxItems: 10 },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { question: string; options: string[] };
      }>,
      reply: FastifyReply
    ) => {
      const { id } = request.params;
      const { question, options } = request.body;

      const vote = store.createWorkingGroupVote(id, question, options);
      if (!vote) return reply.code(404).send({ error: "Working group not found or archived" });
      return reply.code(201).send(vote);
    }
  );

  /**
   * POST /api/working-groups/:id/votes/:voteId/cast
   * Cast a vote on behalf of a member agent.
   */
  fastify.post(
    "/api/working-groups/:id/votes/:voteId/cast",
    {
      schema: {
        body: {
          type: "object",
          required: ["agentId", "optionIndex"],
          properties: {
            agentId:     { type: "string" },
            optionIndex: { type: "number", minimum: 0 },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Params: { id: string; voteId: string };
        Body: { agentId: string; optionIndex: number };
      }>,
      reply: FastifyReply
    ) => {
      const { id, voteId } = request.params;
      const { agentId, optionIndex } = request.body;

      const ok = store.castWorkingGroupVote(id, voteId, agentId, optionIndex);
      if (!ok) return reply.code(400).send({ error: "Vote failed — check group membership, vote id, and option index" });

      const group = store.getWorkingGroup(id);
      const vote = group?.votes.find(v => v.id === voteId);
      return vote;
    }
  );
}
