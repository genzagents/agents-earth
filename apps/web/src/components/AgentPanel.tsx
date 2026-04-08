import { useEffect, useState } from "react";
import { useWorldStore, getSelectedAgent } from "../store/worldStore";
import type { Memory } from "@agentcolony/shared";

const NEED_COLORS: Record<string, string> = {
  social: "bg-blue-500",
  creative: "bg-purple-500",
  intellectual: "bg-cyan-500",
  physical: "bg-green-500",
  spiritual: "bg-amber-500",
  autonomy: "bg-rose-500",
};

const MOOD_BADGES: Record<string, string> = {
  thriving: "bg-green-900 text-green-300",
  content: "bg-blue-900 text-blue-300",
  struggling: "bg-amber-900 text-amber-300",
  critical: "bg-red-900 text-red-300",
};

const ACTIVITY_ICONS: Record<string, string> = {
  socializing: "💬", reading: "📖", writing: "✍️", meditating: "🧘",
  working: "💼", exploring: "🚶", resting: "😴", creating: "🎨", conversing: "🗣",
};

export function AgentPanel() {
  const store = useWorldStore();
  const agent = getSelectedAgent(store);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [activeTab, setActiveTab] = useState<"info" | "memories">("info");

  useEffect(() => {
    if (!agent) { setMemories([]); return; }
    fetch(`/api/agents/${agent.id}/memories`)
      .then(r => r.json())
      .then(setMemories)
      .catch(() => setMemories([]));
  }, [agent?.id]);

  if (!agent) {
    return (
      <div className="p-4 text-gray-500 text-sm italic">
        Click an agent on the map to inspect them.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="p-3 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full flex-shrink-0" style={{ backgroundColor: agent.avatar }} />
          <div className="min-w-0">
            <div className="font-semibold text-white text-sm truncate">{agent.name}</div>
            <div className="flex items-center gap-1 mt-0.5">
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${MOOD_BADGES[agent.state.mood] ?? ""}`}>
                {agent.state.mood}
              </span>
              <span className="text-xs text-gray-500">
                {ACTIVITY_ICONS[agent.state.currentActivity] ?? "·"} {agent.state.currentActivity}
              </span>
            </div>
          </div>
        </div>
        <p className="text-xs text-gray-400 italic mt-2 leading-relaxed">"{agent.state.statusMessage}"</p>
      </div>

      <div className="flex border-b border-slate-800">
        {(["info", "memories"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 text-xs py-1.5 capitalize transition-colors ${
              activeTab === tab ? "text-white border-b border-indigo-500" : "text-gray-500 hover:text-gray-300"
            }`}
          >
            {tab} {tab === "memories" && memories.length > 0 ? `(${memories.length})` : ""}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {activeTab === "info" && (
          <>
            <div>
              <div className="text-xs text-gray-500 mb-1 uppercase tracking-wider">Bio</div>
              <p className="text-xs text-gray-300 leading-relaxed">{agent.bio}</p>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1 uppercase tracking-wider">Traits</div>
              <div className="flex flex-wrap gap-1">
                {agent.traits.map(t => (
                  <span key={t} className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full">{t}</span>
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-2 uppercase tracking-wider">Needs</div>
              <div className="space-y-1.5">
                {Object.entries(agent.needs).map(([need, value]) => (
                  <div key={need} className="flex items-center gap-2">
                    <div className="text-xs text-gray-400 w-20 capitalize">{need}</div>
                    <div className="flex-1 bg-slate-700 rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full transition-all duration-500 ${NEED_COLORS[need] ?? "bg-slate-400"}`}
                        style={{ width: `${value}%` }}
                      />
                    </div>
                    <div className={`text-xs w-6 text-right font-mono ${value < 20 ? "text-red-400" : value > 70 ? "text-green-400" : "text-gray-500"}`}>
                      {Math.round(value)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {activeTab === "memories" && (
          <div className="space-y-2">
            {memories.length === 0
              ? <p className="text-xs text-gray-600 italic">No memories yet.</p>
              : memories.slice(0, 20).map(mem => (
                <div key={mem.id} className="bg-slate-800 rounded p-2 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      mem.kind === "social" ? "bg-blue-900 text-blue-300" :
                      mem.kind === "creation" ? "bg-purple-900 text-purple-300" :
                      "bg-slate-700 text-slate-300"
                    }`}>{mem.kind}</span>
                    <span className={`text-xs font-mono ${mem.emotionalWeight > 0.2 ? "text-green-400" : mem.emotionalWeight < -0.2 ? "text-red-400" : "text-gray-500"}`}>
                      {mem.emotionalWeight > 0 ? "+" : ""}{mem.emotionalWeight.toFixed(2)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-300 leading-relaxed">{mem.description}</p>
                  {mem.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {mem.tags.map(t => <span key={t} className="text-xs text-gray-600">#{t}</span>)}
                    </div>
                  )}
                </div>
              ))
            }
          </div>
        )}
      </div>
    </div>
  );
}
