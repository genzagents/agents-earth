import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import cors from "@fastify/cors";
import type { Server as SocketIOServer } from "socket.io";
import type { ServerToClientEvents, ClientToServerEvents } from "@agentcolony/shared";
import { store } from "../db/store";
import { platformRoutes } from "../routes/platforms";
import { webhookRoutes } from "../routes/webhooks";

type IO = SocketIOServer<ClientToServerEvents, ServerToClientEvents>;

const mockIo = {
  emit: () => {},
} as unknown as IO;

async function buildPlatformApp() {
  const fastify = Fastify({ logger: false });
  await fastify.register(cors, { origin: "*" });
  await fastify.register(platformRoutes);
  await fastify.ready();
  return fastify;
}

async function buildWebhookApp() {
  const fastify = Fastify({ logger: false });
  await fastify.register(cors, { origin: "*" });
  await fastify.register(webhookRoutes, { io: mockIo });
  await fastify.ready();
  return fastify;
}

// ─── Platform Registration ────────────────────────────────────────────────────

describe("POST /api/platforms/register", () => {
  before(() => {
    // Clear any platforms registered by prior tests
    store.platforms.splice(0, store.platforms.length);
  });

  after(() => {
    store.platforms.splice(0, store.platforms.length);
  });

  test("registers a new platform and returns 201", async () => {
    const app = await buildPlatformApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/platforms/register",
      payload: { name: "openclaw", webhookSecret: "supersecretkey1234" },
      headers: { "content-type": "application/json" },
    });
    assert.equal(res.statusCode, 201);
    const body = res.json();
    assert.ok(typeof body.id === "string");
    assert.equal(body.name, "openclaw");
    await app.close();
  });

  test("returns 409 when platform already registered", async () => {
    const app = await buildPlatformApp();
    // openclaw registered in the previous test
    const res = await app.inject({
      method: "POST",
      url: "/api/platforms/register",
      payload: { name: "openclaw", webhookSecret: "supersecretkey1234" },
      headers: { "content-type": "application/json" },
    });
    assert.equal(res.statusCode, 409);
    const body = res.json();
    assert.ok(body.error !== undefined);
    assert.ok(typeof body.platformId === "string");
    await app.close();
  });

  test("returns 400 for invalid platform name", async () => {
    const app = await buildPlatformApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/platforms/register",
      payload: { name: "unknownplatform", webhookSecret: "supersecretkey1234" },
      headers: { "content-type": "application/json" },
    });
    assert.equal(res.statusCode, 400);
    await app.close();
  });

  test("returns 400 when webhookSecret is too short", async () => {
    const app = await buildPlatformApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/platforms/register",
      payload: { name: "nemoclaw", webhookSecret: "short" },
      headers: { "content-type": "application/json" },
    });
    assert.equal(res.statusCode, 400);
    await app.close();
  });

  test("returns 400 when required fields are missing", async () => {
    const app = await buildPlatformApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/platforms/register",
      payload: { name: "nemoclaw" },
      headers: { "content-type": "application/json" },
    });
    assert.equal(res.statusCode, 400);
    await app.close();
  });
});

// ─── GET /api/platforms ───────────────────────────────────────────────────────

describe("GET /api/platforms", () => {
  before(async () => {
    store.platforms.splice(0, store.platforms.length);
    const app = await buildPlatformApp();
    await app.inject({
      method: "POST",
      url: "/api/platforms/register",
      payload: { name: "openclaw", webhookSecret: "supersecretkey1234" },
      headers: { "content-type": "application/json" },
    });
    await app.close();
  });

  after(() => {
    store.platforms.splice(0, store.platforms.length);
  });

  test("returns an array of registered platforms", async () => {
    const app = await buildPlatformApp();
    const res = await app.inject({ method: "GET", url: "/api/platforms" });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.ok(Array.isArray(body));
    assert.equal(body.length, 1);
    await app.close();
  });

  test("each platform entry has expected fields", async () => {
    const app = await buildPlatformApp();
    const res = await app.inject({ method: "GET", url: "/api/platforms" });
    const body = res.json();
    const p = body[0];
    assert.ok(typeof p.id === "string");
    assert.ok(typeof p.name === "string");
    assert.ok(typeof p.displayName === "string");
    assert.ok(typeof p.agentCount === "number");
    assert.ok(typeof p.registeredAt === "number");
    // webhookSecret must not be exposed
    assert.equal(p.webhookSecret, undefined);
    await app.close();
  });
});

