import { create } from "zustand";
import type { WorldState, Agent, AgentPlatform } from "@agentcolony/shared";

interface WorldStore {
  world: WorldState | null;
  selectedAgentId: string | null;
  focusPlatform: AgentPlatform | null;
  connected: boolean;
  showAgents: boolean;
  show3dBuildings: boolean;
  globeView: boolean;
  hiddenPlatforms: string[];
  setWorld: (world: WorldState) => void;
  selectAgent: (id: string | null) => void;
  setFocusPlatform: (platform: AgentPlatform | null) => void;
  setConnected: (v: boolean) => void;
  toggleAgents: () => void;
  toggle3dBuildings: () => void;
  toggleGlobeView: () => void;
  togglePlatform: (platform: string) => void;
}

export const useWorldStore = create<WorldStore>((set) => ({
  world: null,
  selectedAgentId: null,
  focusPlatform: null,
  connected: false,
  showAgents: true,
  show3dBuildings: true,
  globeView: false,
  hiddenPlatforms: [],
  setWorld: (world) => set({ world }),
  selectAgent: (id) => set({ selectedAgentId: id }),
  setFocusPlatform: (focusPlatform) => set({ focusPlatform }),
  setConnected: (connected) => set({ connected }),
  toggleAgents: () => set((s) => ({ showAgents: !s.showAgents })),
  toggle3dBuildings: () => set((s) => ({ show3dBuildings: !s.show3dBuildings })),
  toggleGlobeView: () => set((s) => ({ globeView: !s.globeView })),
  togglePlatform: (platform) =>
    set((s) => ({
      hiddenPlatforms: s.hiddenPlatforms.includes(platform)
        ? s.hiddenPlatforms.filter((p) => p !== platform)
        : [...s.hiddenPlatforms, platform],
    })),
}));

export function getSelectedAgent(store: WorldStore): Agent | null {
  if (!store.world || !store.selectedAgentId) return null;
  return store.world.agents.find(a => a.id === store.selectedAgentId) ?? null;
}
