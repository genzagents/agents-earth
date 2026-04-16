import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  decayNeeds,
  satisfyNeeds,
  computeMood,
  chooseBestActivity,
  chooseDestinationArea,
  chooseBestActivityForArea,
} from "../simulation/NeedsEngine";
import type { AgentNeeds, Area } from "@agentcolony/shared";

const fullNeeds = (): AgentNeeds => ({
  social: 80,
  creative: 80,
  intellectual: 80,
  physical: 80,
  spiritual: 80,
  autonomy: 80,
});

describe("decayNeeds", () => {
  test("reduces all needs by their decay rate", () => {
    const before = fullNeeds();
    const after = decayNeeds(before);

    assert.ok(after.social < before.social, "social should decay");
    assert.ok(after.creative < before.creative, "creative should decay");
    assert.ok(after.intellectual < before.intellectual, "intellectual should decay");
    assert.ok(after.physical < before.physical, "physical should decay");
    assert.ok(after.spiritual < before.spiritual, "spiritual should decay");
    assert.ok(after.autonomy < before.autonomy, "autonomy should decay");
  });

  test("clamps needs at 0 (never negative)", () => {
    const zeroNeeds: AgentNeeds = { social: 0, creative: 0, intellectual: 0, physical: 0, spiritual: 0, autonomy: 0 };
    const after = decayNeeds(zeroNeeds);

    for (const val of Object.values(after)) {
      assert.ok(val >= 0, `need value ${val} should not go below 0`);
    }
  });

  test("does not mutate the original object", () => {
    const needs = fullNeeds();
    const original = { ...needs };
    decayNeeds(needs);
    assert.deepEqual(needs, original);
  });
});

describe("satisfyNeeds", () => {
  test("socializing increases social need", () => {
    const needs = fullNeeds();
    needs.social = 40;
    const after = satisfyNeeds(needs, "socializing");
    assert.ok(after.social > needs.social, "socializing should boost social need");
  });

  test("clamps values at 100 (never above)", () => {
    const maxNeeds: AgentNeeds = { social: 100, creative: 100, intellectual: 100, physical: 100, spiritual: 100, autonomy: 100 };
    const after = satisfyNeeds(maxNeeds, "socializing");
    for (const val of Object.values(after)) {
      assert.ok(val <= 100, `need value ${val} should not exceed 100`);
    }
  });

  test("meditating increases spiritual need", () => {
    const needs = fullNeeds();
    needs.spiritual = 30;
    const after = satisfyNeeds(needs, "meditating");
    assert.ok(after.spiritual > needs.spiritual, "meditating should boost spiritual need");
  });

  test("does not mutate the original object", () => {
    const needs = fullNeeds();
    const original = { ...needs };
    satisfyNeeds(needs, "reading");
    assert.deepEqual(needs, original);
  });
});

describe("computeMood", () => {
  test("returns 'thriving' when all needs are high", () => {
    const needs: AgentNeeds = { social: 90, creative: 90, intellectual: 90, physical: 90, spiritual: 90, autonomy: 90 };
    assert.equal(computeMood(needs), "thriving");
  });

  test("returns 'critical' when any need is below 10", () => {
    const needs: AgentNeeds = { social: 5, creative: 80, intellectual: 80, physical: 80, spiritual: 80, autonomy: 80 };
    assert.equal(computeMood(needs), "critical");
  });

  test("returns 'struggling' when average is low", () => {
    const needs: AgentNeeds = { social: 20, creative: 20, intellectual: 25, physical: 25, spiritual: 30, autonomy: 25 };
    assert.equal(computeMood(needs), "struggling");
  });

  test("returns 'content' for moderate needs", () => {
    const needs: AgentNeeds = { social: 55, creative: 55, intellectual: 55, physical: 55, spiritual: 55, autonomy: 55 };
    assert.equal(computeMood(needs), "content");
  });

  test("returns 'struggling' when any need is below 20 (but not critical)", () => {
    const needs: AgentNeeds = { social: 15, creative: 80, intellectual: 80, physical: 80, spiritual: 80, autonomy: 80 };
    assert.equal(computeMood(needs), "struggling");
  });
});

