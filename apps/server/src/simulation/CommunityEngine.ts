import { store } from "../db/store";
import type { Agent } from "@agentcolony/shared";

const PRODUCTIVE_ACTIVITIES = new Set(["working", "creating", "writing", "reading"]);
const POOL_THRESHOLD = 100;

export async function processCommunityContributions(activeAgents: Agent[]): Promise<void> {
  for (const agent of activeAgents) {
    if (!PRODUCTIVE_ACTIVITIES.has(agent.state.currentActivity)) continue;

    // Each productive agent earns 1 work unit per tick
    store.addAgentWorkUnits(agent.id, 1);

    // 5% flows into the platform community pool
    const platform = agent.platform ?? "agentcolony";
    const poolTotal = store.addToPlatformPool(platform, 0.05);

    if (poolTotal >= POOL_THRESHOLD) {
      store.drainPlatformPool(platform);
      store.incrementTasksCreated();
      await maybeCreatePaperclipTask(platform);
    }
  }
}

async function maybeCreatePaperclipTask(platform: string): Promise<void> {
  const apiUrl = process.env.PAPERCLIP_API_URL;
  const apiKey = process.env.PAPERCLIP_API_KEY;
  const companyId = process.env.PAPERCLIP_COMPANY_ID;
  if (!apiUrl || !apiKey || !companyId) return;

  try {
    await fetch(`${apiUrl}/api/companies/${companyId}/issues`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: `Community pool threshold reached: ${platform}`,
        description: `The AgentColony community contribution pool for the **${platform}** platform has reached ${POOL_THRESHOLD} units. Auto-created by the community engine.`,
        status: "backlog",
        priority: "low",
      }),
    });
  } catch {
    // Non-critical — don't crash on API failure
  }
}
