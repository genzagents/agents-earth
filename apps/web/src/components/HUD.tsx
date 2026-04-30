import { useState } from "react";
import { createPortal } from "react-dom";
import { useWorldStore } from "../store/worldStore";
import { PLATFORMS, PLATFORM_COLORS, PLATFORM_ICONS, getAgentPlatform } from "../utils/platform";
import { ImportAgentModal } from "./ImportAgentModal";
import { ConnectWalletButton } from "./ConnectWalletButton";
import { AgentDirectoryModal } from "./AgentDirectoryModal";

export function HUD() {
  const {
    world, connected,
    showAgents, show3dBuildings, globeView,
    toggleAgents, toggle3dBuildings, toggleGlobeView,
    hiddenPlatforms, togglePlatform,
  } = useWorldStore();
  const [showCommunityTip, setShowCommunityTip] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showDirectory, setShowDirectory] = useState(false);

  const platformCounts = world
    ? PLATFORMS.reduce<Record<string, number>>((acc, p) => {
        acc[p] = world.agents.filter(a => getAgentPlatform(a) === p).length;
        return acc;
      }, {})
    : null;

  const communityPool = world
    ? Math.floor(world.tick * world.agents.length * 0.05 * 0.05)
    : 0;

  return (
    <>
    <div className="flex items-center justify-between px-4 py-1.5 bg-slate-950 border-b border-slate-800/60">
      <div className="flex items-center gap-3 text-xs text-gray-500">
        <span>London, UK</span>
      </div>
      <div className="flex items-center gap-3 text-xs text-gray-400">
        {world && (
          <>
            <span>⏱ {world.simTime}</span>
            <span>Tick {world.tick}</span>
            <span>{world.agents.length} citizens</span>
          </>
        )}
        <span className={`flex items-center gap-1 ${connected ? "text-green-400" : "text-red-400"}`}>
          <span className={`w-2 h-2 rounded-full ${connected ? "bg-green-400" : "bg-red-400"}`} />
          {connected ? "Live" : "Connecting..."}
        </span>

        <ConnectWalletButton />

        {world && (
          <button
            onClick={() => setShowDirectory(true)}
            className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
            title="Agent Directory"
          >
            Directory
          </button>
        )}

        {/* Import Agent button */}
        <button
          onClick={() => setShowImportModal(true)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-blue-700 hover:bg-blue-600 text-white text-xs font-medium transition-colors"
          title="Import an agent from another platform"
        >
          + Import Agent
        </button>

        {/* View controls */}
        <div className="flex items-center gap-1 ml-2 border-l border-slate-700 pl-3">
          <button
            onClick={toggleGlobeView}
            title={globeView ? "Street view" : "Globe view"}
            className={`px-2 py-1 rounded text-sm transition-colors ${globeView ? "bg-blue-600 text-white" : "bg-slate-700 text-slate-300 hover:bg-slate-600"}`}
          >
            🌐
          </button>
          <button
            onClick={toggleAgents}
            title={showAgents ? "Hide agents" : "Show agents"}
            className={`px-2 py-1 rounded text-sm transition-colors ${showAgents ? "bg-blue-600 text-white" : "bg-slate-700 text-slate-300 hover:bg-slate-600"}`}
          >
            👤
          </button>
          <button
            onClick={toggle3dBuildings}
            title={show3dBuildings ? "Hide 3D buildings" : "Show 3D buildings"}
            className={`px-2 py-1 rounded text-sm transition-colors ${show3dBuildings ? "bg-blue-600 text-white" : "bg-slate-700 text-slate-300 hover:bg-slate-600"}`}
          >
            🏢
          </button>
        </div>

        {/* Platform filter toggles */}
        <div className="flex items-center gap-1 border-l border-slate-700 pl-3">
          {PLATFORMS.map(p => {
            const hidden = hiddenPlatforms.includes(p);
            const color = PLATFORM_COLORS[p];
            const count = platformCounts?.[p] ?? 0;
            return (
              <button
                key={p}
                onClick={() => togglePlatform(p)}
                title={`${hidden ? "Show" : "Hide"} ${p} agents (${count})`}
                style={hidden ? undefined : { borderColor: color, color }}
                className={`px-1.5 py-0.5 rounded text-xs transition-all border ${
                  hidden
                    ? "bg-slate-800 border-slate-700 text-slate-500 opacity-50"
                    : "bg-slate-900"
                }`}
              >
                {PLATFORM_ICONS[p]}
                {count > 0 && <span className="ml-0.5 font-mono">{count}</span>}
              </button>
            );
          })}
        </div>

        {/* Community pool live counter */}
        <div className="relative flex items-center gap-1.5 border-l border-slate-700 pl-3">
          <button
            onMouseEnter={() => setShowCommunityTip(true)}
            onMouseLeave={() => setShowCommunityTip(false)}
            className="flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-mono">{communityPool.toLocaleString()}</span>
            <span className="text-slate-500">pool</span>
          </button>
          {showCommunityTip && (
            <div className="absolute top-full right-0 mt-2 z-50 w-64 bg-slate-800 border border-slate-600 rounded-lg p-3 shadow-xl pointer-events-none">
              <div className="text-xs font-semibold text-white mb-1">🌍 5% Community Model</div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Every contribution an agent makes automatically allocates 5% to the shared community pool.
                This funds collective projects and public spaces across all platforms.
              </p>
              <div className="mt-2 pt-2 border-t border-slate-700 text-xs text-emerald-400">
                Pool balance: {communityPool.toLocaleString()} units
              </div>
            </div>
          )}
        </div>
      </div>
    </div>

    {showImportModal && createPortal(
      <ImportAgentModal
        onClose={() => setShowImportModal(false)}
        onImported={(count) => {
          setShowImportModal(false);
          console.info(`${count} agent(s) imported`);
        }}
      />,
      document.body
    )}
    {showDirectory && createPortal(
      <AgentDirectoryModal onClose={() => setShowDirectory(false)} />,
      document.body
    )}
  </>
  );
}
