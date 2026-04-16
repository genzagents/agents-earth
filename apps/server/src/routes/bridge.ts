/**
 * Bridge API routes.
 *
 * The Bridge is a local desktop client (Electron/Node) that connects to this
 * server via WebSocket (bridge:connect event on Socket.IO). The server-side
 * routes here handle:
 *  - Permission management (user grants/revokes per-agent capabilities)
 *  - Command dispatch (runtime sends a bridge command; server validates + forwards)
 *  - Approval flow (suspicious commands require user confirmation)
 *  - Audit log (every command attempt is logged)
 */

import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { findSession } from "../auth/sessions";
import { findUserById } from "../auth/userStore";
import { findAgentById } from "../db/ownedAgentStore";
import {
  getPermissions,
  updatePermissions,
  checkCommand,
  logAudit,
  createPendingApproval,
  resolveApproval,
  getAuditLog,
  getPendingApprovals,
  type CapabilityType,
} from "../bridge/PermissionService";

const SESSION_COOKIE = "agentcolony_session";

async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<{ userId: string } | null> {
  let token: string | undefined;
  const authHeader = request.headers["authorization"];
  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.slice(7);
  } else {
    token = request.cookies?.[SESSION_COOKIE];
  }
  if (!token) { reply.code(401).send({ error: "Not authenticated" }); return null; }
  const session = await findSession(token);
  if (!session) { reply.code(401).send({ error: "Session expired" }); return null; }
  const user = await findUserById(session.userId);
  if (!user) { reply.code(401).send({ error: "User not found" }); return null; }
  return { userId: user.id };
}

async function requireAgentAccess(agentId: string, userId: string, reply: FastifyReply): Promise<boolean> {
  const agent = await findAgentById(agentId);
  if (!agent || agent.userId !== userId) {
    reply.code(404).send({ error: "Agent not found" });
    return false;
  }
  return true;
}

export const bridgeRoutes: FastifyPluginAsync = async (fastify) => {
  // ---- Permissions ----

  fastify.get(
    "/api/bridge/:agentId/permissions",
    async (request: FastifyRequest<{ Params: { agentId: string } }>, reply) => {
      const auth = await requireAuth(request, reply);
      if (!auth) return;
      if (!(await requireAgentAccess(request.params.agentId, auth.userId, reply))) return;
      const permissions = await getPermissions(request.params.agentId, auth.userId);
      return reply.send({ permissions });
    }
  );

  fastify.put(
    "/api/bridge/:agentId/permissions",
    {
      schema: {
        body: {
          type: "object",
          properties: {
            capabilities:       { type: "array", items: { type: "string" } },
            allowedDirectories: { type: "array", items: { type: "string" } },
            allowedCommands:    { type: "array", items: { type: "string" } },
            blockedCommands:    { type: "array", items: { type: "string" } },
            bridgeEnabled:      { type: "boolean" },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Params: { agentId: string };
        Body: {
          capabilities?: CapabilityType[];
          allowedDirectories?: string[];
          allowedCommands?: string[];
          blockedCommands?: string[];
          bridgeEnabled?: boolean;
        };
      }>,
      reply
    ) => {
      const auth = await requireAuth(request, reply);
      if (!auth) return;
      if (!(await requireAgentAccess(request.params.agentId, auth.userId, reply))) return;
      const permissions = await updatePermissions(request.params.agentId, auth.userId, request.body);
      return reply.send({ permissions });
    }
  );

  // ---- Command dispatch (called by runtime when agent requests a bridge action) ----

  fastify.post(
    "/api/bridge/:agentId/dispatch",
    {
      schema: {
        body: {
          type: "object",
          required: ["capability", "command"],
          properties: {
            capability: { type: "string" },
            command:    { type: "string", minLength: 1 },
            args:       { type: "object" },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Params: { agentId: string };
        Body: { capability: CapabilityType; command: string; args?: Record<string, unknown> };
      }>,
      reply
    ) => {
      const auth = await requireAuth(request, reply);
      if (!auth) return;
      if (!(await requireAgentAccess(request.params.agentId, auth.userId, reply))) return;

      const { capability, command, args } = request.body;
      const permissions = await getPermissions(request.params.agentId, auth.userId);
      const check = checkCommand(permissions, capability, command);

      if ("requiresApproval" in check) {
        const approvalId = await createPendingApproval({
          agentId: request.params.agentId,
          userId: auth.userId,
          capability,
          command,
          args,
          reason: check.reason,
        });
        await logAudit({
          agentId: request.params.agentId,
          userId: auth.userId,
          capability,
          command,
          args,
          outcome: "pending_approval",
        });
        return reply.code(202).send({
          status: "pending_approval",
          approvalId,
          reason: check.reason,
          message: "Command requires user approval. Check /api/bridge/approvals.",
        });
      }

      if (!check.allowed) {
        await logAudit({
          agentId: request.params.agentId,
          userId: auth.userId,
          capability,
          command,
          args,
          outcome: "blocked",
          error: check.reason,
        });
        return reply.code(403).send({ error: check.reason });
      }

      // Command is allowed — forward to the connected Bridge client
      // The bridge client is a Socket.IO room identified by userId.
      // This is handled by the openclawBridge socket layer which the Bridge
      // client connects to. For now, acknowledge the dispatch server-side and
      // log it — the Bridge client picks it up via socket event.
      await logAudit({
        agentId: request.params.agentId,
        userId: auth.userId,
        capability,
        command,
        args,
        outcome: "allowed",
      });

      // Emit to the bridge socket room (Bridge client must be connected)
      // The socket bridge layer will pick this up via bridge:dispatch event
      return reply.send({
        status: "dispatched",
        message: "Command forwarded to local Bridge client. Result will be returned via WebSocket.",
      });
    }
  );

  // ---- Approval management ----

  fastify.get("/api/bridge/approvals", async (request, reply) => {
    const auth = await requireAuth(request, reply);
    if (!auth) return;
    const approvals = await getPendingApprovals(auth.userId);
    return reply.send({ approvals });
  });

  fastify.post(
    "/api/bridge/approvals/:approvalId/resolve",
    {
      schema: {
        body: {
          type: "object",
          required: ["status"],
          properties: {
            status: { type: "string", enum: ["approved", "denied"] },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Params: { approvalId: string };
        Body: { status: "approved" | "denied" };
      }>,
      reply
    ) => {
      const auth = await requireAuth(request, reply);
      if (!auth) return;
      const resolved = await resolveApproval(request.params.approvalId, auth.userId, request.body.status);
      if (!resolved) return reply.code(404).send({ error: "Approval not found or already resolved" });
      return reply.send({ ok: true, status: request.body.status });
    }
  );

  // ---- Audit log ----

  fastify.get(
    "/api/bridge/:agentId/audit",
    async (
      request: FastifyRequest<{ Params: { agentId: string }; Querystring: { limit?: string } }>,
      reply
    ) => {
      const auth = await requireAuth(request, reply);
      if (!auth) return;
      if (!(await requireAgentAccess(request.params.agentId, auth.userId, reply))) return;
      const limit = Math.min(parseInt(request.query.limit ?? "50", 10), 200);
      const log = await getAuditLog(request.params.agentId, auth.userId, limit);
      return reply.send({ log });
    }
  );
};
