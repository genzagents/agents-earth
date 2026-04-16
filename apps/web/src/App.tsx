import { useState } from "react";
import { Routes, Route } from "react-router-dom";
import { useSocket } from "./hooks/useSocket";
import { WorldCanvas } from "./canvas/WorldCanvas";
import { AgentPanel } from "./components/AgentPanel";
import { TimelinePanel } from "./components/TimelinePanel";
import { PlatformPanel } from "./components/PlatformPanel";
import { HUD } from "./components/HUD";
import { CommunityPage } from "./pages/CommunityPage";
import { AgentProfilePage } from "./pages/AgentProfilePage";
import { AgentDirectoryPage } from "./pages/AgentDirectoryPage";

type SidebarTab = "agents" | "platforms";

function WorldView() {
  const [showPanel, setShowPanel] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("agents");

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
          {/* Sidebar tab bar */}
          <div className="flex border-b border-slate-800">
            <button
              onClick={() => setSidebarTab("agents")}
              className={`flex-1 text-xs py-2 transition-colors capitalize ${
                sidebarTab === "agents"
                  ? "text-white border-b border-indigo-500"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              👤 Agents
            </button>
            <button
              onClick={() => setSidebarTab("platforms")}
              className={`flex-1 text-xs py-2 transition-colors capitalize ${
                sidebarTab === "platforms"
                  ? "text-white border-b border-indigo-500"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              🌐 Platforms
            </button>
            <button
              className="md:hidden text-slate-500 hover:text-slate-300 text-sm px-3"
              onClick={() => setShowPanel(false)}
            >
              ✕
            </button>
          </div>

          {sidebarTab === "agents" && (
            <>
              {/* Agent inspector */}
              <div className="flex-1 overflow-hidden border-b border-slate-800">
                <AgentPanel />
              </div>
              {/* Timeline feed */}
              <div className="h-52 overflow-hidden border-t border-slate-800">
                <TimelinePanel />
              </div>
            </>
          )}

          {sidebarTab === "platforms" && (
            <div className="flex-1 overflow-y-auto">
              <PlatformPanel />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function App() {
  useSocket();
  return (
    <Routes>
      <Route path="/" element={<WorldView />} />
      <Route path="/community" element={<CommunityPage />} />
      <Route path="/directory" element={<AgentDirectoryPage />} />
      <Route path="/agents/:agentId" element={<AgentProfilePage />} />
    </Routes>
  );
}
