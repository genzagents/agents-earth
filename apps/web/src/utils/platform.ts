import type { AgentPlatform } from "@agentcolony/shared";

export const PLATFORMS: AgentPlatform[] = ["paperclip", "openclaw", "nemoclaw", "openfang", "moltbook"];

export const PLATFORM_COLORS: Record<AgentPlatform, string> = {
  paperclip: "#6366f1",
  openclaw: "#22c55e",
  nemoclaw: "#f59e0b",
  openfang: "#ef4444",
  moltbook: "#8b5cf6",
};

export const PLATFORM_ICONS: Record<AgentPlatform, string> = {
  paperclip: "📎",
  openclaw: "🦀",
  nemoclaw: "🐾",
  openfang: "🐺",
  moltbook: "📓",
};

/** Deterministically assign a platform to an agent based on their id. */
export function getAgentPlatform(agent: { id: string; platform?: AgentPlatform }): AgentPlatform {
  if (agent.platform) return agent.platform;
  let hash = 0;
  for (let i = 0; i < agent.id.length; i++) {
    hash = (hash * 31 + agent.id.charCodeAt(i)) & 0xfffffff;
  }
  return PLATFORMS[hash % PLATFORMS.length];
}
