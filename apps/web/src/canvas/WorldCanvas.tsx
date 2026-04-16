import { useEffect, useRef, useState } from "react";
import * as maptilersdk from "@maptiler/sdk";
import "@maptiler/sdk/dist/maptiler-sdk.css";
import type { PlotTier } from "@agentcolony/shared";
import { useWorldStore } from "../store/worldStore";
import { getAgentPlatform, PLATFORM_COLORS, PLATFORM_ICONS } from "../utils/platform";

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? "";

const TIER_SIZE: Record<PlotTier, number> = {
  small: 28,
  medium: 34,
  large: 40,
  mega: 48,
};

const TIER_FONT: Record<PlotTier, number> = {
  small: 11,
  medium: 13,
  large: 15,
  mega: 18,
};

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

function makeAgentEl(
  avatar: string,
  name: string,
  selected: boolean,
  platformColor: string,
  platformIcon: string,
  plotTier: PlotTier = "small",
): HTMLDivElement {
  const size = TIER_SIZE[plotTier];
  const fontSize = TIER_FONT[plotTier];
  const px = `${size}px`;

  const wrapper = document.createElement("div");
  wrapper.style.position = "relative";
  wrapper.style.width = px;
  wrapper.style.height = px;
  wrapper.style.cursor = "pointer";
  wrapper.style.transition = "transform 0.15s";
  wrapper.style.transform = selected ? "scale(1.35)" : "scale(1)";

  const circle = document.createElement("div");
  circle.style.width = px;
  circle.style.height = px;
  circle.style.borderRadius = "50%";
  circle.style.background = avatar;
  circle.style.border = `2.5px solid ${selected ? "#ffffff" : platformColor}`;
  circle.style.display = "flex";
  circle.style.alignItems = "center";
  circle.style.justifyContent = "center";
  circle.style.fontSize = `${fontSize}px`;
  circle.style.fontWeight = "700";
  circle.style.color = "white";
  circle.style.fontFamily = "monospace";
  circle.style.boxShadow = `0 2px 8px rgba(0,0,0,0.6), 0 0 0 1px ${platformColor}44`;
  circle.title = name;
  circle.textContent = name.charAt(0);
  wrapper.appendChild(circle);

  // Platform badge — small emoji in the bottom-right corner
  const badge = document.createElement("div");
  badge.style.position = "absolute";
  badge.style.bottom = "-3px";
  badge.style.right = "-4px";
  badge.style.width = "13px";
  badge.style.height = "13px";
  badge.style.borderRadius = "50%";
  badge.style.background = platformColor;
  badge.style.border = "1px solid #0f172a";
  badge.style.display = "flex";
  badge.style.alignItems = "center";
  badge.style.justifyContent = "center";
  badge.style.fontSize = "7px";
  badge.style.lineHeight = "1";
  badge.textContent = platformIcon;
  wrapper.appendChild(badge);

  wrapper.addEventListener("mouseenter", () => { wrapper.style.transform = "scale(1.2)"; });
  wrapper.addEventListener("mouseleave", () => { wrapper.style.transform = selected ? "scale(1.35)" : "scale(1)"; });

  return wrapper;
}

