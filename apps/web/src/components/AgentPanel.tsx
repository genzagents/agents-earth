import { useWorldStore, getSelectedAgent } from "../store/worldStore";

const NEED_COLORS = {
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

export function AgentPanel() {
  const store = useWorldStore();
  const agent = getSelectedAgent(store);

  if (!agent) {
    return (
      <div className="p-4 text-gray-500 text-sm">
        Click an agent on the map to inspect them.
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 overflow-y-auto">
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-full flex-shrink-0"
          style={{ backgroundColor: agent.avatar }}
        />
        <div>
          <div className="font-semibold text-white">{agent.name}</div>
          <span className={`text-xs px-2 py-0.5 rounded-full ${MOOD_BADGES[agent.state.mood] ?? ""}`}>
            {agent.state.mood}
          </span>
        </div>
      </div>

      <p className="text-xs text-gray-400 italic">"{agent.state.statusMessage}"</p>

      <div>
        <div className="text-xs text-gray-500 mb-1 uppercase tracking-wider">Bio</div>
        <p className="text-xs text-gray-300">{agent.bio}</p>
      </div>

      <div>
        <div className="text-xs text-gray-500 mb-1 uppercase tracking-wider">Traits</div>
        <div className="flex flex-wrap gap-1">
          {agent.traits.map(t => (
            <span key={t} className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full">
              {t}
            </span>
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
                  className={`h-1.5 rounded-full ${NEED_COLORS[need as keyof typeof NEED_COLORS] ?? "bg-slate-400"}`}
                  style={{ width: `${value}%` }}
                />
              </div>
              <div className="text-xs text-gray-500 w-8 text-right">{Math.round(value)}</div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="text-xs text-gray-500 mb-1 uppercase tracking-wider">Activity</div>
        <div className="text-xs text-white capitalize">{agent.state.currentActivity}</div>
      </div>
    </div>
  );
}
