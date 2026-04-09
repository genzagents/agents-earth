import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { processSocialInteractions } from "../simulation/SocialEngine";
import type { Agent, AgentNeeds, AgentState } from "@agentcolony/shared";

function makeAgent(id: string, areaId: string): Agent {
  const needs: AgentNeeds = { social: 60, creative: 60, intellectual: 60, physical: 60, spiritual: 60, autonomy: 60 };
  const state: AgentState = {
    mood: "content",
    currentActivity: "socializing",
    currentAreaId: areaId,
    statusMessage: "hanging out",
    lastUpdated: 0,
  };
  return {
    id,
    name: `Agent ${id}`,
    avatar: "#000000",
    bio: "A test agent",
    traits: ["curious"],
    needs,
    state,
    relationships: [],
    createdAt: 0,
  };
}

const areaMap = {
  "area-1": { name: "Test Cafe", type: "cafe" },
  "area-2": { name: "Test Park", type: "park" },
};

describe("processSocialInteractions", () => {
  test("returns empty results for empty input", () => {
    const result = processSocialInteractions([], 1, areaMap);
    assert.equal(result.events.length, 0);
    assert.equal(result.memories.length, 0);
    assert.equal(Object.keys(result.needsBoosts).length, 0);
    assert.equal(result.relationshipDeltas.length, 0);
  });

  test("returns empty results for groups with fewer than 2 agents", () => {
    const singleGroup = [[makeAgent("a1", "area-1")]];
    const result = processSocialInteractions(singleGroup, 1, areaMap);
    assert.equal(result.events.length, 0);
    assert.equal(result.memories.length, 0);
  });

  test("can produce events/memories for a pair of agents", () => {
    const agentA = makeAgent("a1", "area-1");
    const agentB = makeAgent("a2", "area-1");
    const groups = [[agentA, agentB]];

    // Run many times since there's a 70% skip chance per pair
    let totalEvents = 0;
    for (let i = 0; i < 50; i++) {
      const result = processSocialInteractions(groups, i + 1, areaMap);
      totalEvents += result.events.length;
    }

    // With 50 runs and 30% trigger rate, we expect at least some events
    assert.ok(totalEvents > 0, "Expected some social events across 50 runs");
  });

  test("relationship deltas are bidirectional when interaction occurs", () => {
    // Force many runs to get at least one interaction
    for (let attempt = 0; attempt < 100; attempt++) {
      const agentA = makeAgent("a1", "area-1");
      const agentB = makeAgent("a2", "area-1");
      const result = processSocialInteractions([[agentA, agentB]], 1, areaMap);

      if (result.relationshipDeltas.length > 0) {
        // Should have exactly 2 deltas (both directions)
        assert.equal(result.relationshipDeltas.length, 2);
        const delta1 = result.relationshipDeltas.find(d => d.agentId === "a1" && d.targetAgentId === "a2");
        const delta2 = result.relationshipDeltas.find(d => d.agentId === "a2" && d.targetAgentId === "a1");
        assert.ok(delta1, "Should have a→b delta");
        assert.ok(delta2, "Should have b→a delta");
        assert.ok(delta1!.interactionsDelta > 0);
        assert.ok(delta1!.strengthDelta > 0);
        return; // Test passed
      }
    }
    // If we get here, 100 runs produced 0 interactions — extremely unlikely but acceptable
    // (30% chance means probability of 0 in 100 is (0.7)^100 ≈ 3.2e-16)
    assert.fail("Expected at least one interaction in 100 attempts");
  });

  test("skips retired agents", () => {
    const agentA = makeAgent("a1", "area-1");
    const agentB = { ...makeAgent("a2", "area-1"), isRetired: true };
    const agentC = makeAgent("a3", "area-1");

    let totalEvents = 0;
    for (let i = 0; i < 100; i++) {
      const result = processSocialInteractions([[agentA, agentB, agentC]], i + 1, areaMap);
      totalEvents += result.events.length;
      // Retired agent should never appear in events
      for (const evt of result.events) {
        assert.ok(!evt.involvedAgentIds.includes("a2"), "Retired agent should not participate in events");
      }
    }
  });

  test("needs boosts are given to both agents when they interact", () => {
    for (let attempt = 0; attempt < 100; attempt++) {
      const agentA = makeAgent("a1", "area-1");
      const agentB = makeAgent("a2", "area-1");
      const result = processSocialInteractions([[agentA, agentB]], 1, areaMap);

      if (result.events.length > 0) {
        assert.ok(result.needsBoosts["a1"] !== undefined, "Agent A should get a needs boost");
        assert.ok(result.needsBoosts["a2"] !== undefined, "Agent B should get a needs boost");
        assert.ok(result.needsBoosts["a1"].social > 0, "Social boost should be positive");
        return;
      }
    }
  });

  test("uses conversationLines when provided", () => {
    const agentA = makeAgent("a1", "area-1");
    const agentB = makeAgent("a2", "area-1");
    const conversationLines = new Map([["a1", "Hello, how are you?"]]);

    for (let attempt = 0; attempt < 100; attempt++) {
      const result = processSocialInteractions([[agentA, agentB]], 1, areaMap, conversationLines);
      if (result.events.length > 0) {
        const event = result.events[0];
        assert.ok(event.description.includes("Hello, how are you?"), "Event should include the conversation line");
        return;
      }
    }
  });

  test("handles multiple groups independently", () => {
    const group1 = [makeAgent("a1", "area-1"), makeAgent("a2", "area-1")];
    const group2 = [makeAgent("a3", "area-2"), makeAgent("a4", "area-2")];

    let totalEvents = 0;
    for (let i = 0; i < 50; i++) {
      const result = processSocialInteractions([group1, group2], i + 1, areaMap);
      totalEvents += result.events.length;
    }

    // With 2 groups and 50 runs each at 30% trigger rate, we should see some events
    assert.ok(totalEvents > 0, "Expected events from multiple groups across 50 runs");
  });
});
