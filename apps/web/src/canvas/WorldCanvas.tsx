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

// London district background regions
const LONDON_DISTRICTS = [
  { name: "Hyde Park", color: 0x166534, points: [80, 200, 340, 200, 340, 430, 80, 430] },
  { name: "Bloomsbury", color: 0x1e3a5f, points: [355, 120, 510, 120, 510, 295, 355, 295] },
  { name: "Shoreditch", color: 0x4a1d96, points: [565, 90, 770, 90, 770, 275, 565, 275] },
  { name: "South Bank", color: 0x0f4c75, points: [415, 290, 575, 290, 575, 440, 415, 440] },
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
    x: area.position.x + Math.cos(angle) * spread,
    y: area.position.y + Math.sin(angle) * spread,
  };
}

const speechBubbles: Map<string, SpeechBubble> = new Map();

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

  const { world, selectAgent, selectedAgentId } = useWorldStore();
  const lastWorldRef = useRef<WorldState | null>(null);
  const worldRef = useRef<WorldState | null>(null);
  const selectedAgentIdRef = useRef<string | null>(null);
  const selectAgentRef = useRef(selectAgent);
  selectAgentRef.current = selectAgent;

  // Keep worldRef in sync for ticker access
  worldRef.current = world;
  selectedAgentIdRef.current = selectedAgentId;

  // Detect new social events → create speech bubbles
  useEffect(() => {
    if (!world) return;
    const prev = lastWorldRef.current;
    const prevEventIds = new Set(prev?.recentEvents.map(e => e.id) ?? []);
    for (const event of world.recentEvents) {
      if (event.kind === "social" && !prevEventIds.has(event.id)) {
        const [agentId] = event.involvedAgentIds;
        if (agentId) {
          const words = event.description.split(" ");
          const short = words.slice(0, 6).join(" ") + (words.length > 6 ? "…" : "");
          speechBubbles.set(agentId, { agentId, text: short, expiresAt: Date.now() + 3500 });
        }
      }
    }
    lastWorldRef.current = world;
  }, [world]);

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
          speechBubbles,
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

    // Redraw areas
    areaPoolRef.current.releaseAll(areasLayer);
    for (const area of world.areas) {
      const color = AREA_COLORS[area.type] ?? 0x334155;
      const radius = 38 + Math.sqrt(area.capacity) * 3;
      const occupantCount = area.currentOccupants.length;

      const g = areaPoolRef.current.acquire();
      g.circle(0, 0, radius);
      g.fill({ color, alpha: occupantCount > 0 ? 0.55 : 0.3 });
      g.stroke({ color, width: occupantCount > 0 ? 2.5 : 1.5, alpha: 0.9 });
      g.x = area.position.x;
      g.y = area.position.y;
      areasLayer.addChild(g);

      // Area label
      const icon = AREA_ICONS[area.type] ?? "·";
      const label = new Text({
        text: `${icon} ${area.name}`,
        style: new TextStyle({ fontSize: 10, fill: 0xd1d5db, fontFamily: "system-ui, sans-serif" }),
      });
      label.x = area.position.x - label.width / 2;
      label.y = area.position.y + radius + 5;
      areasLayer.addChild(label);

      if (occupantCount > 0) {
        const badge = new Text({
          text: `${occupantCount}`,
          style: new TextStyle({ fontSize: 9, fill: 0xfbbf24, fontFamily: "monospace" }),
        });
        badge.x = area.position.x + radius - 6;
        badge.y = area.position.y - radius - 2;
        areasLayer.addChild(badge);
      }
    }

    // Sync agent tween targets
    for (const agent of world.agents) {
      const newPos = calcAgentPosition(world, agent.id);
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
    <div
      ref={canvasRef}
      className="w-full h-full bg-slate-900 rounded-lg overflow-hidden"
    />
  );
}

// Draw static background: district zones + street grid
function drawBackground(layer: Container, width: number, height: number) {
  // Street grid
  const grid = new Graphics();
  const gridSize = 40;
  for (let x = 0; x <= width; x += gridSize) {
    grid.moveTo(x, 0);
    grid.lineTo(x, height);
  }
  for (let y = 0; y <= height; y += gridSize) {
    grid.moveTo(0, y);
    grid.lineTo(width, y);
  }
  grid.stroke({ color: 0x1e293b, width: 0.5, alpha: 0.6 });
  layer.addChild(grid);

  // District polygons
  for (const district of LONDON_DISTRICTS) {
    const g = new Graphics();
    g.poly(district.points);
    g.fill({ color: district.color, alpha: 0.07 });
    g.stroke({ color: district.color, width: 1, alpha: 0.18 });
    layer.addChild(g);

    // District label (very subtle)
    const label = new Text({
      text: district.name.toUpperCase(),
      style: new TextStyle({
        fontSize: 8,
        fill: district.color,
        fontFamily: "system-ui, sans-serif",
        letterSpacing: 2,
      }),
    });
    label.alpha = 0.3;
    const pts = district.points;
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
  bubbles: Map<string, SpeechBubble>,
  selectedAgentId: string | null,
  selectAgent: (id: string | null) => void,
  pulse: number,
) {
  pool.releaseAll(agentsLayer);
  const now = Date.now();

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

    // Speech bubble
    const bubble = bubbles.get(agent.id);
    if (bubble && bubble.expiresAt > now) {
      const remaining = (bubble.expiresAt - now) / 3500;
      const alpha = remaining > 0.8 ? 1 : remaining / 0.8;
      const bw = 120;
      const bh = 22;

      const bg = pool.acquire();
      bg.roundRect(-bw / 2, -bh - 20, bw, bh, 4);
      bg.fill({ color: 0x1e293b, alpha: alpha * 0.9 });
      bg.stroke({ color: 0x475569, width: 1, alpha });
      bg.x = ax;
      bg.y = ay;
      agentsLayer.addChild(bg);

      const bubbleText = new Text({
        text: bubble.text,
        style: new TextStyle({
          fontSize: 9,
          fill: 0xe2e8f0,
          fontFamily: "system-ui",
          wordWrap: true,
          wordWrapWidth: 110,
        }),
      });
      bubbleText.alpha = alpha;
      bubbleText.x = ax - 55;
      bubbleText.y = ay - bh - 18;
      agentsLayer.addChild(bubbleText);
    } else if (bubble && bubble.expiresAt <= now) {
      bubbles.delete(agent.id);
    }
  }
}
