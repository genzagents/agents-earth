import { useWorldStore } from "../store/worldStore";
import { PLATFORMS, PLATFORM_COLORS, PLATFORM_ICONS, getAgentPlatform } from "../utils/platform";

export function HUD() {
  const {
    world, connected,
    showAgents, show3dBuildings, globeView,
    toggleAgents, toggle3dBuildings, toggleGlobeView,
    hiddenPlatforms, togglePlatform,
  } = useWorldStore();

  const platformCounts = world
    ? PLATFORMS.reduce<Record<string, number>>((acc, p) => {
        acc[p] = world.agents.filter(a => getAgentPlatform(a) === p).length;
        return acc;
      }, {})
    : null;

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-slate-900 border-b border-slate-800">
      <div className="flex items-center gap-3">
        <span className="font-bold text-white tracking-tight">AgentColony</span>
        <span className="text-xs text-gray-500">London, UK</span>
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
      </div>
    </div>
  );
}
