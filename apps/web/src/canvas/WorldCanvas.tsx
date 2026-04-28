import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { WorldState } from "@agentcolony/shared";
import { useWorldStore } from "../store/worldStore";

// Real London lat/lng for each area — mapped to actual locations
const AREA_LATLNG: Record<string, [number, number]> = {
  "Hyde Park":         [51.5073, -0.1657],
  "British Library":   [51.5298, -0.1272],
  "Bloomsbury Cafe":   [51.5220, -0.1270],
  "Shoreditch Studio": [51.5254, -0.0785],
  "Hackney Quarter":   [51.5450, -0.0553],
  "Tate Modern":       [51.5076, -0.0994],
  "Southbank Plaza":   [51.5052, -0.1145],
  "Borough Market":    [51.5055, -0.0908],
};

const AREA_COLORS: Record<string, string> = {
  park:    "#166534",
  library: "#1e40af",
  cafe:    "#92400e",
  home:    "#374151",
  studio:  "#6d28d9",
  market:  "#b45309",
  plaza:   "#0f766e",
  museum:  "#9f1239",
};

const AREA_ICONS: Record<string, string> = {
  park:    "🌳",
  library: "📚",
  cafe:    "☕",
  home:    "🏠",
  studio:  "🎨",
  market:  "🛒",
  plaza:   "🏛",
  museum:  "🖼",
};

const MOOD_COLORS: Record<string, string> = {
  thriving:   "#22c55e",
  content:    "#60a5fa",
  struggling: "#f59e0b",
  critical:   "#ef4444",
};

// Fix Leaflet default marker icons (broken in Vite builds)
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

interface AgentMarker {
  marker: L.Marker;
  agentId: string;
}

interface AreaCircle {
  circle: L.Circle;
  label: L.Marker;
  areaName: string;
}

