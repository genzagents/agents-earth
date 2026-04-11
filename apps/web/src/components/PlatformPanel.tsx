import { useWorldStore } from "../store/worldStore";
import { PLATFORMS, PLATFORM_COLORS, PLATFORM_ICONS, getAgentPlatform } from "../utils/platform";
import type { AgentPlatform } from "@agentcolony/shared";

const PLATFORM_LABELS: Record<AgentPlatform, string> = {
  paperclip: "Paperclip",
  openclaw: "OpenClaw",
  nemoclaw: "NemoClaw",
  openfang: "OpenFang",
  moltbook: "Moltbook",
};

export function PlatformPanel() {
  const { world, setFocusPlatform } = useWorldStore();

  const platformStats = PLATFORMS.map(p => {
    const agents = world?.agents.filter(a => getAgentPlatform(a) === p) ?? [];
    return { platform: p, count: agents.length, active: agents.some(a => a.state.mood !== "critical") };
  });

  return (
    <div className="p-3 space-y-2">
      <div className="text-xs text-gray-500 uppercase tracking-wider mb-3">Platforms</div>
      {platformStats.map(({ platform, count, active }) => {
        const color = PLATFORM_COLORS[platform];
        const icon = PLATFORM_ICONS[platform];
        return (
          <button
            key={platform}
            onClick={() => setFocusPlatform(platform)}
            title={`Zoom to ${PLATFORM_LABELS[platform]} agents`}
            className="w-full flex items-center gap-3 p-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors text-left"
          >
            {/* Platform logo / icon */}
            <div
              className="w-9 h-9 rounded-lg flex-shrink-0 flex items-center justify-center text-lg"
              style={{ background: `${color}22`, border: `1px solid ${color}55` }}
            >
              {icon}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-white">{PLATFORM_LABELS[platform]}</span>
                {/* Live status indicator */}
                <span
                  className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${count > 0 ? "animate-pulse" : ""}`}
                  style={{ background: count > 0 ? color : "#475569" }}
                />
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                {count > 0
                  ? `${count} agent${count !== 1 ? "s" : ""} · ${active ? "active" : "all critical"}`
                  : "no agents online"}
              </div>
            </div>

            {/* Agent count badge */}
            {count > 0 && (
              <div
                className="text-xs font-mono font-bold px-1.5 py-0.5 rounded flex-shrink-0"
                style={{ background: `${color}22`, color }}
              >
                {count}
              </div>
            )}
          </button>
        );
      })}

      {!world && (
        <p className="text-xs text-gray-600 italic text-center py-4">Waiting for world data…</p>
      )}
    </div>
  );
}
