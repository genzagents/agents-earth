/**
 * AgentDirectoryModal — lists all agents with reputation scores and Web3 identity.
 * Accessible from the HUD "Directory" button.
 */

import { useWorldStore } from "../store/worldStore";
import type { Agent } from "@agentcolony/shared";

interface Props {
  onClose: () => void;
}

const MOOD_DOT: Record<string, string> = {
  thriving: "bg-green-400",
  content: "bg-blue-400",
  struggling: "bg-amber-400",
  critical: "bg-red-400",
};

function ReputationBadge({ score }: { score: number | undefined }) {
  if (score === undefined) {
    return <span className="text-xs text-gray-600 italic">unrated</span>;
  }
  const tier =
    score >= 80 ? { label: "Legendary", cls: "bg-amber-900 text-amber-300" } :
    score >= 60 ? { label: "Notable", cls: "bg-purple-900 text-purple-300" } :
    score >= 40 ? { label: "Known", cls: "bg-blue-900 text-blue-300" } :
    { label: "Newcomer", cls: "bg-slate-700 text-slate-300" };

  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${tier.cls}`}>
      {tier.label} · {score}
    </span>
  );
}

function AgentRow({ agent, onSelect }: { agent: Agent; onSelect: () => void }) {
  const shortAddress = agent.walletAddress
    ? `${agent.walletAddress.slice(0, 6)}…${agent.walletAddress.slice(-4)}`
    : null;

  return (
    <button
      onClick={onSelect}
      className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-slate-800 transition-colors text-left"
    >
      <div className="relative flex-shrink-0">
        <div className="w-8 h-8 rounded-full" style={{ backgroundColor: agent.avatar }} />
        <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-slate-900 ${MOOD_DOT[agent.state.mood] ?? "bg-gray-400"}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-white truncate">{agent.name}</span>
          {agent.isRetired && (
            <span className="text-xs text-gray-500 italic">retired</span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <ReputationBadge score={agent.reputationScore} />
          {shortAddress && (
            <span className="text-xs text-gray-600 font-mono">{shortAddress}</span>
          )}
        </div>
      </div>
      <div className="text-xs text-gray-600 flex-shrink-0">
        {agent.relationships.length} links
      </div>
    </button>
  );
}

export function AgentDirectoryModal({ onClose }: Props) {
  const { world, selectAgent: storeSelectAgent } = useWorldStore();
  const agents = world?.agents ?? [];

  // Sort: active first, then by reputation descending, then alphabetically
  const sorted = [...agents].sort((a, b) => {
    if (a.isRetired !== b.isRetired) return a.isRetired ? 1 : -1;
    const ra = a.reputationScore ?? -1;
    const rb = b.reputationScore ?? -1;
    if (ra !== rb) return rb - ra;
    return a.name.localeCompare(b.name);
  });

  const active = sorted.filter(a => !a.isRetired);
  const retired = sorted.filter(a => a.isRetired);

  function selectAgent(agentId: string) {
    storeSelectAgent(agentId);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-white">Agent Directory</h2>
            <p className="text-xs text-gray-500 mt-0.5">{active.length} active · {retired.length} retired</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white transition-colors text-lg leading-none"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {active.length === 0 && retired.length === 0 && (
            <p className="text-sm text-gray-600 italic text-center py-8">No agents yet.</p>
          )}

          {active.map(agent => (
            <AgentRow key={agent.id} agent={agent} onSelect={() => selectAgent(agent.id)} />
          ))}

          {retired.length > 0 && (
            <>
              <div className="text-xs text-gray-600 uppercase tracking-wider px-3 pt-3 pb-1">
                Retired
              </div>
              {retired.map(agent => (
                <AgentRow key={agent.id} agent={agent} onSelect={() => selectAgent(agent.id)} />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
