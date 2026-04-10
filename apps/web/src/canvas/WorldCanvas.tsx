import { useEffect, useRef, useState } from "react";
import * as maptilersdk from "@maptiler/sdk";
import "@maptiler/sdk/dist/maptiler-sdk.css";
import { useWorldStore } from "../store/worldStore";

maptilersdk.config.apiKey = "1VCJ1EgPTE2txzvkUYAU";

const LONDON: [number, number] = [-0.0918, 51.5074];

const AREA_EMOJIS: Record<string, string> = {
  park: "🌳",
  library: "📚",
  cafe: "☕",
  home: "🏠",
  studio: "🎨",
  market: "🛒",
  plaza: "🏛️",
  museum: "🖼️",
};

const MOOD_COLORS: Record<string, string> = {
  thriving: "#22c55e",
  content: "#60a5fa",
  struggling: "#f59e0b",
  critical: "#ef4444",
};

function makeAreaEl(emoji: string): HTMLDivElement {
  const el = document.createElement("div");
  el.style.width = "36px";
  el.style.height = "36px";
  el.style.borderRadius = "50%";
  el.style.cursor = "pointer";
  el.style.background = "#1e293baa";
  el.style.border = "1.5px solid #475569";
  el.style.display = "flex";
  el.style.alignItems = "center";
  el.style.justifyContent = "center";
  el.style.fontSize = "16px";
  el.style.transition = "transform 0.15s";
  el.style.boxShadow = "0 0 10px rgba(0,0,0,0.5)";
  el.textContent = emoji;
  el.addEventListener("mouseenter", () => { el.style.transform = "scale(1.2)"; });
  el.addEventListener("mouseleave", () => { el.style.transform = "scale(1)"; });
  return el;
}

function makeAgentEl(avatar: string, moodColor: string, name: string, selected: boolean): HTMLDivElement {
  const el = document.createElement("div");
  el.style.width = "28px";
  el.style.height = "28px";
  el.style.borderRadius = "50%";
  el.style.cursor = "pointer";
  el.style.background = avatar;
  el.style.border = "2.5px solid " + (selected ? "#ffffff" : moodColor);
  el.style.display = "flex";
  el.style.alignItems = "center";
  el.style.justifyContent = "center";
  el.style.fontSize = "11px";
  el.style.fontWeight = "700";
  el.style.color = "white";
  el.style.fontFamily = "monospace";
  el.style.boxShadow = "0 2px 8px rgba(0,0,0,0.6)";
  el.style.transition = "transform 0.15s";
  el.style.transform = selected ? "scale(1.35)" : "scale(1)";
  el.title = name;
  el.textContent = name.charAt(0);
  return el;
}

