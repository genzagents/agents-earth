import { useEffect, useRef, useState } from "react";
import { useWorldStore } from "../store/worldStore";
import type { WorldEvent } from "@agentcolony/shared";

type FilterKind = "all" | WorldEvent["kind"];

const KIND_ICONS: Record<WorldEvent["kind"], string> = {
  movement: "→",
  social: "💬",
  creation: "✦",
  mood_change: "◉",
  legacy: "·",
};

const KIND_LABELS: Record<WorldEvent["kind"] | "all", string> = {
  all: "All",
  social: "Social",
  movement: "Move",
  creation: "Create",
  mood_change: "Mood",
  legacy: "Other",
};

const KIND_COLORS: Record<WorldEvent["kind"], string> = {
  social: "text-blue-400",
  movement: "text-slate-400",
  creation: "text-purple-400",
  mood_change: "text-amber-400",
  legacy: "text-gray-600",
};

const FILTERS: FilterKind[] = ["all", "social", "movement", "creation", "mood_change"];

export function TimelinePanel() {
  const world = useWorldStore(s => s.world);
  const [filter, setFilter] = useState<FilterKind>("all");
  const historyRef = useRef<WorldEvent[]>([]);
  const seenIdsRef = useRef<Set<string>>(new Set());

  // Accumulate events across ticks (keep latest 100)
  useEffect(() => {
    if (!world) return;
    let added = false;
    for (const event of world.recentEvents) {
      if (!seenIdsRef.current.has(event.id)) {
        seenIdsRef.current.add(event.id);
        historyRef.current.unshift(event);
        added = true;
      }
    }
    if (added) {
      historyRef.current = historyRef.current.slice(0, 100);
    }
  }, [world]);

  const events = filter === "all"
    ? historyRef.current
    : historyRef.current.filter(e => e.kind === filter);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-slate-800 flex-shrink-0">
        <span className="text-xs text-gray-500 uppercase tracking-wider mr-1">Timeline</span>
        {FILTERS.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-xs px-1.5 py-0.5 rounded transition-colors ${
              filter === f
                ? "bg-slate-700 text-white"
                : "text-gray-600 hover:text-gray-400"
            }`}
          >
            {KIND_LABELS[f]}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {events.length === 0 && (
          <div className="text-xs text-gray-700 italic pt-1">No events yet...</div>
        )}
        {events.map(event => (
          <div key={event.id} className="flex gap-2 text-xs">
            <span className={`flex-shrink-0 w-4 text-center ${KIND_COLORS[event.kind] ?? "text-gray-600"}`}>
              {KIND_ICONS[event.kind] ?? "·"}
            </span>
            <span className="text-gray-400 leading-relaxed">{event.description}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
