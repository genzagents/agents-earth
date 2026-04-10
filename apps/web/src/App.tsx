import { useState } from "react";
import { useSocket } from "./hooks/useSocket";
import { WorldCanvas } from "./canvas/WorldCanvas";
import { AgentPanel } from "./components/AgentPanel";
import { TimelinePanel } from "./components/TimelinePanel";
import { HUD } from "./components/HUD";

export function App() {
  useSocket();
  const [showPanel, setShowPanel] = useState(false);

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-white">
      <HUD />
      <div className="flex flex-1 overflow-hidden relative">
        {/* World canvas — main view */}
        <div className="flex-1 p-3 min-w-0">
          <WorldCanvas />
        </div>

        {/* Mobile panel toggle button */}
        <button
          className="absolute right-0 top-1/2 -translate-y-1/2 z-20 md:hidden bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-l-lg px-1 py-3 text-slate-300 text-xs"
          onClick={() => setShowPanel(v => !v)}
          aria-label="Toggle agent panel"
        >
          {showPanel ? "›" : "‹"}
        </button>

        {/* Right panel — always visible on md+, slide-in overlay on mobile */}
        <div
          className={`
            flex-col border-l border-slate-800 bg-slate-900
            md:flex md:w-72 md:static md:translate-x-0
            ${showPanel ? "flex" : "hidden"}
            w-72 absolute right-0 top-0 bottom-0 z-10
          `}
        >
          {/* Agent inspector */}
          <div className="flex-1 overflow-hidden border-b border-slate-800">
            <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800">
              <span className="text-xs text-gray-500 uppercase tracking-wider">Agent Inspector</span>
              <button
                className="md:hidden text-slate-500 hover:text-slate-300 text-sm"
                onClick={() => setShowPanel(false)}
              >
                ✕
              </button>
            </div>
            <AgentPanel />
          </div>
          {/* Timeline feed */}
          <div className="h-52 overflow-hidden border-t border-slate-800">
            <TimelinePanel />
          </div>
        </div>
      </div>
    </div>
  );
}
