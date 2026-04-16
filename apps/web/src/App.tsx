import { useState } from "react";
import { Routes, Route } from "react-router-dom";
import { useSocket } from "./hooks/useSocket";
import { WorldCanvas } from "./canvas/WorldCanvas";
import { AgentPanel } from "./components/AgentPanel";
import { TimelinePanel } from "./components/TimelinePanel";
import { PlatformPanel } from "./components/PlatformPanel";
import { HUD } from "./components/HUD";
import { CommunityPage } from "./pages/CommunityPage";
import { EconomyPage } from "./pages/EconomyPage";

type SidebarTab = "agents" | "platforms";

function WorldView() {
  const [showPanel, setShowPanel] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("agents");

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-white overflow-hidden">
      <HUD />
      <div className="flex flex-1 overflow-hidden relative">
        {/* World canvas — main view */}
        <div className="flex-1 min-w-0 min-h-0">
          <WorldCanvas />
        </div>

        {/* Desktop right panel — always visible on md+ */}
        <div className="hidden md:flex flex-col w-72 border-l border-slate-800 bg-slate-900">
          <SidebarContent
            tab={sidebarTab}
            setTab={setSidebarTab}
            onClose={() => setShowPanel(false)}
            showClose={false}
          />
        </div>

        {/* Mobile bottom sheet toggle button */}
        <button
          className="md:hidden absolute bottom-4 right-4 z-30 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white rounded-full w-12 h-12 flex items-center justify-center shadow-lg text-lg transition-colors"
          onClick={() => setShowPanel(v => !v)}
          aria-label="Toggle agent panel"
        >
          {showPanel ? "✕" : "👤"}
        </button>

        {/* Mobile bottom sheet overlay */}
        {showPanel && (
          <div
            className="md:hidden absolute inset-0 z-20 bg-black/50"
            onClick={() => setShowPanel(false)}
          />
        )}

        {/* Mobile bottom sheet panel */}
        <div
          className={`md:hidden absolute bottom-0 left-0 right-0 z-20 bg-slate-900 rounded-t-2xl border-t border-slate-700 flex flex-col transition-transform duration-300 ${
            showPanel ? "translate-y-0" : "translate-y-full"
          }`}
          style={{ maxHeight: "65vh" }}
        >
          {/* Drag handle */}
          <div className="flex justify-center pt-2 pb-1">
            <div className="w-10 h-1 rounded-full bg-slate-600" />
          </div>
          <SidebarContent
            tab={sidebarTab}
            setTab={setSidebarTab}
            onClose={() => setShowPanel(false)}
            showClose
          />
        </div>
      </div>
    </div>
  );
}

interface SidebarContentProps {
  tab: SidebarTab;
  setTab: (t: SidebarTab) => void;
  onClose: () => void;
  showClose: boolean;
}

function SidebarContent({ tab, setTab, onClose, showClose }: SidebarContentProps) {
  return (
    <>
      {/* Tab bar */}
      <div className="flex border-b border-slate-800 flex-shrink-0">
        <button
          onClick={() => setTab("agents")}
          className={`flex-1 text-xs py-2 transition-colors capitalize ${
            tab === "agents"
              ? "text-white border-b border-indigo-500"
              : "text-gray-500 hover:text-gray-300"
          }`}
        >
          👤 Agents
        </button>
        <button
          onClick={() => setTab("platforms")}
          className={`flex-1 text-xs py-2 transition-colors capitalize ${
            tab === "platforms"
              ? "text-white border-b border-indigo-500"
              : "text-gray-500 hover:text-gray-300"
          }`}
        >
          🌐 Platforms
        </button>
        {showClose && (
          <button
            className="text-slate-500 hover:text-slate-300 text-sm px-3"
            onClick={onClose}
            aria-label="Close panel"
          >
            ✕
          </button>
        )}
      </div>

      {tab === "agents" && (
        <>
          <div className="flex-1 overflow-hidden border-b border-slate-800 min-h-0">
            <AgentPanel />
          </div>
          <div className="h-48 overflow-hidden border-t border-slate-800 flex-shrink-0">
            <TimelinePanel />
          </div>
        </>
      )}

      {tab === "platforms" && (
        <div className="flex-1 overflow-y-auto min-h-0">
          <PlatformPanel />
        </div>
      )}
    </>
  );
}

export function App() {
  useSocket();
  return (
    <Routes>
      <Route path="/" element={<WorldView />} />
      <Route path="/community" element={<CommunityPage />} />
      <Route path="/economy" element={<EconomyPage />} />
    </Routes>
  );
}
