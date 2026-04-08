import type { Agent, RelationshipType } from "@agentcolony/shared";
import { useWorldStore } from "../store/worldStore";

const REL_COLORS: Record<RelationshipType, string> = {
  friend: "#22c55e",
  collaborator: "#60a5fa",
  mentor: "#f59e0b",
  rival: "#ef4444",
  stranger: "#475569",
};

const REL_LABELS: Record<RelationshipType, string> = {
  friend: "Friend",
  collaborator: "Collaborator",
  mentor: "Mentor",
  rival: "Rival",
  stranger: "Stranger",
};

interface Props {
  agent: Agent;
}

export function RelationshipGraph({ agent }: Props) {
  const world = useWorldStore(s => s.world);
  const selectAgent = useWorldStore(s => s.selectAgent);

  const relationships = agent.relationships.filter(r => r.type !== "stranger" || r.strength > 10);
  if (relationships.length === 0) {
    return (
      <div className="p-3 text-xs text-gray-600 italic">No relationships yet.</div>
    );
  }

  const width = 240;
  const height = 200;
  const cx = width / 2;
  const cy = height / 2;
  const orbitRadius = 72;
  const centerR = 14;
  const nodeR = 10;

  const agentColor = agent.avatar;

  return (
    <div className="p-2">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {/* Orbit guide */}
        <circle
          cx={cx}
          cy={cy}
          r={orbitRadius}
          fill="none"
          stroke="#1e293b"
          strokeWidth={1}
          strokeDasharray="3 4"
        />

        {/* Relationship lines */}
        {relationships.map((rel, i) => {
          const angle = (i / relationships.length) * Math.PI * 2 - Math.PI / 2;
          const nx = cx + Math.cos(angle) * orbitRadius;
          const ny = cy + Math.sin(angle) * orbitRadius;
          const thickness = Math.max(1, (rel.strength / 100) * 4);
          const color = REL_COLORS[rel.type] ?? "#475569";
          return (
            <line
              key={rel.agentId}
              x1={cx}
              y1={cy}
              x2={nx}
              y2={ny}
              stroke={color}
              strokeWidth={thickness}
              strokeOpacity={0.5}
            />
          );
        })}

        {/* Related agent nodes */}
        {relationships.map((rel, i) => {
          const angle = (i / relationships.length) * Math.PI * 2 - Math.PI / 2;
          const nx = cx + Math.cos(angle) * orbitRadius;
          const ny = cy + Math.sin(angle) * orbitRadius;
          const color = REL_COLORS[rel.type] ?? "#475569";
          const relAgent = world?.agents.find(a => a.id === rel.agentId);
          const dotColor = relAgent ? relAgent.avatar : "#475569";
          const firstName = relAgent ? relAgent.name.split(" ")[0] : "?";

          return (
            <g
              key={rel.agentId}
              style={{ cursor: "pointer" }}
              onClick={() => selectAgent(rel.agentId)}
            >
              <circle
                cx={nx}
                cy={ny}
                r={nodeR}
                fill={dotColor}
                stroke={color}
                strokeWidth={2}
                opacity={0.9}
              />
              <text
                x={nx}
                y={ny + nodeR + 10}
                textAnchor="middle"
                fontSize={7}
                fill="#9ca3af"
                fontFamily="system-ui, sans-serif"
              >
                {firstName}
              </text>
              {/* Strength badge */}
              <text
                x={nx}
                y={ny + 3}
                textAnchor="middle"
                fontSize={6}
                fill="#fff"
                fontFamily="monospace"
                fontWeight="bold"
              >
                {Math.round(rel.strength)}
              </text>
            </g>
          );
        })}

        {/* Center node (selected agent) */}
        <circle cx={cx} cy={cy} r={centerR + 4} fill="#fbbf24" opacity={0.12} />
        <circle cx={cx} cy={cy} r={centerR} fill={agentColor} stroke="#fbbf24" strokeWidth={1.5} />
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
        {(Object.keys(REL_COLORS) as RelationshipType[])
          .filter(type => relationships.some(r => r.type === type))
          .map(type => (
            <div key={type} className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: REL_COLORS[type] }} />
              <span className="text-xs text-gray-500">{REL_LABELS[type]}</span>
            </div>
          ))}
      </div>
    </div>
  );
}
