import { create } from "zustand";
import type { WorldState, Agent } from "@agentcolony/shared";

interface WorldStore {
  world: WorldState | null;
  selectedAgentId: string | null;
  connected: boolean;
  setWorld: (world: WorldState) => void;
  selectAgent: (id: string | null) => void;
  setConnected: (v: boolean) => void;
}

export const useWorldStore = create<WorldStore>((set) => ({
  world: null,
  selectedAgentId: null,
  connected: false,
  setWorld: (world) => set({ world }),
  selectAgent: (id) => set({ selectedAgentId: id }),
  setConnected: (connected) => set({ connected }),
}));

export function getSelectedAgent(store: WorldStore): Agent | null {
  if (!store.world || !store.selectedAgentId) return null;
  return store.world.agents.find(a => a.id === store.selectedAgentId) ?? null;
}