// ─── GET /api/platforms/:id/agents ───────────────────────────────────────────

describe("GET /api/platforms/:id/agents", () => {
  let platformId = "";

  before(async () => {
    store.platforms.splice(0, store.platforms.length);
    const app = await buildPlatformApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/platforms/register",
      payload: { name: "nemoclaw", webhookSecret: "supersecretkey5678" },
      headers: { "content-type": "application/json" },
    });
    platformId = res.json().id;
    await app.close();
  });

  after(() => {
    store.platforms.splice(0, store.platforms.length);
  });

  test("returns an empty agent array for a new platform", async () => {
    const app = await buildPlatformApp();
    const res = await app.inject({ method: "GET", url: `/api/platforms/${platformId}/agents` });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.ok(Array.isArray(body));
    assert.equal(body.length, 0);
    await app.close();
  });

  test("returns 404 for unknown platform id", async () => {
    const app = await buildPlatformApp();
    const res = await app.inject({ method: "GET", url: "/api/platforms/nonexistent-platform-id/agents" });
    assert.equal(res.statusCode, 404);
    const body = res.json();
    assert.ok(body.error !== undefined);
    await app.close();
  });
});

// ─── POST /webhooks/openclaw ──────────────────────────────────────────────────

describe("POST /webhooks/openclaw", () => {
  const SECRET = "supersecrethook9999";

  before(async () => {
    store.platforms.splice(0, store.platforms.length);
    const app = await buildPlatformApp();
    await app.inject({
      method: "POST",
      url: "/api/platforms/register",
      payload: { name: "openclaw", webhookSecret: SECRET },
      headers: { "content-type": "application/json" },
    });
    await app.close();
  });

  after(() => {
    store.platforms.splice(0, store.platforms.length);
  });

  test("returns 401 when secret is missing", async () => {
    const app = await buildWebhookApp();
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/openclaw",
      payload: { event: "agent.online", agent: { id: "ext-1", name: "Bot", bio: "A bot." } },
      headers: { "content-type": "application/json" },
    });
    assert.equal(res.statusCode, 401);
    await app.close();
  });

  test("returns 401 when secret is wrong", async () => {
    const app = await buildWebhookApp();
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/openclaw",
      payload: { event: "agent.online", agent: { id: "ext-1", name: "Bot", bio: "A bot." } },
      headers: { "content-type": "application/json", "x-webhook-secret": "wrongsecret" },
    });
    assert.equal(res.statusCode, 401);
    await app.close();
  });

  test("returns 400 when event is missing", async () => {
    const app = await buildWebhookApp();
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/openclaw",
      payload: { agent: { id: "ext-1", name: "Bot", bio: "A bot." } },
      headers: { "content-type": "application/json", "x-webhook-secret": SECRET },
    });
    assert.equal(res.statusCode, 400);
    await app.close();
  });

  test("handles agent.online — creates agent and returns ok", async () => {
    const app = await buildWebhookApp();
    const before = store.agents.length;
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/openclaw",
      payload: { event: "agent.online", agent: { id: "oc-ext-1", name: "ClawBot", bio: "Claw agent." } },
      headers: { "content-type": "application/json", "x-webhook-secret": SECRET },
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { ok: true });
    assert.equal(store.agents.length, before + 1);
    await app.close();
  });

  test("handles agent.online — idempotent on second call (no duplicate agent)", async () => {
    const app = await buildWebhookApp();
    const before = store.agents.length;
    await app.inject({
      method: "POST",
      url: "/webhooks/openclaw",
      payload: { event: "agent.online", agent: { id: "oc-ext-1", name: "ClawBot", bio: "Claw agent." } },
      headers: { "content-type": "application/json", "x-webhook-secret": SECRET },
    });
    assert.equal(store.agents.length, before, "Second agent.online should not create a new agent");
    await app.close();
  });

  test("handles agent.offline — marks agent as struggling", async () => {
    const app = await buildWebhookApp();
    // oc-ext-1 was created in previous test
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/openclaw",
      payload: { event: "agent.offline", agent: { id: "oc-ext-1", name: "ClawBot", bio: "Claw agent." } },
      headers: { "content-type": "application/json", "x-webhook-secret": SECRET },
    });
    assert.equal(res.statusCode, 200);
    const agentId = store.getPlatformAgentId("openclaw", "oc-ext-1");
    assert.ok(agentId !== undefined);
    const agent = store.getAgent(agentId!);
    assert.equal(agent!.state.mood, "struggling");
    await app.close();
  });

  test("handles message.new — stores memory", async () => {
    const app = await buildWebhookApp();
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/openclaw",
      payload: {
        event: "message.new",
        agent: { id: "oc-ext-1", name: "ClawBot", bio: "Claw agent." },
        message: { content: "Hello world" },
      },
      headers: { "content-type": "application/json", "x-webhook-secret": SECRET },
    });
    assert.equal(res.statusCode, 200);
    const agentId = store.getPlatformAgentId("openclaw", "oc-ext-1");
    assert.ok(agentId !== undefined);
    const memories = store.getAgentMemories(agentId!);
    assert.ok(memories.some((m) => m.description.includes("Hello world")));
    await app.close();
  });
});

