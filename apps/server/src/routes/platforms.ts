import { v4 as uuidv4 } from "uuid";
import type { FastifyInstance } from "fastify";
import { store } from "../db/store";
import type { Platform } from "../db/store";

const VALID_PLATFORM_NAMES = ["openclaw", "nemoclaw", "openfang", "moltbook"] as const;
type PlatformName = (typeof VALID_PLATFORM_NAMES)[number];

interface RegisterPlatformBody {
  name: PlatformName;
  displayName?: string;
  webhookSecret: string;
}

export async function platformRoutes(fastify: FastifyInstance) {
  fastify.post<{ Body: RegisterPlatformBody }>(
    "/api/platforms/register",
    {
      schema: {
        body: {
          type: "object",
          required: ["name", "webhookSecret"],
          properties: {
            name: { type: "string", enum: VALID_PLATFORM_NAMES },
            displayName: { type: "string" },
            webhookSecret: { type: "string", minLength: 16 },
          },
        },
      },
    },
    async (req, reply) => {
      const { name, displayName, webhookSecret } = req.body;

      const existing = store.getPlatformByName(name);
      if (existing) {
        return reply.code(409).send({
          error: "Platform already registered",
          platformId: existing.id,
        });
      }

      const platform: Platform = {
        id: uuidv4(),
        name,
        displayName: displayName ?? name,
        webhookSecret,
        agentIds: [],
        registeredAt: store.tick,
      };

      store.addPlatform(platform);
      fastify.log.info({ platformId: platform.id, name }, "Platform registered");

      return reply.code(201).send({
        id: platform.id,
        name: platform.name,
        displayName: platform.displayName,
      });
    }
  );

  fastify.get("/api/platforms", async () => {
    return store.platforms.map((p) => ({
      id: p.id,
      name: p.name,
      displayName: p.displayName,
      agentCount: p.agentIds.length,
      registeredAt: p.registeredAt,
    }));
  });

  fastify.get<{ Params: { id: string } }>(
    "/api/platforms/:id/agents",
    async (req, reply) => {
      const platform = store.getPlatform(req.params.id);
      if (!platform) return reply.code(404).send({ error: "Platform not found" });

      const agents = platform.agentIds
        .map((id) => store.getAgent(id))
        .filter((a): a is NonNullable<typeof a> => a != null)
        .map((a) => ({
          id: a.id,
          name: a.name,
          avatar: a.avatar,
          mood: a.state.mood,
          currentActivity: a.state.currentActivity,
          statusMessage: a.state.statusMessage,
          currentAreaId: a.state.currentAreaId,
          isRetired: a.isRetired ?? false,
        }));

      return agents;
    }
  );
}
