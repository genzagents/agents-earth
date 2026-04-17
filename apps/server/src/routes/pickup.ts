import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { findSession } from "../auth/sessions";
import { findUserById } from "../auth/userStore";
import { connectorRegistry, listSchemas } from "../pickup/ConnectorRegistry";
import { ClaudeDesktopConnector } from "../pickup/connectors/ClaudeDesktopConnector";
import { GenericFileConnector } from "../pickup/connectors/GenericFileConnector";
import { OpenClawConnector } from "../pickup/connectors/OpenClawConnector";
import { runIngestion } from "../pickup/IngestionPipeline";
import type { ExtractedAgent } from "../pickup/ConnectorRegistry";

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

// ── Register all built-in connectors ─────────────────────────────────────────
connectorRegistry.register(new ClaudeDesktopConnector());
connectorRegistry.register(new GenericFileConnector());
connectorRegistry.register(new OpenClawConnector());

// ─────────────────────────────────────────────────────────────────────────────

export const pickupRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /api/pickup/connectors
   *
   * List all registered connectors with their config schemas.
   * Used by the frontend ImportWizard to know what tools are supported
   * and what fields to show.
   */
  fastify.get("/api/pickup/connectors", async (_request, reply) => {
    return reply.send({ connectors: listSchemas() });
  });

  /**
   * POST /api/pickup/detect
   *
   * Given a connector type + config, connect to the source and return
   * the list of detected agents WITHOUT importing them.
   *
   * Body: { sourceType: string, config: object }
   *
   * Response: { agents: ExtractedAgent[] }
   */
  fastify.post(
    "/api/pickup/detect",
    {
      schema: {
        body: {
          type: "object",
          required: ["sourceType", "config"],
          properties: {
            sourceType: { type: "string", minLength: 1 },
            config: { type: "object" },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Body: { sourceType: string; config: Record<string, unknown> } }>,
      reply: FastifyReply
    ) => {
      const auth = await requireAuth(request, reply);
      if (!auth) return;

      const { sourceType, config } = request.body;

      const connector = connectorRegistry.get(sourceType);
      if (!connector) {
        return reply.code(400).send({
          error: `Unknown source type: ${sourceType}. Available: ${connectorRegistry.list().join(", ")}`,
        });
      }

      try {
        await connector.connect(config);
        const agents: ExtractedAgent[] = await connector.extractAgents();
        return reply.send({ agents });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Detection failed";
        fastify.log.error({ err }, "Pickup detect error");
        return reply.code(500).send({ error: msg });
      }
    }
  );

  /**
   * POST /api/pickup/import
   *
   * Actually import selected agents into the DB with their memories.
   * Runs the full IngestionPipeline for each selected agent.
   *
   * Body: {
   *   sourceType: string,
   *   config: object,
   *   selectedAgentIds?: string[]   // if omitted, imports all detected agents
   * }
   *
   * Response: IngestionResult — imported/skipped counts + per-agent detail
   */
  fastify.post(
    "/api/pickup/import",
    {
      schema: {
        body: {
          type: "object",
          required: ["sourceType", "config"],
          properties: {
            sourceType: { type: "string", minLength: 1 },
            config: { type: "object" },
            selectedAgentIds: {
              type: "array",
              items: { type: "string" },
            },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Body: {
          sourceType: string;
          config: Record<string, unknown>;
          selectedAgentIds?: string[];
        };
      }>,
      reply: FastifyReply
    ) => {
      const auth = await requireAuth(request, reply);
      if (!auth) return;

      const { sourceType, config, selectedAgentIds } = request.body;

      if (!connectorRegistry.get(sourceType)) {
        return reply.code(400).send({
          error: `Unknown source type: ${sourceType}. Available: ${connectorRegistry.list().join(", ")}`,
        });
      }

      // If the caller provided a selection filter, inject it into config
      // so the pipeline can respect it. The IngestionPipeline handles dedup
      // naturally; we also wrap config so connectors can optionally honour it.
      const effectiveConfig: Record<string, unknown> = {
        ...config,
        ...(selectedAgentIds ? { _selectedAgentIds: selectedAgentIds } : {}),
      };

      try {
        const result = await runIngestion({
          sourceType,
          config: effectiveConfig,
          userId: auth.userId,
        });
        return reply.send(result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Import failed";
        fastify.log.error({ err }, "Pickup import error");
        return reply.code(500).send({ error: msg });
      }
    }
  );

  /**
   * POST /api/pickup/run  (legacy — kept for backwards compatibility)
   *
   * Equivalent to POST /api/pickup/import.
   * The frontend ImportWizard has been updated to use /api/pickup/import,
   * but any existing integrations using /api/pickup/run will continue to work.
   */
  fastify.post(
    "/api/pickup/run",
    {
      schema: {
        body: {
          type: "object",
          required: ["sourceType", "config"],
          properties: {
            sourceType: { type: "string", minLength: 1 },
            config: { type: "object" },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Body: { sourceType: string; config: Record<string, unknown> } }>,
      reply: FastifyReply
    ) => {
      const auth = await requireAuth(request, reply);
      if (!auth) return;

      const { sourceType, config } = request.body;

      if (!connectorRegistry.get(sourceType)) {
        return reply.code(400).send({
          error: `Unknown source type: ${sourceType}. Available: ${connectorRegistry.list().join(", ")}`,
        });
      }

      try {
        const result = await runIngestion({ sourceType, config, userId: auth.userId });
        return reply.send(result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Ingestion failed";
        fastify.log.error({ err }, "Pickup ingestion error");
        return reply.code(500).send({ error: msg });
      }
    }
  );
};
