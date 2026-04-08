import { useSocket } from "./hooks/useSocket";
import { WorldCanvas } from "./canvas/WorldCanvas";
import { AgentPanel } from "./components/AgentPanel";
import { EventFeed } from "./components/EventFeed";
import { HUD } from "./components/HUD";

export function App() {
  useSocket();

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-white">
      <HUD />
      <div className="flex flex-1 overflow-hidden">
        {/* World canvas — main view */}
        <div className="flex-1 p-3">
          <WorldCanvas />
        </div>

        {/* Right panel */}
        <div className="w-72 flex flex-col border-l border-slate-800 bg-slate-900">
          {/* Agent inspector */}
          <div className="flex-1 overflow-hidden border-b border-slate-800">
            <div className="text-xs text-gray-500 uppercase tracking-wider px-4 py-2 border-b border-slate-800">
              Agent Inspector
            </div>
            <AgentPanel />
          </div>
          {/* Event feed */}
          <div className="h-48 overflow-hidden">
            <EventFeed />
          </div>
        </div>
      </div>
    </div>
  );
}
