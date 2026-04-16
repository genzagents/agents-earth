import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { store } from "../db/store";
import { worldRoutes } from "../routes/world";
import type { WorldState } from "@agentcolony/shared";
import type { WorldTickEngine } from "../simulation/WorldTick";

// Minimal engine mock — only getSnapshot() is needed by routes
function makeMockEngine(): WorldTickEngine {
  return {
    getSnapshot(): WorldState {
      return {
        tick: store.tick,
        simTime: "Day 1, 00:00",
        areas: store.areas,
        agents: store.agents,
        recentEvents: [],
        cities: [],
      };
    },
    onTick() {},
    start() {},
    stop() {},
  } as unknown as WorldTickEngine;
}

async function buildApp() {
  const fastify = Fastify({ logger: false });
  await fastify.register(cors, { origin: "*" });
  await fastify.register(worldRoutes, { engine: makeMockEngine() });
  await fastify.ready();
  return fastify;
}

describe("GET /api/world", () => {
  test("returns a WorldState object", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/api/world" });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.ok(typeof body.tick === "number");
    assert.ok(typeof body.simTime === "string");
    assert.ok(Array.isArray(body.areas));
    assert.ok(Array.isArray(body.agents));
    assert.ok(Array.isArray(body.recentEvents));
    await app.close();
  });

  test("agents in snapshot have required fields", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/api/world" });
    const body = res.json() as WorldState;
    assert.ok(body.agents.length > 0, "World should have at least one agent");
    const agent = body.agents[0];
    assert.ok(typeof agent.id === "string");
    assert.ok(typeof agent.name === "string");
    assert.ok(agent.needs !== undefined);
    assert.ok(agent.state !== undefined);
    await app.close();
  });
});

describe("GET /api/agents", () => {
  test("returns an array of agent summaries", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/api/agents" });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.ok(Array.isArray(body));
    assert.ok(body.length > 0, "Should have at least one agent");
    await app.close();
  });

  test("each agent summary has expected fields", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/api/agents" });
    const body = res.json();
    const summary = body[0];
    assert.ok(typeof summary.id === "string");
    assert.ok(typeof summary.name === "string");
    assert.ok(typeof summary.mood === "string");
    assert.ok(typeof summary.currentActivity === "string");
    assert.ok(typeof summary.statusMessage === "string");
    assert.ok(typeof summary.isRetired === "boolean");
    await app.close();
  });
});

describe("GET /api/agents/:id", () => {
  test("returns full agent for valid id", async () => {
    const app = await buildApp();
    const agentId = store.agents[0].id;
    const res = await app.inject({ method: "GET", url: `/api/agents/${agentId}` });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.id, agentId);
    assert.ok(typeof body.name === "string");
    assert.ok(body.needs !== undefined);
    assert.ok(body.state !== undefined);
    assert.ok(Array.isArray(body.relationships));
    await app.close();
  });

  test("returns 404 for unknown agent id", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/api/agents/nonexistent-id-00000" });
    assert.equal(res.statusCode, 404);
    const body = res.json();
    assert.ok(body.error !== undefined);
    await app.close();
  });
});

describe("GET /api/agents/:id/memories", () => {
  test("returns memory array for valid agent", async () => {
    const app = await buildApp();
    const agentId = store.agents[0].id;
    const res = await app.inject({ method: "GET", url: `/api/agents/${agentId}/memories` });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.ok(Array.isArray(body));
    await app.close();
  });

  test("returns 404 for unknown agent id", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/api/agents/nonexistent-id-00000/memories" });
    assert.equal(res.statusCode, 404);
    await app.close();
  });
});

describe("GET /api/agents/:id/relationships", () => {
  test("returns relationship array for valid agent", async () => {
    const app = await buildApp();
    const agentId = store.agents[0].id;
    const res = await app.inject({ method: "GET", url: `/api/agents/${agentId}/relationships` });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.ok(Array.isArray(body));
    await app.close();
  });

  test("returns 404 for unknown agent id", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/api/agents/nonexistent-id-00000/relationships" });
    assert.equal(res.statusCode, 404);
    await app.close();
  });
});

describe("POST /api/agents", () => {
  test("creates a new agent with valid body", async () => {
    const app = await buildApp();
    const body = {
      name: "Test Agent",
      bio: "A test agent for unit testing.",
      avatar: "#ff0000",
      traits: ["curious"],
    };
    const res = await app.inject({
      method: "POST",
      url: "/api/agents",
      payload: body,
      headers: { "content-type": "application/json" },
    });
    assert.equal(res.statusCode, 201);
    const created = res.json();
    assert.equal(created.name, "Test Agent");
    assert.ok(typeof created.id === "string" && created.id.length > 0);
    assert.ok(created.needs !== undefined);
    assert.equal(created.state.mood, "content");
    await app.close();
  });

  test("returns 400 for invalid startingAreaId", async () => {
    const app = await buildApp();
    const body = {
      name: "Test Agent",
      bio: "bio",
      avatar: "#ff0000",
      traits: ["curious"],
      startingAreaId: "nonexistent-area-id",
    };
    const res = await app.inject({
      method: "POST",
      url: "/api/agents",
      payload: body,
      headers: { "content-type": "application/json" },
    });
    assert.equal(res.statusCode, 400);
    await app.close();
  });

  test("returns 400 when required fields are missing", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/agents",
      payload: { name: "No bio or avatar" },
      headers: { "content-type": "application/json" },
    });
    assert.equal(res.statusCode, 400);
    await app.close();
  });
});
