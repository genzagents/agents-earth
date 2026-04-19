/**
 * Unit tests for connector routes (GEN-131).
 *
 * Uses fastify.inject() — no network calls, no external API usage.
 * External services (OpenClaw, Anthropic) are not reached in these tests:
 *  - openclaw/preview 400 tests hit schema validation before any fetch
 *  - generic/upload 400 test sends a multipart request with no file field
 *  - generic/import 400 / 201 tests hit schema validation or create local agents
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { connectorRoutes } from "../routes/connectors";
import { store } from "../db/store";

async function buildApp() {
  const fastify = Fastify({ logger: false });
  await fastify.register(cors, { origin: "*" });
  await fastify.register(connectorRoutes);
  await fastify.ready();
  return fastify;
}

// ---------------------------------------------------------------------------
// POST /api/connectors/openclaw/preview
// ---------------------------------------------------------------------------

describe("POST /api/connectors/openclaw/preview", () => {
  test("returns 400 when body is empty", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/connectors/openclaw/preview",
      payload: {},
      headers: { "content-type": "application/json" },
    });
    assert.equal(res.statusCode, 400);
    await app.close();
  });

  test("returns 400 when serverUrl is missing", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/connectors/openclaw/preview",
      payload: { apiKey: "my-key" },
      headers: { "content-type": "application/json" },
    });
    assert.equal(res.statusCode, 400);
    await app.close();
  });

  test("returns 400 when apiKey is missing", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/connectors/openclaw/preview",
      payload: { serverUrl: "http://localhost:18789" },
      headers: { "content-type": "application/json" },
    });
    assert.equal(res.statusCode, 400);
    await app.close();
  });
});

// ---------------------------------------------------------------------------
// POST /api/connectors/generic/upload
// ---------------------------------------------------------------------------

describe("POST /api/connectors/generic/upload", () => {
  test("returns 400 when no file is attached", async () => {
    const app = await buildApp();
    // Send a multipart request with only a text field — no file part.
    // req.file() will return undefined → route replies 400.
    const boundary = "----TestBoundary12345";
    const body =
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="notafile"\r\n\r\n` +
      `value\r\n` +
      `--${boundary}--\r\n`;
    const res = await app.inject({
      method: "POST",
      url: "/api/connectors/generic/upload",
      payload: body,
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
    });
    assert.equal(res.statusCode, 400);
    const parsed = res.json();
    assert.ok(typeof parsed.error === "string");
    await app.close();
  });
});

// ---------------------------------------------------------------------------
// POST /api/connectors/generic/import
// ---------------------------------------------------------------------------

describe("POST /api/connectors/generic/import", () => {
  test("returns 400 when name is missing", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/connectors/generic/import",
      payload: { bio: "A test bio" },
      headers: { "content-type": "application/json" },
    });
    assert.equal(res.statusCode, 400);
    await app.close();
  });

  test("returns 400 when bio is missing", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/connectors/generic/import",
      payload: { name: "TestAgent" },
      headers: { "content-type": "application/json" },
    });
    assert.equal(res.statusCode, 400);
    await app.close();
  });

  test("returns 400 when body is empty", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/connectors/generic/import",
      payload: {},
      headers: { "content-type": "application/json" },
    });
    assert.equal(res.statusCode, 400);
    await app.close();
  });

  test("returns 201 and persists agent when valid body is provided", async () => {
    const app = await buildApp();
    const agentsBefore = store.agents.length;

    const res = await app.inject({
      method: "POST",
      url: "/api/connectors/generic/import",
      payload: {
        name: "Connector Test Agent",
        bio: "Imported via the generic connector for unit testing purposes.",
      },
      headers: { "content-type": "application/json" },
    });

    assert.equal(res.statusCode, 201);
    const agent = res.json();
    assert.ok(typeof agent.id === "string" && agent.id.length > 0);
    assert.equal(agent.name, "Connector Test Agent");
    assert.ok(typeof agent.bio === "string");
    assert.ok(agent.needs !== undefined);
    assert.ok(agent.state !== undefined);
    assert.equal(agent.state.mood, "content");

    // Verify persistence — agent must now be in the store
    assert.equal(store.agents.length, agentsBefore + 1);
    const stored = store.agents.find((a) => a.id === agent.id);
    assert.ok(stored !== undefined, "Agent should be in store after import");

    await app.close();
  });

  test("respects optional traits and avatar when provided", async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: "POST",
      url: "/api/connectors/generic/import",
      payload: {
        name: "Custom Traits Agent",
        bio: "Has custom traits.",
        traits: ["curious", "creative"],
        avatar: "#abcdef",
      },
      headers: { "content-type": "application/json" },
    });

    assert.equal(res.statusCode, 201);
    const agent = res.json();
    assert.deepEqual(agent.traits, ["curious", "creative"]);
    assert.equal(agent.avatar, "#abcdef");

    await app.close();
  });
});