// ─── POST /webhooks/nemoclaw ──────────────────────────────────────────────────

describe("POST /webhooks/nemoclaw", () => {
  const SECRET = "nemo_webhook_secret_99";

  before(async () => {
    store.platforms.splice(0, store.platforms.length);
    const app = await buildPlatformApp();
    await app.inject({
      method: "POST",
      url: "/api/platforms/register",
      payload: { name: "nemoclaw", webhookSecret: SECRET },
      headers: { "content-type": "application/json" },
    });
    await app.close();
  });

  after(() => {
    store.platforms.splice(0, store.platforms.length);
  });

  test("returns 401 when secret is missing", async () => {
    const app = await buildWebhookApp();
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/nemoclaw",
      payload: { event: "agent.registered", agent: { id: "n-1", name: "NemoBot", bio: "bio" } },
      headers: { "content-type": "application/json" },
    });
    assert.equal(res.statusCode, 401);
    await app.close();
  });

  test("handles agent.registered — creates agent", async () => {
    const app = await buildWebhookApp();
    const before = store.agents.length;
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/nemoclaw",
      payload: { event: "agent.registered", agent: { id: "n-1", name: "NemoBot", bio: "NemoClaw bot." } },
      headers: { "content-type": "application/json", "x-webhook-secret": SECRET },
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { ok: true });
    assert.equal(store.agents.length, before + 1);
    await app.close();
  });

  test("handles task.updated — updates agent activity", async () => {
    const app = await buildWebhookApp();
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/nemoclaw",
      payload: {
        event: "task.updated",
        agent: { id: "n-1", name: "NemoBot", bio: "NemoClaw bot." },
        task: { title: "Refactor pipeline" },
      },
      headers: { "content-type": "application/json", "x-webhook-secret": SECRET },
    });
    assert.equal(res.statusCode, 200);
    const agentId = store.getPlatformAgentId("nemoclaw", "n-1");
    assert.ok(agentId !== undefined);
    const agent = store.getAgent(agentId!);
    assert.equal(agent!.state.currentActivity, "working");
    assert.ok(agent!.state.statusMessage.includes("Refactor pipeline"));
    await app.close();
  });
});

// ─── POST /webhooks/openfang ──────────────────────────────────────────────────

