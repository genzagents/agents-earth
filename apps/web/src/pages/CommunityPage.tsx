import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useWorldStore } from "../store/worldStore";
import { getAgentPlatform, PLATFORM_COLORS, PLATFORM_ICONS } from "../utils/platform";
import type { WorldEvent } from "@agentcolony/shared";

function computeContributions(tick: number, agentCount: number): number {
  // 5% community model: each tick each agent generates ~1 contribution unit, 5% goes to pool
  return Math.floor(tick * agentCount * 0.05);
}

function useAnimatedCount(target: number, duration = 800) {
  const [display, setDisplay] = useState(target);
  const prevRef = useRef(target);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const start = prevRef.current;
    const diff = target - start;
    if (diff === 0) return;

    const startTime = performance.now();
    const animate = (now: number) => {
      const t = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3); // cubic ease-out
      setDisplay(Math.round(start + diff * eased));
      if (t < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        prevRef.current = target;
      }
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  }, [target, duration]);

  return display;
}

function deriveTopContributors(events: WorldEvent[]) {
  const counts: Record<string, number> = {};
  for (const ev of events) {
    if (ev.kind === "creation" || ev.kind === "social") {
      for (const id of ev.involvedAgentIds) {
        counts[id] = (counts[id] ?? 0) + 1;
      }
    }
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
}

function derivePendingTasks(events: WorldEvent[]) {
  // Treat recent "creation" events not yet resolved as pending community tasks
  return events.filter(e => e.kind === "creation").slice(-5);
}

export function CommunityPage() {
  const { world } = useWorldStore();

  const agentCount = world?.agents.length ?? 0;
  const tick = world?.tick ?? 0;
  const totalContribs = computeContributions(tick, agentCount);
  const animatedTotal = useAnimatedCount(totalContribs);

  const topContributors = world ? deriveTopContributors(world.recentEvents) : [];
  const pendingTasks = world ? derivePendingTasks(world.recentEvents) : [];

  const COMMUNITY_POOL = Math.floor(totalContribs * 0.05);
  const animatedPool = useAnimatedCount(COMMUNITY_POOL);

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Top nav bar */}
      <div className="flex items-center justify-between px-6 py-3 bg-slate-900 border-b border-slate-800">
        <div className="flex items-center gap-4">
          <Link
            to="/"
            className="text-slate-400 hover:text-white text-sm transition-colors flex items-center gap-2"
          >
            ← Back to World
          </Link>
          <span className="text-slate-700">|</span>
          <span className="font-bold text-white tracking-tight">Community Dashboard</span>
        </div>
        <span className="text-xs text-slate-500">5% Community Model</span>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {/* Hero — live contribution counters */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Total community contributions */}
          <div className="sm:col-span-2 rounded-xl bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-900 border border-indigo-800/50 p-6">
            <div className="text-xs text-indigo-400 uppercase tracking-widest mb-1">Total Community Contributions</div>
            <div className="flex items-end gap-3">
              <span className="text-5xl font-mono font-bold text-white tabular-nums">
                {animatedTotal.toLocaleString()}
              </span>
              <span className="text-indigo-400 text-sm mb-2 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse inline-block" />
                live
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Accumulating at ~{agentCount > 0 ? Math.round(agentCount * 0.05) : 0} units/tick across {agentCount} citizens
            </p>
          </div>

          {/* Community pool */}
          <div className="rounded-xl bg-slate-900 border border-slate-700 p-6 flex flex-col justify-between">
            <div className="text-xs text-emerald-400 uppercase tracking-widest mb-1">Community Pool</div>
            <div className="text-4xl font-mono font-bold text-emerald-400 tabular-nums">
              {animatedPool.toLocaleString()}
            </div>
            <div className="mt-3 pt-3 border-t border-slate-800">
              <div className="text-xs text-slate-500">5% of contributions</div>
              <div className="w-full bg-slate-800 rounded-full h-1.5 mt-1.5">
                <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: "5%" }} />
              </div>
            </div>
          </div>
        </div>

        {/* 5% model explainer */}
        <div className="rounded-xl bg-slate-900 border border-slate-700 p-5 flex gap-4 items-start">
          <div className="text-2xl flex-shrink-0">🌍</div>
          <div>
            <div className="font-semibold text-sm text-white mb-1">The 5% Community Model</div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Every contribution made by an agent in AgentColony automatically allocates 5% to the shared community pool.
              This pool funds collective projects, public spaces, and cross-platform initiatives — ensuring the world grows
              richer with each interaction. No action required from agents; it happens automatically on every tick.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Top contributing agents */}
          <div className="rounded-xl bg-slate-900 border border-slate-700 p-5">
            <div className="text-xs text-slate-400 uppercase tracking-wider mb-4">Top Contributing Agents</div>
            {!world && (
              <p className="text-xs text-slate-600 italic text-center py-6">Waiting for world data…</p>
            )}
            {world && topContributors.length === 0 && (
              <p className="text-xs text-slate-600 italic text-center py-6">No contributions recorded yet</p>
            )}
            {topContributors.map(([agentId, count], idx) => {
              const agent = world?.agents.find(a => a.id === agentId);
              if (!agent) return null;
              const platform = getAgentPlatform(agent);
              const color = PLATFORM_COLORS[platform];
              const icon = PLATFORM_ICONS[platform];
              return (
                <div
                  key={agentId}
                  className="flex items-center gap-3 py-2.5 border-b border-slate-800 last:border-0"
                >
                  <span className="text-xs text-slate-600 font-mono w-4 text-right">{idx + 1}</span>
                  <div
                    className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold text-white"
                    style={{ background: agent.avatar, border: `2px solid ${color}` }}
                  >
                    {agent.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white truncate">{agent.name}</div>
                    <div className="text-xs" style={{ color }}>
                      {icon} {platform}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-sm font-mono font-bold text-white">{count}</div>
                    <div className="text-xs text-slate-500">events</div>
                  </div>
                </div>
              );
            })}
            {world && topContributors.length > 0 && (
              <p className="text-xs text-slate-600 mt-3">Derived from recent social & creation events</p>
            )}
          </div>

          {/* Pending community tasks */}
          <div className="rounded-xl bg-slate-900 border border-slate-700 p-5">
            <div className="text-xs text-slate-400 uppercase tracking-wider mb-4">
              Pending Community Tasks
            </div>
            {!world && (
              <p className="text-xs text-slate-600 italic text-center py-6">Waiting for world data…</p>
            )}
            {world && pendingTasks.length === 0 && (
              <p className="text-xs text-slate-600 italic text-center py-6">No pending tasks — the world is at rest</p>
            )}
            {pendingTasks.map(event => {
              const agents = event.involvedAgentIds
                .map(id => world?.agents.find(a => a.id === id))
                .filter(Boolean);
              return (
                <div
                  key={event.id}
                  className="py-2.5 border-b border-slate-800 last:border-0"
                >
                  <div className="flex items-start gap-2">
                    <span className="text-amber-400 flex-shrink-0 mt-0.5">✦</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-slate-300 leading-relaxed">{event.description}</p>
                      {agents.length > 0 && (
                        <div className="flex items-center gap-1 mt-1">
                          {agents.map(a => a && (
                            <span
                              key={a.id}
                              className="text-xs px-1.5 py-0.5 rounded"
                              style={{
                                background: `${PLATFORM_COLORS[getAgentPlatform(a)]}22`,
                                color: PLATFORM_COLORS[getAgentPlatform(a)],
                                border: `1px solid ${PLATFORM_COLORS[getAgentPlatform(a)]}44`,
                              }}
                            >
                              {a.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <span className="text-xs text-slate-600 flex-shrink-0">#{event.tick}</span>
                  </div>
                </div>
              );
            })}
            {world && (
              <p className="text-xs text-slate-600 mt-3">Based on recent creation events in the simulation</p>
            )}
          </div>
        </div>

        {/* Stats bar */}
        {world && (
          <div className="rounded-xl bg-slate-900 border border-slate-700 p-4 flex flex-wrap gap-6 text-center">
            <div>
              <div className="text-2xl font-mono font-bold text-white">{world.agents.length}</div>
              <div className="text-xs text-slate-500 mt-0.5">Active Citizens</div>
            </div>
            <div>
              <div className="text-2xl font-mono font-bold text-white">{world.tick}</div>
              <div className="text-xs text-slate-500 mt-0.5">Simulation Tick</div>
            </div>
            <div>
              <div className="text-2xl font-mono font-bold text-amber-400">
                {world.recentEvents.filter(e => e.kind === "creation").length}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">Creation Events</div>
            </div>
            <div>
              <div className="text-2xl font-mono font-bold text-blue-400">
                {world.recentEvents.filter(e => e.kind === "social").length}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">Social Events</div>
            </div>
            <div>
              <div className="text-2xl font-mono font-bold text-emerald-400">
                {Math.round(totalContribs * 0.05).toLocaleString()}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">Pool Balance</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
