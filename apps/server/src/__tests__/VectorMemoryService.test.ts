import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import { VectorMemoryService } from "../services/VectorMemoryService";
import type { Memory } from "@agentcolony/shared";

const sampleMemory: Memory = {
  id: "mem-123",
  agentId: "agent-456",
  kind: "social",
  description: "Had a wonderful conversation at the café",
  emotionalWeight: 0.5,
  createdAt: 1,
  tags: ["social", "café"],
};

afterEach(() => {
  delete process.env.PINECONE_API_KEY;
  delete process.env.PINECONE_INDEX_HOST;
  delete process.env.PINECONE_INDEX;
  delete process.env.PINECONE_ENV;
  delete process.env.OPENAI_API_KEY;
});

describe("VectorMemoryService", () => {
  test("isEnabled returns false when PINECONE_API_KEY not set", () => {
    delete process.env.PINECONE_API_KEY;
    const svc = new VectorMemoryService();
    assert.equal(svc.isEnabled, false);
  });

  test("upsert is a no-op when not enabled", async () => {
    delete process.env.PINECONE_API_KEY;
    const svc = new VectorMemoryService();

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (() => {
      throw new Error("fetch should not be called when not enabled");
    }) as typeof fetch;

    try {
      await svc.upsert(sampleMemory);
      // Should complete without throwing
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("upsert calls OpenAI embed then Pinecone upsert when enabled", async () => {
    process.env.PINECONE_API_KEY = "test-pinecone-key";
    process.env.PINECONE_INDEX_HOST = "https://my-index.svc.pinecone.io";
    process.env.OPENAI_API_KEY = "test-openai-key";

    const calledUrls: string[] = [];
    const originalFetch = globalThis.fetch;

    globalThis.fetch = ((url: string | URL | Request, _init?: RequestInit) => {
      const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
      calledUrls.push(urlStr);

      if (urlStr.includes("openai.com")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ data: [{ embedding: [0.1, 0.2, 0.3] }] }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }
      if (urlStr.includes("pinecone.io")) {
        return Promise.resolve(
          new Response(JSON.stringify({}), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        );
      }
      return Promise.resolve(new Response("not found", { status: 404 }));
    }) as typeof fetch;

    try {
      const svc = new VectorMemoryService();
      await svc.upsert(sampleMemory);

      assert.ok(
        calledUrls.some(u => u.includes("openai.com")),
        "Should have called OpenAI embeddings endpoint"
      );
      assert.ok(
        calledUrls.some(u => u.includes("pinecone.io/vectors/upsert")),
        "Should have called Pinecone upsert endpoint"
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("search returns empty array when not enabled", async () => {
    delete process.env.PINECONE_API_KEY;
    const svc = new VectorMemoryService();
    const results = await svc.search("agent-456", "conversation");
    assert.deepEqual(results, []);
  });

  test("search returns memory IDs from Pinecone response when enabled", async () => {
    process.env.PINECONE_API_KEY = "test-pinecone-key";
    process.env.PINECONE_INDEX_HOST = "https://my-index.svc.pinecone.io";
    process.env.OPENAI_API_KEY = "test-openai-key";

    const originalFetch = globalThis.fetch;

    globalThis.fetch = ((url: string | URL | Request, _init?: RequestInit) => {
      const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;

      if (urlStr.includes("openai.com")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ data: [{ embedding: [0.1, 0.2, 0.3] }] }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }
      if (urlStr.includes("pinecone.io/query")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              matches: [
                { id: "mem-001", score: 0.95 },
                { id: "mem-002", score: 0.87 },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }
      return Promise.resolve(new Response("not found", { status: 404 }));
    }) as typeof fetch;

    try {
      const svc = new VectorMemoryService();
      const results = await svc.search("agent-456", "conversation at the café");
      assert.deepEqual(results, ["mem-001", "mem-002"]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("search returns empty array on Pinecone error (fallback)", async () => {
    process.env.PINECONE_API_KEY = "test-pinecone-key";
    process.env.PINECONE_INDEX_HOST = "https://my-index.svc.pinecone.io";
    process.env.OPENAI_API_KEY = "test-openai-key";

    const originalFetch = globalThis.fetch;

    globalThis.fetch = ((url: string | URL | Request, _init?: RequestInit) => {
      const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;

      if (urlStr.includes("openai.com")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ data: [{ embedding: [0.1, 0.2, 0.3] }] }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }
      // Pinecone returns 500 error
      return Promise.resolve(new Response("Internal Server Error", { status: 500 }));
    }) as typeof fetch;

    try {
      const svc = new VectorMemoryService();
      const results = await svc.search("agent-456", "conversation");
      assert.deepEqual(results, []);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
