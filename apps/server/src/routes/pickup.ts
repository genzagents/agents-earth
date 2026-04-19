import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { findSession } from "../auth/sessions";
import { findUserById } from "../auth/userStore";
import { connectorRegistry } from "../pickup/ConnectorRegistry";
import { ClaudeDesktopConnector } from "../pickup/connectors/ClaudeDesktopConnector";
import { OpenClawConnector } from "../pickup/connectors/OpenClawConnector";
import { ChatGPTConnector } from "../pickup/connectors/ChatGPTConnector";
import { GitHubCopilotConnector } from "../pickup/connectors/GitHubCopilotConnector";
import { CursorConnector } from "../pickup/connectors/CursorConnector";
import { MoltbookConnector } from "../pickup/connectors/MoltbookConnector";
import { GenericConnector } from "../pickup/connectors/GenericConnector";
import { runIngestion } from "../pickup/IngestionPipeline";

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

// Register built-in connectors
connectorRegistry.register(new ClaudeDesktopConnector());
connectorRegistry.register(new OpenClawConnector());
connectorRegistry.register(new ChatGPTConnector());
connectorRegistry.register(new GitHubCopilotConnector());
connectorRegistry.register(new CursorConnector());
connectorRegistry.register(new MoltbookConnector());
connectorRegistry.register(new GenericConnector());

export const pickupRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /api/pickup/connectors
   * List all registered connector source types.
   */
  fastify.get("/api/pickup/connectors", async (_request, reply) => {
    return reply.send({ connectors: connectorRegistry.list() });
  });

  /**
   * POST /api/pickup/run
   * Run the ingestion pipeline for a given source type.
   *
   * Body: {
   *   sourceType: string,       // e.g. "claude_desktop"
   *   config: {                 // connector-specific config
   *     data: object            // for claude_desktop: the parsed JSON export
   *   }
   * }
   *
   * Response: IngestionResult — imported/skipped counts + per-agent detail
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