export function WorldCanvas() {
  const { world, connected, selectAgent, selectedAgentId } = useWorldStore();
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const agentMarkersRef = useRef<Map<string, AgentMarker>>(new Map());
  const areaCirclesRef = useRef<Map<string, AreaCircle>>(new Map());
  const [speechBubbles, setSpeechBubbles] = useState<{ agentId: string; text: string; expiresAt: number }[]>([]);
  const lastWorldRef = useRef<WorldState | null>(null);

  // Init Leaflet map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [51.505, -0.09],
      zoom: 13,
      zoomControl: true,
      attributionControl: true,
    });

    // OpenStreetMap tile layer — no API key needed
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Detect new speech bubbles
  useEffect(() => {
    if (!world) return;
    const prev = lastWorldRef.current;
    const prevIds = new Set(prev?.recentEvents.map(e => e.id) ?? []);
    const newBubbles: { agentId: string; text: string; expiresAt: number }[] = [];

    for (const event of world.recentEvents) {
      if (event.kind === "social" && !prevIds.has(event.id)) {
        const [agentId] = event.involvedAgentIds;
        if (agentId) {
          const text = event.description.length > 80
            ? event.description.slice(0, 79) + "…"
            : event.description;
          newBubbles.push({ agentId, text, expiresAt: Date.now() + 4000 });
        }
      }
    }

    if (newBubbles.length > 0) {
      setSpeechBubbles(prev => [...prev, ...newBubbles].slice(-3));
    }
    lastWorldRef.current = world;
  }, [world]);

  // Clear expired speech bubbles
  useEffect(() => {
    if (speechBubbles.length === 0) return;
    const nearest = Math.min(...speechBubbles.map(b => b.expiresAt));
    const timer = setTimeout(() => {
      setSpeechBubbles(prev => prev.filter(b => b.expiresAt > Date.now()));
    }, nearest - Date.now() + 50);
    return () => clearTimeout(timer);
  }, [speechBubbles]);

  // Update map markers on world tick
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !world) return;

    // --- Area circles ---
    const seenAreaNames = new Set<string>();
    for (const area of world.areas) {
      const latlng = AREA_LATLNG[area.name];
      if (!latlng) continue;
      seenAreaNames.add(area.name);

      const color = AREA_COLORS[area.type] ?? "#334155";
      const radius = 120 + Math.sqrt(area.capacity) * 15; // metres
      const hasOccupants = area.currentOccupants.length > 0;
      const icon = AREA_ICONS[area.type] ?? "·";

      const existing = areaCirclesRef.current.get(area.name);
      if (existing) {
        existing.circle.setStyle({
          color,
          fillColor: color,
          fillOpacity: hasOccupants ? 0.22 : 0.1,
          opacity: hasOccupants ? 0.9 : 0.5,
          weight: hasOccupants ? 2 : 1,
        });
      } else {
        const circle = L.circle(latlng, {
          radius,
          color,
          fillColor: color,
          fillOpacity: hasOccupants ? 0.22 : 0.1,
          opacity: hasOccupants ? 0.9 : 0.5,
          weight: hasOccupants ? 2 : 1,
        }).addTo(map);

        // Label as a divIcon marker at the area centre
        const labelIcon = L.divIcon({
          className: "",
          html: `<div style="
            background: rgba(15,23,42,0.82);
            color: #e2e8f0;
            border: 1px solid ${color}55;
            border-radius: 6px;
            padding: 2px 7px;
            font-size: 11px;
            font-family: system-ui, sans-serif;
            white-space: nowrap;
            pointer-events: none;
          ">${icon} ${area.name}${hasOccupants ? ` <span style="color:#fbbf24">${area.currentOccupants.length}</span>` : ""}</div>`,
          iconAnchor: [0, 0],
        });
        const label = L.marker([latlng[0] - 0.0008, latlng[1]], {
          icon: labelIcon,
          interactive: false,
        }).addTo(map);

        areaCirclesRef.current.set(area.name, { circle, label, areaName: area.name });
      }

      // Update label HTML to reflect occupant count
      const entry = areaCirclesRef.current.get(area.name);
      if (entry) {
        const labelIcon = L.divIcon({
          className: "",
          html: `<div style="
            background: rgba(15,23,42,0.82);
            color: #e2e8f0;
            border: 1px solid ${color}55;
            border-radius: 6px;
            padding: 2px 7px;
            font-size: 11px;
            font-family: system-ui, sans-serif;
            white-space: nowrap;
            pointer-events: none;
          ">${icon} ${area.name}${hasOccupants ? ` <span style="color:#fbbf24">${area.currentOccupants.length}</span>` : ""}</div>`,
          iconAnchor: [0, 0],
        });
        entry.label.setIcon(labelIcon);
      }
    }

    // --- Agent markers ---
    const seenAgentIds = new Set<string>();
    for (const agent of world.agents) {
      const area = world.areas.find(a => a.id === agent.state.currentAreaId);
      if (!area) continue;
      const baseLatlng = AREA_LATLNG[area.name];
      if (!baseLatlng) continue;
      seenAgentIds.add(agent.id);

      // Spread agents in a small circle within their area
      const groupInArea = world.agents.filter(a => a.state.currentAreaId === area.id);
      const idx = groupInArea.findIndex(a => a.id === agent.id);
      const total = groupInArea.length;
      const angle = total > 1 ? (idx / total) * Math.PI * 2 : 0;
      const spread = total > 1 ? 0.0004 : 0;
      const agentLat = baseLatlng[0] + Math.cos(angle) * spread;
      const agentLng = baseLatlng[1] + Math.sin(angle) * spread;

      const isSelected = agent.id === selectedAgentId;
      const color = agent.avatar.startsWith("#") ? agent.avatar : "#7c3aed";
      const moodColor = MOOD_COLORS[agent.state.mood] ?? "#ffffff";
      const firstName = agent.name.split(" ")[0];
      const bubble = speechBubbles.find(b => b.agentId === agent.id);

      const agentIcon = L.divIcon({
        className: "",
        html: `<div style="position:relative; text-align:center;">
          ${bubble ? `<div style="
            position: absolute;
            bottom: 38px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(15,23,42,0.95);
            color: #f1f5f9;
            border: 1px solid ${color};
            border-radius: 8px;
            padding: 4px 8px;
            font-size: 10px;
            font-family: system-ui;
            white-space: nowrap;
            max-width: 160px;
            overflow: hidden;
            text-overflow: ellipsis;
            pointer-events: none;
            z-index: 1000;
          "><b style="color:${color}">${firstName}</b><br>${bubble.text}</div>` : ""}
          <div style="
            width: ${isSelected ? 22 : 16}px;
            height: ${isSelected ? 22 : 16}px;
            border-radius: 50%;
            background: ${color};
            border: ${isSelected ? `3px solid #fbbf24` : `2px solid rgba(255,255,255,0.4)`};
            box-shadow: 0 0 ${isSelected ? 10 : 4}px ${color}88;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
          "></div>
          <div style="
            width: 6px; height: 6px;
            border-radius: 50%;
            background: ${moodColor};
            margin: -4px auto 0;
            border: 1px solid rgba(0,0,0,0.4);
          "></div>
          ${isSelected ? `<div style="
            font-size: 9px;
            color: #fbbf24;
            font-family: system-ui;
            margin-top: 2px;
            white-space: nowrap;
            text-shadow: 0 1px 3px rgba(0,0,0,0.9);
          ">${firstName}</div>` : ""}
        </div>`,
        iconSize: [isSelected ? 22 : 16, isSelected ? 22 : 16],
        iconAnchor: [isSelected ? 11 : 8, isSelected ? 11 : 8],
      });

      const existing = agentMarkersRef.current.get(agent.id);
      if (existing) {
        existing.marker.setLatLng([agentLat, agentLng]);
        existing.marker.setIcon(agentIcon);
      } else {
        const marker = L.marker([agentLat, agentLng], {
          icon: agentIcon,
          zIndexOffset: isSelected ? 1000 : 0,
        }).addTo(map);
        marker.on("click", () => selectAgent(agent.id));
        agentMarkersRef.current.set(agent.id, { marker, agentId: agent.id });
      }
    }

    // Remove markers for agents no longer in world
    for (const [id, { marker }] of agentMarkersRef.current) {
      if (!seenAgentIds.has(id)) {
        marker.remove();
        agentMarkersRef.current.delete(id);
      }
    }

  }, [world, selectedAgentId, speechBubbles, selectAgent]);

  return (
    <div className="w-full h-full relative">
      {/* Leaflet map fills the container */}
      <div ref={containerRef} className="w-full h-full" />

      {/* Loading overlay */}
      {!world && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950/80 z-[1000]">
          <div className="text-3xl animate-pulse">🌍</div>
          <p className="text-slate-300 text-sm">
            {connected ? "Loading world…" : "Connecting to colony…"}
          </p>
        </div>
      )}
    </div>
  );
}
