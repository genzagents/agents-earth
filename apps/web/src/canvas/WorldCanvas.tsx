import { useEffect, useRef } from "react";
import { Application, Graphics, Text, TextStyle, Container } from "pixi.js";
import type { WorldState, Area, Agent } from "@agentcolony/shared";
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

export function WorldCanvas() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const { world, selectAgent, selectedAgentId } = useWorldStore();
  const worldRef = useRef<WorldState | null>(null);

  // Keep ref in sync
  useEffect(() => {
    worldRef.current = world;
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

    app.stage.removeChildren();

    const worldContainer = new Container();
    app.stage.addChild(worldContainer);

    // Draw areas
    for (const area of world.areas) {
      const g = new Graphics();
      const color = AREA_COLORS[area.type] ?? 0x334155;
      const radius = 40 + area.capacity;

      g.circle(0, 0, radius);
      g.fill({ color, alpha: 0.4 });
      g.stroke({ color, width: 2, alpha: 0.8 });

      g.x = area.position.x;
      g.y = area.position.y;
      worldContainer.addChild(g);

      const label = new Text({
        text: area.name,
        style: new TextStyle({
          fontSize: 10,
          fill: 0xd1d5db,
          fontFamily: "monospace",
        }),
      });
      label.x = area.position.x - label.width / 2;
      label.y = area.position.y + radius + 4;
      worldContainer.addChild(label);
    }

    // Draw agents
    for (const agent of world.agents) {
      const area = world.areas.find(a => a.id === agent.state.currentAreaId);
      if (!area) continue;

      // Spread agents around their area
      const idx = world.agents.indexOf(agent);
      const angle = (idx / world.agents.length) * Math.PI * 2;
      const spread = 25;
      const ax = area.position.x + Math.cos(angle) * spread;
      const ay = area.position.y + Math.sin(angle) * spread;

      const g = new Graphics();
      const color = parseInt(agent.avatar.replace("#", ""), 16);
      const isSelected = agent.id === selectedAgentId;

      g.circle(0, 0, isSelected ? 10 : 7);
      g.fill({ color });

      if (isSelected) {
        g.circle(0, 0, 14);
        g.stroke({ color: 0xfbbf24, width: 2 });
      }

      g.x = ax;
      g.y = ay;
      g.eventMode = "static";
      g.cursor = "pointer";
      g.on("pointerdown", () => selectAgent(agent.id));
      worldContainer.addChild(g);

      // Mood indicator dot
      const moodColors: Record<string, number> = {
        thriving: 0x22c55e,
        content: 0x60a5fa,
        struggling: 0xf59e0b,
        critical: 0xef4444,
      };
      const mood = new Graphics();
      mood.circle(0, 0, 3);
      mood.fill({ color: moodColors[agent.state.mood] ?? 0xffffff });
      mood.x = ax + 8;
      mood.y = ay - 8;
      worldContainer.addChild(mood);
    }
  }, [world, selectedAgentId, selectAgent]);

  return (
    <div
      ref={canvasRef}
      className="w-full h-full bg-slate-900 rounded-lg overflow-hidden"
    />
  );
}