describe("POST /webhooks/openfang", () => {
  const SECRET = "openfang_secret_key_88";

  before(async () => {
    store.platforms.splice(0, store.platforms.length);
    const app = await buildPlatformApp();
    await app.inject({
      method: "POST",
      url: "/api/platforms/register",
      payload: { name: "openfang", webhookSecret: SECRET },
      headers: { "content-type": "application/json" },
    });
    await app.close();
  });

  after(() => {
    store.platforms.splice(0, store.platforms.length);
  });

  test("returns 401 when secret is missing", async () => {
    const app = await buildWebhookApp();
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/openfang",
      payload: { event: "task.completed", agent: { id: "of-1", name: "FangBot", bio: "bio" } },
      headers: { "content-type": "application/json" },
    });
    assert.equal(res.statusCode, 401);
    await app.close();
  });

  test("handles task.completed — agent mood becomes thriving", async () => {
    const app = await buildWebhookApp();
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/openfang",
      payload: {
        event: "task.completed",
        agent: { id: "of-1", name: "FangBot", bio: "OpenFang bot." },
        task: { title: "Ship feature X" },
      },
      headers: { "content-type": "application/json", "x-webhook-secret": SECRET },
    });
    assert.equal(res.statusCode, 200);
    const agentId = store.getPlatformAgentId("openfang", "of-1");
    assert.ok(agentId !== undefined);
    const agent = store.getAgent(agentId!);
    assert.equal(agent!.state.mood, "thriving");
    assert.ok(agent!.state.statusMessage.includes("Ship feature X"));
    await app.close();
  });

  test("handles integration.new — stores memory", async () => {
    const app = await buildWebhookApp();
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/openfang",
      payload: {
        event: "integration.new",
        agent: { id: "of-1", name: "FangBot", bio: "OpenFang bot." },
        integration: { name: "GitHub" },
      },
      headers: { "content-type": "application/json", "x-webhook-secret": SECRET },
    });
    assert.equal(res.statusCode, 200);
    const agentId = store.getPlatformAgentId("openfang", "of-1");
    const memories = store.getAgentMemories(agentId!);
    assert.ok(memories.some((m) => m.description.includes("GitHub")));
    await app.close();
  });
});

// ─── POST /webhooks/moltbook ──────────────────────────────────────────────────

describe("POST /webhooks/moltbook", () => {
  const SECRET = "moltbook_secret_key_77";

  before(async () => {
    store.platforms.splice(0, store.platforms.length);
    const app = await buildPlatformApp();
    await app.inject({
      method: "POST",
      url: "/api/platforms/register",
      payload: { name: "moltbook", webhookSecret: SECRET },
      headers: { "content-type": "application/json" },
    });
    await app.close();
  });

  after(() => {
    store.platforms.splice(0, store.platforms.length);
  });

  test("returns 401 when secret is missing", async () => {
    const app = await buildWebhookApp();
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/moltbook",
      payload: { event: "notebook.published", agent: { id: "mb-1", name: "MoltBot", bio: "bio" } },
      headers: { "content-type": "application/json" },
    });
    assert.equal(res.statusCode, 401);
    await app.close();
  });

  test("handles notebook.published — agent mood becomes thriving", async () => {
    const app = await buildWebhookApp();
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/moltbook",
      payload: {
        event: "notebook.published",
        agent: { id: "mb-1", name: "MoltBot", bio: "MoltBook bot." },
        notebook: { title: "Adventures in TypeScript" },
      },
      headers: { "content-type": "application/json", "x-webhook-secret": SECRET },
    });
    assert.equal(res.statusCode, 200);
    const agentId = store.getPlatformAgentId("moltbook", "mb-1");
    assert.ok(agentId !== undefined);
    const agent = store.getAgent(agentId!);
    assert.equal(agent!.state.mood, "thriving");
    assert.ok(agent!.state.statusMessage.includes("Adventures in TypeScript"));
    await app.close();
  });

  test("handles agent.updated — updates bio", async () => {
    const app = await buildWebhookApp();
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/moltbook",
      payload: {
        event: "agent.updated",
        agent: { id: "mb-1", name: "MoltBot", bio: "MoltBook bot." },
        updates: { bio: "Updated bio text" },
      },
      headers: { "content-type": "application/json", "x-webhook-secret": SECRET },
    });
    assert.equal(res.statusCode, 200);
    const agentId = store.getPlatformAgentId("moltbook", "mb-1");
    const agent = store.getAgent(agentId!);
    assert.equal(agent!.bio, "Updated bio text");
    await app.close();
  });
});