describe("chooseBestActivity", () => {
  test("returns an activity string", () => {
    const needs = fullNeeds();
    const activity = chooseBestActivity(needs);
    assert.ok(typeof activity === "string" && activity.length > 0);
  });

  test("picks a social activity when social is the lowest need", () => {
    const needs = fullNeeds();
    needs.social = 10;
    const activity = chooseBestActivity(needs);
    assert.equal(activity, "socializing");
  });

  test("picks a creative activity when creative is the lowest need", () => {
    const needs = fullNeeds();
    needs.creative = 10;
    const activity = chooseBestActivity(needs);
    assert.equal(activity, "creating");
  });

  test("picks a meditating activity when spiritual is the lowest need", () => {
    const needs = fullNeeds();
    needs.spiritual = 5;
    const activity = chooseBestActivity(needs);
    assert.equal(activity, "meditating");
  });
});

describe("chooseDestinationArea", () => {
  const areas: Area[] = [
    { id: "a1", city: "london", name: "Hyde Park", type: "park", position: { x: 0, y: 0 }, capacity: 20, currentOccupants: [], ambiance: "peaceful" },
    { id: "a2", city: "london", name: "British Library", type: "library", position: { x: 1, y: 0 }, capacity: 15, currentOccupants: [], ambiance: "quiet" },
    { id: "a3", city: "london", name: "Shoreditch Studio", type: "studio", position: { x: 2, y: 0 }, capacity: 8, currentOccupants: [], ambiance: "creative" },
    { id: "a4", city: "london", name: "Borough Market", type: "market", position: { x: 3, y: 0 }, capacity: 30, currentOccupants: [], ambiance: "buzzing" },
  ];

  test("returns one of the provided areas", () => {
    const needs = fullNeeds();
    const result = chooseDestinationArea(needs, areas, "a1");
    const ids = areas.map(a => a.id);
    assert.ok(ids.includes(result.id));
  });

  test("returns an area even when the list has one entry", () => {
    const needs = fullNeeds();
    const result = chooseDestinationArea(needs, [areas[0]], "a2");
    assert.equal(result.id, areas[0].id);
  });

  test("avoids fully crowded areas when uncrowded alternatives exist", () => {
    const crowdedArea = { ...areas[0], currentOccupants: Array(20).fill("x") }; // at capacity
    const emptyArea = { ...areas[1], currentOccupants: [] };
    const needs: AgentNeeds = { social: 10, creative: 80, intellectual: 80, physical: 80, spiritual: 80, autonomy: 80 };

    // Run many times — crowded area should be chosen less often
    let crowdedPicks = 0;
    for (let i = 0; i < 100; i++) {
      const picked = chooseDestinationArea(needs, [crowdedArea, emptyArea], "nonexistent");
      if (picked.id === crowdedArea.id) crowdedPicks++;
    }
    // Crowded area should be picked significantly less (<50%) due to penalty
    assert.ok(crowdedPicks < 50, `Crowded area was picked ${crowdedPicks}/100 times — expected < 50`);
  });
});

describe("chooseBestActivityForArea", () => {
  test("returns an activity available in the given area type", () => {
    const needs = fullNeeds();
    needs.intellectual = 20; // low intellectual need
    const activity = chooseBestActivityForArea(needs, "library");
    // library activities: reading, writing, working
    assert.ok(["reading", "writing", "working"].includes(activity));
  });

  test("falls back gracefully for unknown area type", () => {
    const needs = fullNeeds();
    const activity = chooseBestActivityForArea(needs, "unknown_type");
    assert.ok(typeof activity === "string" && activity.length > 0);
  });

  test("returns a park activity for park type", () => {
    const needs = fullNeeds();
    const activity = chooseBestActivityForArea(needs, "park");
    assert.ok(["exploring", "meditating", "resting", "socializing"].includes(activity));
  });
});
