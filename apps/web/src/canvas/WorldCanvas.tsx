import { useEffect, useRef, useState } from "react";
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

// London district background regions — defined as fractions of canvas size
const LONDON_DISTRICT_FRACS = [
  { name: "Hyde Park",   color: 0x166534, fx: [0.04, 0.25, 0.04, 0.42, 0.42, 0.25, 0.42, 0.42] },
  { name: "Bloomsbury", color: 0x1e3a5f, fx: [0.3,  0.12, 0.3,  0.55, 0.58, 0.12, 0.58, 0.55] },
  { name: "Shoreditch", color: 0x4a1d96, fx: [0.6,  0.08, 0.6,  0.5,  0.88, 0.08, 0.88, 0.5 ] },
  { name: "South Bank", color: 0x0f4c75, fx: [0.22, 0.58, 0.22, 0.92, 0.72, 0.58, 0.72, 0.92] },
];


// Speech bubble display state
interface SpeechBubble {
  agentId: string;
  text: string;
  expiresAt: number;
}

// Agent tween state
interface AgentTween {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  progress: number;
}

// Simple PixiJS Graphics object pool
class GraphicsPool {
  private pool: Graphics[] = [];
  private active: Graphics[] = [];

  acquire(): Graphics {
    const g = this.pool.length > 0 ? this.pool.pop()! : new Graphics();
    this.active.push(g);
    return g;
  }

  releaseAll(container: Container): void {
    for (const g of this.active) {
      container.removeChild(g);
      g.clear();
      this.pool.push(g);
    }
    this.active = [];
  }
}

// Calculate the display position of an agent within its area group
function calcAgentPosition(
  world: WorldState,
  agentId: string,
  scaleX = 1,
  scaleY = 1,
): { x: number; y: number } | null {
  const agent = world.agents.find(a => a.id === agentId);
  if (!agent) return null;
  const area = world.areas.find(a => a.id === agent.state.currentAreaId);
  if (!area) return null;

  const groupInArea = world.agents.filter(a => a.state.currentAreaId === area.id);
  const idx = groupInArea.findIndex(a => a.id === agentId);
  const total = groupInArea.length;
  const angle = total > 1 ? (idx / total) * Math.PI * 2 : 0;
  const spread = total > 1 ? 22 : 0;
  return {
    x: area.position.x * scaleX + Math.cos(angle) * spread,
    y: area.position.y * scaleY + Math.sin(angle) * spread,
  };
}

