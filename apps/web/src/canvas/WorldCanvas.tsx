import { useEffect, useRef } from "react";
import { Application, Graphics, Text, TextStyle, Container } from "pixi.js";
import type { WorldState } from "@agentcolony/shared";
import { useWorldStore } from "../store/worldStore";

const AREA_COLORS: Record<string, number> = {
  park: 0x166534,
  library: 0x1e40af,
  cafe: 0x92400e,
  home: 0x374151,
  studio: 0x6d28d9,
  market: 0xb45309,
  plaza: 0x0f766e,
  museum: 0x9f1239,
};

const AREA_ICONS: Record<string, string> = {
  park: "🌳",
  library: "📚",
  cafe: "☕",
  home: "🏠",
  studio: "🎨",
  market: "🛒",
  plaza: "🏛",
  museum: "🖼",
};

const MOOD_COLORS: Record<string, number> = {
  thriving: 0x22c55e,
  content: 0x60a5fa,
  struggling: 0xf59e0b,
  critical: 0xef4444,
};

// Speech bubble display state (shown briefly after social events)
interface SpeechBubble {
  agentId: string;
  text: string;
  expiresAt: number;
}

const speechBubbles: Map<string, SpeechBubble> = new Map();

export function WorldCanvas() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const { world, selectAgent, selectedAgentId } = useWorldStore();
  const lastWorldRef = useRef<WorldState | null>(null);

  // Detect new social events and create speech bubbles
  useEffect(() => {
    if (!world) return;
    const prev = lastWorldRef.current;

    // Find new social events
    const prevEventIds = new Set(prev?.recentEvents.map(e => e.id) ?? []);
    for (const event of world.recentEvents) {
      if (event.kind === "social" && !prevEventIds.has(event.id)) {
        const [agentId] = event.involvedAgentIds;
        if (agentId) {
          // Extract short version of description for bubble
          const words = event.description.split(" ");
          const short = words.slice(0, 6).join(" ") + (words.length > 6 ? "…" : "");
          speechBubbles.set(agentId, {
            agentId,
            text: short,
            expiresAt: Date.now() + 3500,
          });
        }
      }
    }

    lastWorldRef.current = world;
  }, [world]);

  // Init PixiJS once
  useEffect(() => {
    if (!canvasRef.current) return;

    const app = new Application();
    appRef.current = app;

    app.init({
      width: canvasRef.current.clientWidth || 900,
      height: canvasRef.current.clientHeight || 600,
      backgroundColor: 0x0f172a,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
    }).then(() => {
      canvasRef.current?.appendChild(app.canvas);
    });

    return () => {
      app.destroy(true);
      appRef.current = null;
    };
  }, []);

  // Render world state
  useEffect(() => {
    const app = appRef.current;
    if (!app || !world) return;

    // Don't re-init if stage not ready yet
    if (!app.stage) return;

    app.stage.removeChildren();

    const worldContainer = new Container();
    app.stage.addChild(worldContainer);

    // Draw areas
    for (const area of world.areas) {
      const color = AREA_COLORS[area.type] ?? 0x334155;
      const radius = 38 + Math.sqrt(area.capacity) * 3;
      const occupantCount = area.currentOccupants.length;

      // Area circle
      const g = new Graphics();
      g.circle(0, 0, radius);
      g.fill({ color, alpha: occupantCount > 0 ? 0.55 : 0.3 });
      g.stroke({ color, width: occupantCount > 0 ? 2.5 : 1.5, alpha: 0.9 });
      g.x = area.position.x;
      g.y = area.position.y;
      worldContainer.addChild(g);

      // Area name label
      const icon = AREA_ICONS[area.type] ?? "·";
      const label = new Text({
        text: `${icon} ${area.name}`,
        style: new TextStyle({
          fontSize: 10,
          fill: 0xd1d5db,
          fontFamily: "system-ui, sans-serif",
        }),
      });
      label.x = area.position.x - label.width / 2;
      label.y = area.position.y + radius + 5;
      worldContainer.addChild(label);

      // Occupant count badge
      if (occupantCount > 0) {
        const badge = new Text({
          text: `${occupantCount}`,
          style: new TextStyle({ fontSize: 9, fill: 0xfbbf24, fontFamily: "monospace" }),
        });
        badge.x = area.position.x + radius - 6;
        badge.y = area.position.y - radius - 2;
        worldContainer.addChild(badge);
      }
    }

    // Draw agents — group by area for proper spreading
    const agentsByArea: Record<string, typeof world.agents> = {};
    for (const agent of world.agents) {
      const id = agent.state.currentAreaId;
      (agentsByArea[id] ??= []).push(agent);
    }

    const now = Date.now();

    for (const agent of world.agents) {
      const area = world.areas.find(a => a.id === agent.state.currentAreaId);
      if (!area) continue;

      const groupInArea = agentsByArea[area.id] ?? [];
      const idx = groupInArea.indexOf(agent);
      const total = groupInArea.length;
      const angle = total > 1 ? (idx / total) * Math.PI * 2 : 0;
      const spread = total > 1 ? 22 : 0;
      const ax = area.position.x + Math.cos(angle) * spread;
      const ay = area.position.y + Math.sin(angle) * spread;

      const isSelected = agent.id === selectedAgentId;
      const color = parseInt(agent.avatar.replace("#", ""), 16);

      // Selection glow ring
      if (isSelected) {
        const glow = new Graphics();
        glow.circle(0, 0, 16);
        glow.fill({ color: 0xfbbf24, alpha: 0.15 });
        glow.stroke({ color: 0xfbbf24, width: 2, alpha: 0.9 });
        glow.x = ax;
        glow.y = ay;
        worldContainer.addChild(glow);
      }

      // Agent dot
      const agentG = new Graphics();
      agentG.circle(0, 0, isSelected ? 9 : 7);
      agentG.fill({ color });
      agentG.x = ax;
      agentG.y = ay;
      agentG.eventMode = "static";
      agentG.cursor = "pointer";
      agentG.on("pointerdown", () => selectAgent(agent.id));
      worldContainer.addChild(agentG);

      // Mood dot
      const moodDot = new Graphics();
      moodDot.circle(0, 0, 3);
      moodDot.fill({ color: MOOD_COLORS[agent.state.mood] ?? 0xffffff });
      moodDot.x = ax + 9;
      moodDot.y = ay - 9;
      worldContainer.addChild(moodDot);

      // Name label for selected agent
      if (isSelected) {
        const nameLabel = new Text({
          text: agent.name.split(" ")[0],
          style: new TextStyle({ fontSize: 10, fill: 0xfbbf24, fontFamily: "system-ui" }),
        });
        nameLabel.x = ax - nameLabel.width / 2;
        nameLabel.y = ay + 12;
        worldContainer.addChild(nameLabel);
      }

      // Speech bubble
      const bubble = speechBubbles.get(agent.id);
      if (bubble && bubble.expiresAt > now) {
        const remaining = (bubble.expiresAt - now) / 3500;
        const alpha = remaining > 0.8 ? 1 : remaining / 0.8;

        // Bubble background
        const bg = new Graphics();
        const bw = 120;
        const bh = 22;
        bg.roundRect(-bw / 2, -bh - 20, bw, bh, 4);
        bg.fill({ color: 0x1e293b, alpha: alpha * 0.9 });
        bg.stroke({ color: 0x475569, width: 1, alpha });
        bg.x = ax;
        bg.y = ay;
        worldContainer.addChild(bg);

        const bubbleText = new Text({
          text: bubble.text,
          style: new TextStyle({ fontSize: 9, fill: 0xe2e8f0, fontFamily: "system-ui", wordWrap: true, wordWrapWidth: 110 }),
        });
        bubbleText.alpha = alpha;
        bubbleText.x = ax - 55;
        bubbleText.y = ay - bh - 18;
        worldContainer.addChild(bubbleText);
      } else if (bubble && bubble.expiresAt <= now) {
        speechBubbles.delete(agent.id);
      }
    }
  }, [world, selectedAgentId, selectAgent]);

  return (
    <div
      ref={canvasRef}
      className="w-full h-full bg-slate-900 rounded-lg overflow-hidden"
    />
  );
}
