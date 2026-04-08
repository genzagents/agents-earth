import { useWorldStore } from "../store/worldStore";

const KIND_ICONS: Record<string, string> = {
  movement: "→",
  social: "💬",
  creation: "✦",
  mood_change: "◉",
  experience: "★",
};

export function EventFeed() {
  const world = useWorldStore(s => s.world);

  if (!world) return null;

  const events = world.recentEvents.slice(0, 10);

  return (
    <div className="p-3 space-y-1 overflow-y-auto">
      <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Recent Events</div>
      {events.length === 0 && (
        <div className="text-xs text-gray-600">No events yet...</div>
      )}
      {events.map(event => (
        <div key={event.id} className="text-xs text-gray-400 flex gap-2">
          <span className="text-gray-600 flex-shrink-0">
            {KIND_ICONS[event.kind] ?? "·"}
          </span>
          <span>{event.description}</span>
        </div>
      ))}
    </div>
  );
}