export function WorldCanvas() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);

  // Layer containers
  const bgLayerRef = useRef<Container | null>(null);
  const areasLayerRef = useRef<Container | null>(null);
  const agentsLayerRef = useRef<Container | null>(null);

  // Object pools
  const areaPoolRef = useRef(new GraphicsPool());
  const agentPoolRef = useRef(new GraphicsPool());

  // Animation state
  const agentTweensRef = useRef<Map<string, AgentTween>>(new Map());

  const { world, selectAgent, selectedAgentId, connected } = useWorldStore();
  const [speechBubbles, setSpeechBubbles] = useState<SpeechBubble[]>([]);
  const lastWorldRef = useRef<WorldState | null>(null);
  const worldRef = useRef<WorldState | null>(null);
  const selectedAgentIdRef = useRef<string | null>(null);
  const selectAgentRef = useRef(selectAgent);
  selectAgentRef.current = selectAgent;

  // Keep worldRef in sync for ticker access
  worldRef.current = world;
  selectedAgentIdRef.current = selectedAgentId;

  // Detect new social events → create speech bubbles (HTML overlay state)
  useEffect(() => {
    if (!world) return;
    const prev = lastWorldRef.current;
    const prevEventIds = new Set(prev?.recentEvents.map(e => e.id) ?? []);
    const newBubbles: SpeechBubble[] = [];

    for (const event of world.recentEvents) {
      if (event.kind === "social" && !prevEventIds.has(event.id)) {
        const [agentId] = event.involvedAgentIds;
        if (agentId) {
          const raw = event.description;
          const text = raw.length > 80 ? raw.slice(0, 79) + "…" : raw;
          newBubbles.push({ agentId, text, expiresAt: Date.now() + 4000 });
        }
      }
    }

    if (newBubbles.length > 0) {
      setSpeechBubbles(prev => {
        const now = Date.now();
        const active = prev.filter(b => b.expiresAt > now);
        return [...active, ...newBubbles].slice(-3); // max 3 simultaneous bubbles
      });
    }

    lastWorldRef.current = world;
  }, [world]);

  // Auto-remove expired bubbles
  useEffect(() => {
    if (speechBubbles.length === 0) return;
    const earliest = Math.min(...speechBubbles.map(b => b.expiresAt));
    const delay = Math.max(0, earliest - Date.now());
    const timer = setTimeout(() => {
      setSpeechBubbles(prev => prev.filter(b => b.expiresAt > Date.now()));
    }, delay);
    return () => clearTimeout(timer);
  }, [speechBubbles]);

  // Init PixiJS once — create layers, draw static background, start ticker
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
      if (!canvasRef.current) return;
      canvasRef.current.appendChild(app.canvas);

      // Create persistent layers
      const bgLayer = new Container();
      const areasLayer = new Container();
      const agentsLayer = new Container();
      bgLayerRef.current = bgLayer;
      areasLayerRef.current = areasLayer;
      agentsLayerRef.current = agentsLayer;
      app.stage.addChild(bgLayer);
      app.stage.addChild(areasLayer);
      app.stage.addChild(agentsLayer);

      // Draw static district background + street grid
      drawBackground(bgLayer, app.screen.width, app.screen.height);

      // Ticker: animate agents at 60fps
      app.ticker.add(() => {
        const currentWorld = worldRef.current;
        const currentSelectedId = selectedAgentIdRef.current;
        if (!currentWorld || !agentsLayerRef.current) return;

        // Advance tweens
        const dt = app.ticker.deltaMS / 400; // tween over ~400ms
        for (const [, tween] of agentTweensRef.current) {
          tween.progress = Math.min(1, tween.progress + dt);
        }

        // Idle pulse: gentle scale variation on agent dots
        const pulse = 1 + Math.sin(Date.now() / 600) * 0.05;

        drawAgents(
          currentWorld,
          agentsLayerRef.current,
          agentPoolRef.current,
          agentTweensRef.current,
          currentSelectedId,
          selectAgentRef.current,
          pulse,
        );
      });
    });

    return () => {
      app.destroy(true);
      appRef.current = null;
      bgLayerRef.current = null;
      areasLayerRef.current = null;
      agentsLayerRef.current = null;
    };
  }, []);

  // On world tick: update area layer + sync agent tween targets
  useEffect(() => {
    const app = appRef.current;
    const areasLayer = areasLayerRef.current;
    if (!app || !world || !areasLayer) return;

    // Redraw areas — clear all children first (removes both pooled Graphics AND Text labels)
    areasLayer.removeChildren();
    areaPoolRef.current.releaseAll(areasLayer);
    // Scale area positions: server coords are designed for 800×500 logical canvas
    const scaleX = app.screen.width / 800;
    const scaleY = app.screen.height / 500;
    for (const area of world.areas) {
      const color = AREA_COLORS[area.type] ?? 0x334155;
      const radius = 30 + Math.sqrt(area.capacity) * 2.2;
      const occupantCount = area.currentOccupants.length;
      const ax = area.position.x * scaleX;
      const ay = area.position.y * scaleY;

      const g = areaPoolRef.current.acquire();
      g.circle(0, 0, radius);
      g.fill({ color, alpha: occupantCount > 0 ? 0.55 : 0.3 });
      g.stroke({ color, width: occupantCount > 0 ? 2.5 : 1.5, alpha: 0.9 });
      g.x = ax;
      g.y = ay;
      areasLayer.addChild(g);

      // Area label
      const icon = AREA_ICONS[area.type] ?? "·";
      const label = new Text({
        text: `${icon} ${area.name}`,
        style: new TextStyle({ fontSize: 10, fill: 0xd1d5db, fontFamily: "system-ui, sans-serif" }),
      });
      label.x = ax - label.width / 2;
      label.y = ay + radius + 5;
      areasLayer.addChild(label);

      if (occupantCount > 0) {
        const badge = new Text({
          text: `${occupantCount}`,
          style: new TextStyle({ fontSize: 9, fill: 0xfbbf24, fontFamily: "monospace" }),
        });
        badge.x = ax + radius - 6;
        badge.y = ay - radius - 2;
        areasLayer.addChild(badge);
      }
    }

    // Sync agent tween targets
    for (const agent of world.agents) {
      const newPos = calcAgentPosition(world, agent.id, scaleX, scaleY);
      if (!newPos) continue;

      const existing = agentTweensRef.current.get(agent.id);
      if (existing) {
        // Interpolate from current visual position
        const curX = existing.fromX + (existing.toX - existing.fromX) * existing.progress;
        const curY = existing.fromY + (existing.toY - existing.fromY) * existing.progress;
        if (curX !== newPos.x || curY !== newPos.y) {
          agentTweensRef.current.set(agent.id, {
            fromX: curX,
            fromY: curY,
            toX: newPos.x,
            toY: newPos.y,
            progress: 0,
          });
        }
      } else {
        // First time: place immediately
        agentTweensRef.current.set(agent.id, {
          fromX: newPos.x,
          fromY: newPos.y,
          toX: newPos.x,
          toY: newPos.y,
          progress: 1,
        });
      }
    }
    // Remove tweens for agents that no longer exist
    for (const [id] of agentTweensRef.current) {
      if (!world.agents.find(a => a.id === id)) {
        agentTweensRef.current.delete(id);
      }
    }
  }, [world]);

  return (
    <div className="w-full h-full bg-slate-900 rounded-lg overflow-hidden relative">
      <div ref={canvasRef} className="w-full h-full" />
      {!world && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950/80">
          <div className="text-3xl animate-pulse">🌍</div>
          <p className="text-slate-300 text-sm">{connected ? "Loading world…" : "Connecting to colony…"}</p>
        </div>
      )}
      {world && speechBubbles.map(bubble => {
        const app = appRef.current;
        const sx = app ? app.screen.width / 800 : 1;
        const sy = app ? app.screen.height / 500 : 1;
        const pos = calcAgentPosition(world, bubble.agentId, sx, sy);
        const agent = world.agents.find(a => a.id === bubble.agentId);
        if (!pos || !agent) return null;
        return (
          <div
            key={`${bubble.agentId}-${bubble.expiresAt}`}
            className="speech-bubble"
            style={{ left: pos.x, top: pos.y - 56 }}
          >
            <div className="speech-bubble-name">{agent.name.split(" ")[0]}</div>
            <div className="speech-bubble-text">{bubble.text}</div>
          </div>
        );
      })}
    </div>
  );
}

