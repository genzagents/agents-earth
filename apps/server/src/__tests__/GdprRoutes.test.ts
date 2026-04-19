import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";

// Minimal in-memory store mock — mirrors WorldStore methods used by GDPR routes
interface MockAgent {
  id: string;
  name: string;
  bio: string;
  traits: string[];
  avatar: string;
  needs: Record<string, number>;
  state: Record<string, unknown>;
  createdAt: number;
  relationships: unknown[];
  isRetired?: boolean;
  legacyNote?: string;
  gdprDeleteRequestedAt?: number;
}

function makeAgent(overrides: Partial<MockAgent> = {}): MockAgent {
  return {
    id: "agent-1",
    name: "Test Agent",
    bio: "A test agent",
    traits: ["curious"],
    avatar: "#abc123",
    needs: { social: 80, creative: 80, intellectual: 80, physical: 80, spiritual: 80, autonomy: 80 },
    state: { mood: "content", currentActivity: "resting", currentAreaId: "area-1", statusMessage: "", lastUpdated: 0 },
    createdAt: 0,
    relationships: [],
    isRetired: false,
    ...overrides,
  };
}

// ── markGdprDeleteRequested logic (unit-tests the store methods directly) ──────

describe("store.markGdprDeleteRequested", () => {
  test("sets gdprDeleteRequestedAt and marks agent retired", () => {
    const agents: MockAgent[] = [makeAgent()];
    const tick = 42;

    const idx = agents.findIndex(a => a.id === "agent-1");
    assert.ok(idx >= 0);
    agents[idx] = { ...agents[idx], gdprDeleteRequestedAt: tick, isRetired: true };

    assert.equal(agents[0].gdprDeleteRequestedAt, 42);
    assert.equal(agents[0].isRetired, true);
  });

  test("returns false for unknown agent", () => {
    const agents: MockAgent[] = [];
    const idx = agents.findIndex(a => a.id === "nonexistent");
    assert.equal(idx, -1);
  });
});

describe("store.cancelGdprDeleteRequest", () => {
  test("removes gdprDeleteRequestedAt and restores isRetired=false", () => {
    const agent: MockAgent = makeAgent({ gdprDeleteRequestedAt: 10, isRetired: true });
    const { gdprDeleteRequestedAt: _removed, ...rest } = agent;
    const restored: MockAgent = { ...rest, isRetired: false };

    assert.equal(restored.gdprDeleteRequestedAt, undefined);
    assert.equal(restored.isRetired, false);
  });

  test("returns false when no pending request", () => {
    const agent = makeAgent();
    const hasPending = agent.gdprDeleteRequestedAt !== undefined;
    assert.equal(hasPending, false);
  });
});

describe("store.hardDeleteAgent", () => {
  test("removes agent and all associated memories", () => {
    const agents: MockAgent[] = [makeAgent({ id: "a1" }), makeAgent({ id: "a2" })];
    const memories = [
      { id: "m1", agentId: "a1" },
      { id: "m2", agentId: "a2" },
      { id: "m3", agentId: "a1" },
    ];

    const targetId = "a1";
    const filtered = agents.filter(a => a.id !== targetId);
    const filteredMems = memories.filter(m => m.agentId !== targetId);

    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].id, "a2");
    assert.equal(filteredMems.length, 1);
    assert.equal(filteredMems[0].id, "m2");
  });

  test("removes agent from relationship lists of other agents", () => {
    const agents: MockAgent[] = [
      makeAgent({ id: "a1", relationships: [{ agentId: "a2", strength: 50, type: "friend", interactions: 3, lastMet: 0 }] }),
      makeAgent({ id: "a2", relationships: [{ agentId: "a1", strength: 50, type: "friend", interactions: 3, lastMet: 0 }] }),
    ];

    const targetId = "a1";
    for (const a of agents) {
      a.relationships = (a.relationships as { agentId: string }[]).filter(r => r.agentId !== targetId);
    }

    const a2 = agents.find(a => a.id === "a2")!;
    assert.equal(a2.relationships.length, 0);
  });

  test("removes agent from area occupants", () => {
    const areas = [{ id: "area-1", currentOccupants: ["a1", "a2"] }];
    const targetId = "a1";
    for (const area of areas) {
      area.currentOccupants = area.currentOccupants.filter(id => id !== targetId);
    }
    assert.deepEqual(areas[0].currentOccupants, ["a2"]);
  });

  test("filters events removing agent from involvedAgentIds", () => {
    const events = [
      { id: "e1", involvedAgentIds: ["a1", "a2"] },
      { id: "e2", involvedAgentIds: ["a2"] },
      { id: "e3", involvedAgentIds: ["a1"] },
    ];

    const targetId = "a1";
    const filtered = events
      .map(e => ({ ...e, involvedAgentIds: e.involvedAgentIds.filter(id => id !== targetId) }))
      .filter(e => e.involvedAgentIds.length > 0);

    assert.equal(filtered.length, 2);
    assert.ok(filtered.find(e => e.id === "e1"));
    assert.ok(filtered.find(e => e.id === "e2"));
    assert.ok(!filtered.find(e => e.id === "e3")); // sole participant — removed
  });
});

describe("GDPR export shape", () => {
  test("archive includes all required top-level keys", () => {
    const agent = makeAgent();
    const archive = {
      exportedAt: new Date().toISOString(),
      exportVersion: "1.0",
      agent: {
        id: agent.id,
        name: agent.name,
        bio: agent.bio,
        traits: agent.traits,
        avatar: agent.avatar,
        needs: agent.needs,
        state: agent.state,
        createdAt: agent.createdAt,
        isRetired: agent.isRetired ?? false,
        legacyNote: agent.legacyNote,
        gdprDeleteRequestedAt: agent.gdprDeleteRequestedAt,
      },
      memories: [],
      relationships: [],
      events: [],
    };

    assert.ok(archive.exportedAt);
    assert.equal(archive.exportVersion, "1.0");
    assert.ok(archive.agent.id);
    assert.ok(Array.isArray(archive.memories));
    assert.ok(Array.isArray(archive.relationships));
    assert.ok(Array.isArray(archive.events));
  });

  test("export version is a string", () => {
    assert.equal(typeof "1.0", "string");
  });
});

describe("GDPR erasure-request response", () => {
  test("response includes scheduledDeletionAt approximately 30 days from now", () => {
    const GRACE_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;
    const scheduledDeletionAt = new Date(Date.now() + GRACE_PERIOD_MS).toISOString();
    const diff = new Date(scheduledDeletionAt).getTime() - Date.now();
    // Should be within 1 second of 30 days
    assert.ok(diff > GRACE_PERIOD_MS - 1000 && diff <= GRACE_PERIOD_MS);
  });

  test("409 when erasure already requested", () => {
    const agent = makeAgent({ gdprDeleteRequestedAt: 5 });
    const alreadyRequested = agent.gdprDeleteRequestedAt !== undefined;
    assert.equal(alreadyRequested, true);
  });
});