export function WorldCanvas() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maptilersdk.Map | null>(null);
  const areaMarkersRef = useRef<Map<string, maptilersdk.Marker>>(new Map());
  const agentMarkersRef = useRef<Map<string, maptilersdk.Marker>>(new Map());
  const [mapReady, setMapReady] = useState(false);

  const { world, selectAgent, selectedAgentId } = useWorldStore();
  const [speechBubbles, setSpeechBubbles] = useState<{ agentId: string; text: string; expiresAt: number }[]>([]);
  const lastEventIdsRef = useRef<Set<string>>(new Set());

  // Init MapTiler map once
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maptilersdk.Map({
      container: mapContainerRef.current,
      style: maptilersdk.MapStyle.STREETS_V2,
      center: [0, 20],
      zoom: 1.5,
      pitch: 40,
    });

    mapRef.current = map;

    map.on("load", () => {
      if (map.getSource("openmaptiles")) {
        map.addLayer({
          id: "3d-buildings",
          source: "openmaptiles",
          "source-layer": "building",
          type: "fill-extrusion",
          minzoom: 14,
          paint: {
            "fill-extrusion-color": "#1e293b",
            "fill-extrusion-height": ["get", "render_height"],
            "fill-extrusion-base": ["get", "render_min_height"],
            "fill-extrusion-opacity": 0.7,
          },
        });
      }

      setMapReady(true);

      // Globe -> London fly-in animation
      setTimeout(() => {
        map.flyTo({ center: LONDON, zoom: 12.5, pitch: 45, bearing: -10, duration: 3500, essential: true });
      }, 600);
    });

    return () => {
      mapRef.current = null;
      map.remove();
    };
  }, []);

  // Sync area markers when map is ready and world data arrives
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !world) return;

    const currentAreaIds = new Set(world.areas.map(a => a.id));
    for (const [id, marker] of areaMarkersRef.current) {
      if (!currentAreaIds.has(id)) { marker.remove(); areaMarkersRef.current.delete(id); }
    }

    for (const area of world.areas) {
      if (!area.latLng || areaMarkersRef.current.has(area.id)) continue;
      const emoji = AREA_EMOJIS[area.type] ?? "📍";
      const el = makeAreaEl(emoji);

      const popup = new maptilersdk.Popup({ offset: 25, closeButton: false, closeOnClick: false }).setHTML(
        `<div style="font-family:sans-serif;font-size:12px;padding:6px 10px;">${emoji} <strong>${area.name}</strong><br/><span style="color:#94a3b8">${area.type}</span></div>`
      );

      const marker = new maptilersdk.Marker({ element: el, anchor: "center" })
        .setLngLat([area.latLng.lng, area.latLng.lat])
        .setPopup(popup)
        .addTo(map);

      // Show popup on hover
      el.addEventListener("mouseenter", () => { if (!popup.isOpen()) marker.togglePopup(); });
      el.addEventListener("mouseleave", () => { if (popup.isOpen()) marker.togglePopup(); });

      areaMarkersRef.current.set(area.id, marker);
    }
  }, [world, mapReady]);

  // Sync agent markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !world) return;

    const currentAgentIds = new Set(world.agents.map(a => a.id));
    for (const [id, marker] of agentMarkersRef.current) {
      if (!currentAgentIds.has(id)) { marker.remove(); agentMarkersRef.current.delete(id); }
    }

    for (const agent of world.agents) {
      const area = world.areas.find(a => a.id === agent.state.currentAreaId);
      if (!area?.latLng) continue;

      const moodColor = MOOD_COLORS[agent.state.mood] ?? "#94a3b8";
      const isSelected = agent.id === selectedAgentId;

      const coLocated = world.agents.filter(a => a.state.currentAreaId === area.id);
      const idx = coLocated.indexOf(agent);
      const angle = coLocated.length > 1 ? (idx / coLocated.length) * Math.PI * 2 : 0;
      const jitter = coLocated.length > 1 ? 0.0008 : 0;
      const lng = area.latLng.lng + Math.cos(angle) * jitter;
      const lat = area.latLng.lat + Math.sin(angle) * jitter * 0.5;

      const existing = agentMarkersRef.current.get(agent.id);
      if (existing) {
        existing.setLngLat([lng, lat]);
        const newEl = makeAgentEl(agent.avatar, moodColor, agent.name, isSelected);
        newEl.addEventListener("click", () => selectAgent(agent.id));
        const existingPopup = existing.getPopup();
        if (existingPopup) {
          existingPopup.setHTML(
            `<div style="font-family:sans-serif;font-size:12px;padding:6px 10px;"><strong>${agent.name}</strong><br/><span style="color:#94a3b8">${agent.state.currentActivity} · ${agent.state.mood}</span></div>`
          );
          newEl.addEventListener("mouseenter", () => { if (!existingPopup.isOpen()) existing.togglePopup(); });
          newEl.addEventListener("mouseleave", () => { if (existingPopup.isOpen()) existing.togglePopup(); });
        }
        const oldEl = existing.getElement();
        oldEl.parentNode?.replaceChild(newEl, oldEl);
      } else {
        const el = makeAgentEl(agent.avatar, moodColor, agent.name, isSelected);
        el.addEventListener("click", () => selectAgent(agent.id));

        const popup = new maptilersdk.Popup({ offset: 20, closeButton: false, closeOnClick: false }).setHTML(
          `<div style="font-family:sans-serif;font-size:12px;padding:6px 10px;"><strong>${agent.name}</strong><br/><span style="color:#94a3b8">${agent.state.currentActivity} · ${agent.state.mood}</span></div>`
        );

        const marker = new maptilersdk.Marker({ element: el, anchor: "center" })
          .setLngLat([lng, lat])
          .setPopup(popup)
          .addTo(map);

        // Hover to preview, click to select
        el.addEventListener("mouseenter", () => { if (!popup.isOpen()) marker.togglePopup(); });
        el.addEventListener("mouseleave", () => { if (popup.isOpen()) marker.togglePopup(); });

        agentMarkersRef.current.set(agent.id, marker);
      }
    }
  }, [world, selectedAgentId, selectAgent, mapReady]);

  // Detect new social events for speech bubbles
  useEffect(() => {
    if (!world) return;
    const newBubbles: { agentId: string; text: string; expiresAt: number }[] = [];
    for (const event of world.recentEvents) {
      if (event.kind === "social" && !lastEventIdsRef.current.has(event.id)) {
        const [agentId] = event.involvedAgentIds;
        if (agentId) {
          const text = event.description.length > 80 ? event.description.slice(0, 79) + "…" : event.description;
          newBubbles.push({ agentId, text, expiresAt: Date.now() + 4000 });
        }
      }
    }
    lastEventIdsRef.current = new Set(world.recentEvents.map(e => e.id));
    if (newBubbles.length > 0) {
      setSpeechBubbles(prev => [...prev.filter(b => b.expiresAt > Date.now()), ...newBubbles].slice(-3));
    }
  }, [world]);

  useEffect(() => {
    if (speechBubbles.length === 0) return;
    const earliest = Math.min(...speechBubbles.map(b => b.expiresAt));
    const timer = setTimeout(
      () => setSpeechBubbles(prev => prev.filter(b => b.expiresAt > Date.now())),
      Math.max(0, earliest - Date.now())
    );
    return () => clearTimeout(timer);
  }, [speechBubbles]);

  const activeBubbles = speechBubbles.filter(b => b.expiresAt > Date.now());

  return (
    <div className="relative w-full h-full rounded-lg overflow-hidden">
      <div ref={mapContainerRef} className="w-full h-full" />

      {activeBubbles.map(bubble => {
        const agent = world?.agents.find(a => a.id === bubble.agentId);
        if (!agent) return null;
        return (
          <div
            key={bubble.agentId + bubble.expiresAt}
            className="absolute bottom-4 left-4 max-w-xs bg-slate-800/90 border border-slate-600 rounded-lg px-3 py-2 text-xs text-white shadow-lg pointer-events-none"
          >
            <span className="font-semibold text-blue-300">{agent.name}: </span>
            {bubble.text}
          </div>
        );
      })}

      {!world && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/60 pointer-events-none">
          <div className="text-center">
            <div className="text-4xl mb-3">🌍</div>
            <p className="text-white font-semibold text-sm">AgentColony</p>
            <p className="text-slate-400 text-xs mt-1">Waking up the agents...</p>
          </div>
        </div>
      )}
    </div>
  );
}