// Draw static background: district zones + street grid
function drawBackground(layer: Container, width: number, height: number) {
  // City base fill
  const base = new Graphics();
  base.rect(0, 0, width, height);
  base.fill({ color: 0x0d1117 });
  layer.addChild(base);

  // Major roads (horizontal + vertical arterials)
  const roads = new Graphics();
  const roadColor = 0x1e3a5f;

  // Horizontal roads
  for (const y of [height * 0.18, height * 0.38, height * 0.55, height * 0.72, height * 0.88]) {
    roads.moveTo(0, y);
    roads.lineTo(width, y);
  }
  // Vertical roads
  for (const x of [width * 0.15, width * 0.32, width * 0.5, width * 0.68, width * 0.82]) {
    roads.moveTo(x, 0);
    roads.lineTo(x, height);
  }
  roads.stroke({ color: roadColor, width: 1.5, alpha: 0.6 });
  layer.addChild(roads);

  // Fine street grid
  const grid = new Graphics();
  const gridSize = 30;
  for (let x = 0; x <= width; x += gridSize) {
    grid.moveTo(x, 0);
    grid.lineTo(x, height);
  }
  for (let y = 0; y <= height; y += gridSize) {
    grid.moveTo(0, y);
    grid.lineTo(width, y);
  }
  grid.stroke({ color: 0x162032, width: 0.4, alpha: 0.5 });
  layer.addChild(grid);

  // Thames river
  const thames = new Graphics();
  thames.moveTo(0, height * 0.65);
  thames.bezierCurveTo(
    width * 0.2,  height * 0.58,
    width * 0.45, height * 0.72,
    width * 0.7,  height * 0.62,
  );
  thames.bezierCurveTo(
    width * 0.82, height * 0.57,
    width * 0.92, height * 0.68,
    width,        height * 0.63,
  );
  thames.stroke({ color: 0x0f3460, width: 14, alpha: 0.55 });
  // River label
  const riverLabel = new Text({
    text: "RIVER THAMES",
    style: new TextStyle({ fontSize: 8, fill: 0x2563eb, fontFamily: "system-ui", letterSpacing: 3 }),
  });
  riverLabel.x = width * 0.35;
  riverLabel.y = height * 0.67;
  riverLabel.alpha = 0.45;
  layer.addChild(thames);
  layer.addChild(riverLabel);

  // Borough zones (subtle coloured regions) — scaled to canvas
  for (const district of LONDON_DISTRICT_FRACS) {
    // Convert [fx0,fy0, fx1,fy1, ...] fractions to pixel points
    const pts: number[] = [];
    for (let i = 0; i < district.fx.length; i++) {
      pts.push(i % 2 === 0 ? district.fx[i] * width : district.fx[i] * height);
    }
    const g = new Graphics();
    g.poly(pts);
    g.fill({ color: district.color, alpha: 0.06 });
    g.stroke({ color: district.color, width: 1, alpha: 0.2 });
    layer.addChild(g);

    const label = new Text({
      text: district.name.toUpperCase(),
      style: new TextStyle({
        fontSize: 8,
        fill: district.color,
        fontFamily: "system-ui, sans-serif",
        letterSpacing: 2,
      }),
    });
    label.alpha = 0.35;
    label.x = pts[0] + 6;
    label.y = pts[1] + 6;
    layer.addChild(label);
  }
}