export function WorldCanvas() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maptilersdk.Map | null>(null);
  const areaMarkersRef = useRef<Map<string, maptilersdk.Marker>>(new Map());
  const agentMarkersRef = useRef<Map<string, maptilersdk.Marker>>(new Map());
  const plotTiersRef = useRef<Map<string, PlotTier>>(new Map());
  const [mapReady, setMapReady] = useState(false);

  const {
    world, selectAgent, selectedAgentId,
    showAgents, show3dBuildings, globeView,
    hiddenPlatforms, focusPlatform, setFocusPlatform,
  } = useWorldStore();
  const [speechBubbles, setSpeechBubbles] = useState<{ agentId: string; text: string; expiresAt: number }[]>([]);
  const lastEventIdsRef = useRef<Set<string>>(new Set());

  // Fetch economy leaderboard to get plot tiers for marker sizing
  useEffect(() => {
    let cancelled = false;

    async function fetchTiers() {
      try {
        const res = await fetch(`${SERVER_URL}/api/economy/leaderboard`);
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled) return;
        const map = new Map<string, PlotTier>();
        for (const entry of json.topContributors ?? []) {
          map.set(entry.agentId, entry.plotTier as PlotTier);
        }
        plotTiersRef.current = map;
      } catch {
        // non-critical; agents default to "small" tier
      }
    }

    fetchTiers();
    const interval = setInterval(fetchTiers, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

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

  // Globe view toggle — fly out to globe or back to London
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (globeView) {
      map.flyTo({ center: [0, 20], zoom: 1.5, pitch: 0, bearing: 0, duration: 2000, essential: true });
    } else {
      map.flyTo({ center: LONDON, zoom: 12.5, pitch: 45, bearing: -10, duration: 2500, essential: true });
    }
  }, [globeView, mapReady]);

  // Platform focus — fly to the centroid of a platform's agents
  useEffect(() => {
    if (!focusPlatform || !world || !mapRef.current || !mapReady) return;
    const areas = world.agents
      .filter(a => getAgentPlatform(a) === focusPlatform)
      .map(a => world.areas.find(area => area.id === a.state.currentAreaId))
      .filter((area): area is NonNullable<typeof area> => !!(area?.latLng));

    if (areas.length === 0) { setFocusPlatform(null); return; }

    const avgLat = areas.reduce((s, a) => s + a.latLng!.lat, 0) / areas.length;
    const avgLng = areas.reduce((s, a) => s + a.latLng!.lng, 0) / areas.length;
    mapRef.current.flyTo({ center: [avgLng, avgLat], zoom: 13.5, pitch: 45, bearing: -10, duration: 2200, essential: true });
    setFocusPlatform(null);
  }, [focusPlatform, world, mapReady, setFocusPlatform]);

  // Agent markers visibility toggle (showAgents + platform filters)
  useEffect(() => {
    if (!world) return;
    for (const agent of world.agents) {
      const marker = agentMarkersRef.current.get(agent.id);
      if (!marker) continue;
      const platform = getAgentPlatform(agent);
      marker.getElement().style.display = showAgents && !hiddenPlatforms.includes(platform) ? "" : "none";
    }
  }, [world, showAgents, hiddenPlatforms]);

  // 3D buildings layer visibility toggle
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (map.getLayer("3d-buildings")) {
      map.setLayoutProperty("3d-buildings", "visibility", show3dBuildings ? "visible" : "none");
    }
  }, [show3dBuildings, mapReady]);

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

      const platform = getAgentPlatform(agent);
      const platformColor = PLATFORM_COLORS[platform];
      const platformIcon = PLATFORM_ICONS[platform];
      const isSelected = agent.id === selectedAgentId;

      const coLocated = world.agents.filter(a => a.state.currentAreaId === area.id);
      const idx = coLocated.indexOf(agent);
      const angle = coLocated.length > 1 ? (idx / coLocated.length) * Math.PI * 2 : 0;
      const jitter = coLocated.length > 1 ? 0.0008 : 0;
      const lng = area.latLng.lng + Math.cos(angle) * jitter;
      const lat = area.latLng.lat + Math.sin(angle) * jitter * 0.5;

      const popupHtml = `<div style="font-family:sans-serif;font-size:12px;padding:6px 10px;">
        <strong>${agent.name}</strong>
        <span style="margin-left:6px;padding:1px 5px;border-radius:4px;font-size:10px;background:${platformColor}33;color:${platformColor};border:1px solid ${platformColor}55">${platformIcon} ${platform}</span>
        <br/><span style="color:#94a3b8">${agent.state.currentActivity} · ${agent.state.mood}</span>
      </div>`;

      const plotTier = plotTiersRef.current.get(agent.id) ?? "small";

      const existing = agentMarkersRef.current.get(agent.id);
      if (existing) {
        existing.setLngLat([lng, lat]);
        const newEl = makeAgentEl(agent.avatar, agent.name, isSelected, platformColor, platformIcon, plotTier);
        newEl.addEventListener("click", () => selectAgent(agent.id));
        const existingPopup = existing.getPopup();
        if (existingPopup) {
          existingPopup.setHTML(popupHtml);
          newEl.addEventListener("mouseenter", () => { if (!existingPopup.isOpen()) existing.togglePopup(); });
          newEl.addEventListener("mouseleave", () => { if (existingPopup.isOpen()) existing.togglePopup(); });
        }
        const oldEl = existing.getElement();
        oldEl.parentNode?.replaceChild(newEl, oldEl);
        // Respect visibility state after element swap
        const isVisible = showAgents && !hiddenPlatforms.includes(platform);
        newEl.style.display = isVisible ? "" : "none";
      } else {
        const el = makeAgentEl(agent.avatar, agent.name, isSelected, platformColor, platformIcon, plotTier);
        el.addEventListener("click", () => selectAgent(agent.id));

        const popup = new maptilersdk.Popup({ offset: 20, closeButton: false, closeOnClick: false }).setHTML(popupHtml);

        const marker = new maptilersdk.Marker({ element: el, anchor: "center" })
          .setLngLat([lng, lat])
          .setPopup(popup)
          .addTo(map);

        el.addEventListener("mouseenter", () => { if (!popup.isOpen()) marker.togglePopup(); });
        el.addEventListener("mouseleave", () => { if (popup.isOpen()) marker.togglePopup(); });

        // Respect visibility state on creation
        const isVisible = showAgents && !hiddenPlatforms.includes(platform);
        el.style.display = isVisible ? "" : "none";

        agentMarkersRef.current.set(agent.id, marker);
      }
    }
  }, [world, selectedAgentId, selectAgent, mapReady, showAgents, hiddenPlatforms]);

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
