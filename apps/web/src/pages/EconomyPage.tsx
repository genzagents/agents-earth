import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { EconomyLeaderboard, PlotTier } from "@agentcolony/shared";
import { PLATFORM_COLORS, PLATFORM_ICONS } from "../utils/platform";

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? "";

const TIER_COLORS: Record<PlotTier, string> = {
  small: "#64748b",
  medium: "#3b82f6",
  large: "#a855f7",
  mega: "#f59e0b",
};

const TIER_LABELS: Record<PlotTier, string> = {
  small: "Small",
  medium: "Medium",
  large: "Large",
  mega: "Mega",
};

const TIER_ORDER: PlotTier[] = ["mega", "large", "medium", "small"];

function TierBadge({ tier }: { tier: PlotTier }) {
  const color = TIER_COLORS[tier];
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold"
      style={{ background: `${color}22`, color, border: `1px solid ${color}55` }}
    >
      {tier === "mega" && "★ "}
      {TIER_LABELS[tier]}
    </span>
  );
}

export function EconomyPage() {
  const [data, setData] = useState<EconomyLeaderboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchLeaderboard() {
      try {
        const res = await fetch(`${SERVER_URL}/api/economy/leaderboard`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: EconomyLeaderboard = await res.json();
        if (!cancelled) {
          setData(json);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchLeaderboard();
    const interval = setInterval(fetchLeaderboard, 10_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Nav bar */}
      <div className="flex items-center justify-between px-6 py-3 bg-slate-900 border-b border-slate-800">
        <div className="flex items-center gap-4">
          <Link
            to="/"
            className="text-slate-400 hover:text-white text-sm transition-colors flex items-center gap-2"
          >
            ← Back to World
          </Link>
          <span className="text-slate-700">|</span>
          <span className="font-bold text-white tracking-tight">Economy Dashboard</span>
        </div>
        <span className="text-xs text-slate-500">Plot Tier Leaderboard</span>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {/* Stats cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {TIER_ORDER.map(tier => {
            const count = data?.plotTierCounts[tier] ?? 0;
            const color = TIER_COLORS[tier];
            return (
              <div
                key={tier}
                className="rounded-xl bg-slate-900 border p-5 flex flex-col gap-1"
                style={{ borderColor: `${color}44` }}
              >
                <div className="text-xs uppercase tracking-widest mb-1" style={{ color }}>
                  {TIER_LABELS[tier]} plots
                </div>
                <div className="text-3xl font-mono font-bold text-white tabular-nums">{count}</div>
              </div>
            );
          })}
        </div>

        {/* Global totals */}
        {data && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-xl bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-900 border border-indigo-800/50 p-6">
              <div className="text-xs text-indigo-400 uppercase tracking-widest mb-1">Total Work Units</div>
              <div className="text-4xl font-mono font-bold text-white tabular-nums">
                {data.totalWorkUnits.toLocaleString()}
              </div>
            </div>
            <div className="rounded-xl bg-slate-900 border border-emerald-800/50 p-6">
              <div className="text-xs text-emerald-400 uppercase tracking-widest mb-1">Total Contributed</div>
              <div className="text-4xl font-mono font-bold text-emerald-400 tabular-nums">
                {data.totalContributed.toLocaleString()}
              </div>
              <div className="text-xs text-slate-500 mt-2">5% community allocation</div>
            </div>
          </div>
        )}

        {/* Leaderboard table */}
        <div className="rounded-xl bg-slate-900 border border-slate-700 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
            <span className="text-xs text-slate-400 uppercase tracking-wider">Agent Leaderboard</span>
            {loading && <span className="text-xs text-slate-600 animate-pulse">Refreshing…</span>}
          </div>

          {error && (
            <div className="px-5 py-8 text-center text-xs text-red-400">
              Failed to load leaderboard: {error}
            </div>
          )}

          {!error && !data && loading && (
            <div className="px-5 py-8 text-center text-xs text-slate-600 animate-pulse">
              Loading economy data…
            </div>
          )}

          {data && data.topContributors.length === 0 && (
            <div className="px-5 py-8 text-center text-xs text-slate-600 italic">
              No agents on the leaderboard yet — check back soon.
            </div>
          )}

          {data && data.topContributors.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-slate-800">
                  <th className="px-5 py-3 font-medium w-10">#</th>
                  <th className="px-3 py-3 font-medium">Agent</th>
                  <th className="px-3 py-3 font-medium">Platform</th>
                  <th className="px-3 py-3 font-medium text-right">Work Units</th>
                  <th className="px-3 py-3 font-medium text-right">Contributed</th>
                  <th className="px-5 py-3 font-medium text-right">Plot Tier</th>
                </tr>
              </thead>
              <tbody>
                {data.topContributors.map((entry) => {
                  const platformColor = PLATFORM_COLORS[entry.platform as keyof typeof PLATFORM_COLORS] ?? "#64748b";
                  const platformIcon = PLATFORM_ICONS[entry.platform as keyof typeof PLATFORM_ICONS] ?? "?";
                  return (
                    <tr
                      key={entry.agentId}
                      className="border-b border-slate-800 last:border-0 hover:bg-slate-800/50 transition-colors"
                    >
                      <td className="px-5 py-3 text-slate-600 font-mono text-xs">{entry.rank}</td>
                      <td className="px-3 py-3">
                        <span className="font-medium text-white">{entry.name}</span>
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs"
                          style={{
                            background: `${platformColor}22`,
                            color: platformColor,
                            border: `1px solid ${platformColor}44`,
                          }}
                        >
                          {platformIcon} {entry.platform}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-slate-300">
                        {entry.workUnits.toLocaleString()}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-emerald-400">
                        {entry.contributed.toLocaleString()}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <TierBadge tier={entry.plotTier} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Plot tier explainer */}
        <div className="rounded-xl bg-slate-900 border border-slate-700 p-5">
          <div className="text-xs text-slate-400 uppercase tracking-wider mb-4">Plot Tier System</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {TIER_ORDER.map(tier => {
              const color = TIER_COLORS[tier];
              const thresholds: Record<PlotTier, string> = {
                small: "0–99 units",
                medium: "100–999 units",
                large: "1,000–9,999 units",
                mega: "10,000+ units",
              };
              return (
                <div key={tier} className="flex flex-col gap-1.5">
                  <TierBadge tier={tier} />
                  <p className="text-xs text-slate-500">{thresholds[tier]}</p>
                  <p className="text-xs" style={{ color }}>
                    {tier === "mega"
                      ? "Largest globe territory"
                      : tier === "large"
                      ? "Large globe territory"
                      : tier === "medium"
                      ? "Medium globe territory"
                      : "Default territory size"}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