// Draw all agents onto the agents layer using the pool
function drawAgents(
  world: WorldState,
  agentsLayer: Container,
  pool: GraphicsPool,
  tweens: Map<string, AgentTween>,
  selectedAgentId: string | null,
  selectAgent: (id: string | null) => void,
  pulse: number,
) {
  // Clear all children first (removes both pooled Graphics AND Text labels)
  agentsLayer.removeChildren();
  pool.releaseAll(agentsLayer);

  for (const agent of world.agents) {
    const tween = tweens.get(agent.id);
    if (!tween) continue;

    const ax = tween.fromX + (tween.toX - tween.fromX) * tween.progress;
    const ay = tween.fromY + (tween.toY - tween.fromY) * tween.progress;

    const isSelected = agent.id === selectedAgentId;
    const color = parseInt(agent.avatar.replace("#", ""), 16);
    const baseRadius = isSelected ? 9 : 7;
    const radius = baseRadius * (isSelected ? 1 : pulse);

    // Selection glow ring
    if (isSelected) {
      const glow = pool.acquire();
      glow.circle(0, 0, 16);
      glow.fill({ color: 0xfbbf24, alpha: 0.15 });
      glow.stroke({ color: 0xfbbf24, width: 2, alpha: 0.9 });
      glow.x = ax;
      glow.y = ay;
      agentsLayer.addChild(glow);
    }

    // Agent dot
    const agentG = pool.acquire();
    agentG.circle(0, 0, radius);
    agentG.fill({ color });
    agentG.x = ax;
    agentG.y = ay;
    agentG.eventMode = "static";
    agentG.cursor = "pointer";
    agentG.removeAllListeners();
    agentG.on("pointerdown", () => selectAgent(agent.id));
    agentsLayer.addChild(agentG);

    // Mood dot
    const moodDot = pool.acquire();
    moodDot.circle(0, 0, 3);
    moodDot.fill({ color: MOOD_COLORS[agent.state.mood] ?? 0xffffff });
    moodDot.x = ax + 9;
    moodDot.y = ay - 9;
    agentsLayer.addChild(moodDot);

    // Name label for selected agent
    if (isSelected) {
      const nameLabel = new Text({
        text: agent.name.split(" ")[0],
        style: new TextStyle({ fontSize: 10, fill: 0xfbbf24, fontFamily: "system-ui" }),
      });
      nameLabel.x = ax - nameLabel.width / 2;
      nameLabel.y = ay + 12;
      agentsLayer.addChild(nameLabel);
    }

  }
}
