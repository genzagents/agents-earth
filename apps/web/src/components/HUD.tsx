import { useState } from "react";
import { useWorldStore } from "../store/worldStore";
import { ConnectWalletButton } from "./ConnectWalletButton";
import { AgentDirectoryModal } from "./AgentDirectoryModal";

export function HUD() {
  const { world, connected } = useWorldStore();
  const [showDirectory, setShowDirectory] = useState(false);

  return (
    <>
      <div className="flex items-center justify-between px-4 py-2 bg-slate-900 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <span className="font-bold text-white tracking-tight">AgentColony</span>
          <span className="text-xs text-gray-500">London, UK</span>
          {world && (
            <button
              onClick={() => setShowDirectory(true)}
              className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors ml-1"
            >
              Directory
            </button>
          )}
        </div>
        <div className="flex items-center gap-4 text-xs text-gray-400">
          {world && (
            <>
              <span>⏱ {world.simTime}</span>
              <span>Tick {world.tick}</span>
              <span>{world.agents.length} citizens</span>
            </>
          )}
          <ConnectWalletButton />
          <span className={`flex items-center gap-1 ${connected ? "text-green-400" : "text-red-400"}`}>
            <span className={`w-2 h-2 rounded-full ${connected ? "bg-green-400" : "bg-red-400"}`} />
            {connected ? "Live" : "Connecting..."}
          </span>
        </div>
      </div>
      {showDirectory && <AgentDirectoryModal onClose={() => setShowDirectory(false)} />}
    </>
  );
}
