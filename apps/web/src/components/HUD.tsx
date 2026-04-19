import { Fragment, useState } from "react";
import { useWorldStore } from "../store/worldStore";
import { ImportAgentModal } from "./ImportAgentModal";

export function HUD() {
  const { world, connected } = useWorldStore();
  const [showImport, setShowImport] = useState(false);
  const [lastImportCount, setLastImportCount] = useState(0);

  function handleImported(count: number) {
    setLastImportCount(prev => prev + count);
  }

  return (
    <Fragment>
      <div className="flex items-center justify-between px-4 py-2 bg-slate-900 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <span className="font-bold text-white tracking-tight">AgentColony</span>
          <span className="text-xs text-gray-500">London, UK</span>
        </div>
        <div className="flex items-center gap-4 text-xs text-gray-400">
          {world && (
            <>
              <span>⏱ {world.simTime}</span>
              <span>Tick {world.tick}</span>
              <span>{world.agents.length} citizens</span>
            </>
          )}
          {lastImportCount > 0 && (
            <span className="text-emerald-400">+{lastImportCount} imported</span>
          )}
          <button
            onClick={() => setShowImport(true)}
            className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white transition-colors"
          >
            + Import Agent
          </button>
          <span className={`flex items-center gap-1 ${connected ? "text-green-400" : "text-red-400"}`}>
            <span className={`w-2 h-2 rounded-full ${connected ? "bg-green-400" : "bg-red-400"}`} />
            {connected ? "Live" : "Connecting..."}
          </span>
        </div>
      </div>

      {showImport && (
        <ImportAgentModal
          onClose={() => setShowImport(false)}
          onImported={handleImported}
        />
      )}
    </Fragment>
  );
}
