import path from "path";
import fs from "fs";
import { pipeline } from "stream/promises";
import multipart from "@fastify/multipart";
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { findSession } from "../auth/sessions";
import { findUserById } from "../auth/userStore";
import {
  createAgent,
  findAgentsByUser,
  findAgentById,
  updateAgent,
  deleteAgent,
} from "../db/ownedAgentStore";
import type { ProvenanceEntry } from "@agentcolony/shared";

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(process.cwd(), "uploads");
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const SESSION_COOKIE = "agentcolony_session";

/** Resolve the authenticated user from Bearer token or session cookie. */
async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  let token: string | undefined;

  const authHeader = request.headers["authorization"];
  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.slice(7);
  } else {
    token = request.cookies?.[SESSION_COOKIE];
  }

  if (!token) {
    await reply.code(401).send({ error: "Not authenticated" });
    return null;
  }

  const session = await findSession(token);
  if (!session) {
    await reply.code(401).send({ error: "Session expired" });
    return null;
  }

  const user = await findUserById(session.userId);
  if (!user) {
    await reply.code(401).send({ error: "User not found" });
    return null;
  }

  return user;
}

export const agentRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(multipart, { limits: { fileSize: MAX_FILE_SIZE } });
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  /**
   * POST /api/agents
   * Create a new owned agent.
   */
  fastify.post(
    "/api/agents",
    {
      schema: {
        body: {
          type: "object",
          required: ["name"],
          properties: {
            name:        { type: "string", minLength: 1, maxLength: 100 },
            bio:         { type: "string" },
            traits:      { type: "array", items: { type: "string" } },
            model:       { type: "string" },
            avatar:      { type: "string" },
            capabilities:{ type: "array", items: { type: "string" } },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Body: {
          name: string;
          bio?: string;
          traits?: string[];
          model?: string;
          avatar?: string;
          capabilities?: string[];
        };
      }>,
      reply: FastifyReply
    ) => {
      const user = await requireAuth(request, reply);
      if (!user) return;

      const { name, bio, traits, model, avatar } = request.body;

      const agent = await createAgent({
        userId: user.id,
        name: name.trim(),
        description: bio?.trim() || undefined,
        traits: traits ?? [],
        model: model ?? "claude-sonnet-4-6",
        avatarColor: avatar || undefined,
      });

      return reply.code(201).send(agent);
    }
  );

  /**
   * GET /api/agents
   * List the authenticated user's agents.
   */
  fastify.get("/api/agents", async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const agents = await findAgentsByUser(user.id);
    return reply.send(agents);
  });

  /**
   * GET /api/agents/:id
   * Get a single owned agent (must belong to caller).
   */
  fastify.get(
    "/api/agents/:id",
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      const user = await requireAuth(request, reply);
      if (!user) return;

      const agent = await findAgentById(request.params.id);
      if (!agent || agent.userId !== user.id) {
        return reply.code(404).send({ error: "Agent not found" });
      }
      return reply.send(agent);
    }
  );

  /**
   * PATCH /api/agents/:id
   * Update an owned agent.
   */
  fastify.patch(
    "/api/agents/:id",
    {
      schema: {
        body: {
          type: "object",
          properties: {
            name:        { type: "string", minLength: 1, maxLength: 100 },
            description: { type: "string" },
            traits:      { type: "array", items: { type: "string" } },
            systemPrompt:{ type: "string" },
            model:       { type: "string" },
            avatarColor: { type: "string" },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: {
          name?: string;
          description?: string;
          traits?: string[];
          systemPrompt?: string;
          model?: string;
          avatarColor?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      const user = await requireAuth(request, reply);
      if (!user) return;

      const updated = await updateAgent(request.params.id, user.id, request.body);
      if (!updated) return reply.code(404).send({ error: "Agent not found" });
      return reply.send(updated);
    }
  );

  /**
   * DELETE /api/agents/:id
   * Delete an owned agent.
   */
  fastify.delete(
    "/api/agents/:id",
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      const user = await requireAuth(request, reply);
      if (!user) return;

      const deleted = await deleteAgent(request.params.id, user.id);
      if (!deleted) return reply.code(404).send({ error: "Agent not found" });
      return reply.code(204).send();
    }
  );

  /**
   * GET /api/agents/:id/provenance
   * Return the provenance log for an owned agent.
   */
  fastify.get(
    "/api/agents/:id/provenance",
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      const user = await requireAuth(request, reply);
      if (!user) return;

      const agent = await findAgentById(request.params.id);
      if (!agent || agent.userId !== user.id) {
        return reply.code(404).send({ error: "Agent not found" });
      }

      const log: ProvenanceEntry[] = [
        {
          event: "agent_created",
          timestamp: agent.createdAt.toISOString(),
          detail: `Agent created via ${agent.sourceType}`,
        },
      ];

      return reply.send(log);
    }
  );

  /**
   * POST /api/agents/:id/attachments
   * Upload a file attachment for an owned agent (multipart, field=file).
   * Returns { url, filename, contentType }.
   */
  fastify.post(
    "/api/agents/:id/attachments",
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      const user = await requireAuth(request, reply);
      if (!user) return;

      const agent = await findAgentById(request.params.id);
      if (!agent || agent.userId !== user.id) {
        return reply.code(404).send({ error: "Agent not found" });
      }

      const data = await request.file();
      if (!data) {
        return reply.code(400).send({ error: "No file uploaded (field must be 'file')" });
      }

      const ext = path.extname(data.filename) || "";
      const uniqueName = `${agent.id}-${Date.now()}${ext}`;
      const dest = path.join(UPLOADS_DIR, uniqueName);

      await pipeline(data.file, fs.createWriteStream(dest));

      const baseUrl = process.env.PUBLIC_URL || "http://localhost:3001";
      return reply.code(201).send({
        url: `${baseUrl}/uploads/${uniqueName}`,
        filename: data.filename,
        contentType: data.mimetype,
      });
    }
  );
};
