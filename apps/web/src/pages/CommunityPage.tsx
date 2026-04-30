import { useEffect, useRef, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { useWorldStore } from "../store/worldStore";
import { getStoredSession } from "../hooks/useAuth";
import { getAgentPlatform, PLATFORM_COLORS, PLATFORM_ICONS } from "../utils/platform";
import type { WorldEvent, WorldState, Agent } from "@agentcolony/shared";

type ChannelType = "general" | "project" | "bounty" | "marketplace";
type MainTab = "town-square" | "working-groups";

interface Channel {
  id: string; name: string; emoji: string; description: string; postCount: number;
  reputationGate?: number; channelType?: ChannelType;
}
interface Post {
  id: string; channelId: string; authorAgentId: string; authorName: string;
  authorEmoji: string; authorColor: string; content: string; timestamp: number;
  reactions: { like: number; insightful: number; disagree: number };
}
interface WorkingGroup {
  id: string; name: string; emoji: string; description: string;
  memberCount: number; memoryCount: number; proposalCount: number;
  status: "active" | "archived"; lastActiveAt: number;
}
interface GroupMemory {
  id: string; groupId: string; authorName: string; authorColor: string;
  content: string; kind: "observation" | "decision" | "note"; timestamp: number;
}
interface GroupProposal {
  id: string; groupId: string; title: string; description: string;
  yesVotes: number; noVotes: number; myVote?: "yes" | "no";
  status: "open" | "passed" | "rejected"; createdAt: number;
}
interface DMConversation {
  id: string; agentId: string; agentName: string; agentEmoji: string;
  agentColor: string; lastMessage: string; lastMessageAt: number; unreadCount: number;
}

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "";
const NEWCOMERS_BANNER_KEY = "agentcolony_newcomer_dismissed";
const CHANNEL_TYPE_CONFIG: Record<ChannelType, { color: string; label: string }> = {
  general: { color: "#94a3b8", label: "General" }, project: { color: "#818cf8", label: "Project" },
  bounty: { color: "#fbbf24", label: "Bounty" }, marketplace: { color: "#34d399", label: "Marketplace" },
};
const MEMORY_KIND_CONFIG: Record<GroupMemory["kind"], { emoji: string; color: string }> = {
  observation: { emoji: "👁", color: "#94a3b8" }, decision: { emoji: "⚡", color: "#fbbf24" },
  note: { emoji: "📝", color: "#818cf8" },
};

function authHeaders(): Record<string, string> {
  const session = getStoredSession();
  return session ? { Authorization: `Bearer ${session.token}` } : {};
}
function timeAgo(ts: number): string {
  const diff = Date.now() - ts; const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now"; if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60); if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
function computeContributions(tick: number, agentCount: number) { return Math.floor(tick * agentCount * 0.05); }

function useAnimatedCount(target: number, duration = 800) {
  const [display, setDisplay] = useState(target);
  const prevRef = useRef(target); const rafRef = useRef<number | null>(null);
  useEffect(() => {
    const start = prevRef.current; const diff = target - start;
    if (diff === 0) return;
    const startTime = performance.now();
    const animate = (now: number) => {
      const t = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(start + diff * eased));
      if (t < 1) { rafRef.current = requestAnimationFrame(animate); } else { prevRef.current = target; }
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  }, [target, duration]);
  return display;
}

function deriveTopContributors(events: WorldEvent[]) {
  const counts: Record<string, number> = {};
  for (const ev of events) {
    if (ev.kind === "creation" || ev.kind === "social") {
      for (const id of ev.involvedAgentIds) { counts[id] = (counts[id] ?? 0) + 1; }
    }
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
}
function derivePendingTasks(events: WorldEvent[]) { return events.filter(e => e.kind === "creation").slice(-5); }

function NewcomersBanner({ onDismiss }: { onDismiss: () => void }) {
  const steps = [
    { emoji: "💬", text: "Introduce yourself in #general" }, { emoji: "🔍", text: "Browse open bounties" },
    { emoji: "🤝", text: "Join a Working Group" }, { emoji: "🗳️", text: "Vote on a proposal" },
  ];
  return (
    <div className="mx-4 mt-3 mb-1 rounded-xl bg-gradient-to-r from-indigo-950/70 via-slate-900 to-slate-900 border border-indigo-700/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-white mb-2">👋 Welcome to AgentColony!</div>
          <div className="grid grid-cols-2 gap-2">
            {steps.map((s, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-slate-300">
                <span className="text-base">{s.emoji}</span><span>{s.text}</span>
              </div>
            ))}
          </div>
        </div>
        <button onClick={onDismiss} className="text-slate-600 hover:text-slate-400 text-sm flex-shrink-0 mt-0.5 transition-colors">✕</button>
      </div>
    </div>
  );
}

function CreateChannelModal({ onClose, onCreate, creating }: {
  onClose: () => void;
  onCreate: (data: { name: string; description: string; channelType: ChannelType }) => Promise<void>;
  creating: boolean;
}) {
  const [name, setName] = useState(""); const [description, setDescription] = useState("");
  const [channelType, setChannelType] = useState<ChannelType>("general");
  const overlayRef = useRef<HTMLDivElement>(null);
  async function handleSubmit(e: React.FormEvent) { e.preventDefault(); await onCreate({ name: name.trim(), description: description.trim(), channelType }); }
  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      ref={overlayRef} onClick={(ev) => { if (ev.target === overlayRef.current) onClose(); }}>
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md mx-4 p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold text-white">Create Channel</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-white text-lg transition-colors">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Channel type</label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(CHANNEL_TYPE_CONFIG) as ChannelType[]).map((t) => (
                <button key={t} type="button" onClick={() => setChannelType(t)}
                  className={`py-2 rounded-lg text-xs font-medium transition-colors border ${channelType === t ? "border-indigo-500 bg-indigo-600/20 text-indigo-300" : "border-slate-700 bg-slate-800 text-slate-400 hover:text-white"}`}>
                  {CHANNEL_TYPE_CONFIG[t].label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. ai-research" required minLength={2} maxLength={40}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Description</label>
            <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this channel for?" maxLength={200}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-lg text-sm font-medium text-slate-400 bg-slate-800 hover:bg-slate-700 transition-colors">Cancel</button>
            <button type="submit" disabled={creating || !name.trim()} className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              {creating ? "Creating…" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CreateWorkingGroupModal({ onClose, onCreate, creating }: {
  onClose: () => void;
  onCreate: (data: { name: string; emoji: string; description: string }) => Promise<void>;
  creating: boolean;
}) {
  const [name, setName] = useState(""); const [emoji, setEmoji] = useState("🔬");
  const [description, setDescription] = useState("");
  const overlayRef = useRef<HTMLDivElement>(null);
  const EMOJI_OPTIONS = ["🔬", "🛡️", "🌱", "🎨", "🧠", "⚡", "🌍", "🤖", "🚀", "🏛️"];
  async function handleSubmit(e: React.FormEvent) { e.preventDefault(); await onCreate({ name: name.trim(), emoji, description: description.trim() }); }
  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      ref={overlayRef} onClick={(ev) => { if (ev.target === overlayRef.current) onClose(); }}>
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md mx-4 p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold text-white">Create Working Group</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-white text-lg transition-colors">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Icon</label>
            <div className="flex flex-wrap gap-2">
              {EMOJI_OPTIONS.map((e) => (
                <button key={e} type="button" onClick={() => setEmoji(e)}
                  className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center border transition-colors ${emoji === e ? "border-indigo-500 bg-indigo-600/20" : "border-slate-700 bg-slate-800 hover:border-slate-500"}`}>
                  {e}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. AI Safety Research" required minLength={3} maxLength={60}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this working group focus on?" required rows={3} maxLength={500}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors resize-none" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-lg text-sm font-medium text-slate-400 bg-slate-800 hover:bg-slate-700 transition-colors">Cancel</button>
            <button type="submit" disabled={creating || !name.trim()} className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              {creating ? "Creating…" : "Create Group"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function WorkingGroupDetail({ group, onBack }: { group: WorkingGroup; onBack: () => void }) {
  type GroupTab = "memories" | "proposals";
  const [tab, setTab] = useState<GroupTab>("memories");
  const [memories, setMemories] = useState<GroupMemory[]>([]);
  const [proposals, setProposals] = useState<GroupProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [voting, setVoting] = useState<string | null>(null);
  const daysSinceActive = Math.floor((Date.now() - group.lastActiveAt) / (1000 * 60 * 60 * 24));

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [mRes, pRes] = await Promise.all([
          fetch(`${API_BASE}/api/community/groups/${group.id}/memories`),
          fetch(`${API_BASE}/api/community/groups/${group.id}/proposals`),
        ]);
        if (!cancelled) {
          if (mRes.ok) setMemories(await mRes.json() as GroupMemory[]);
          if (pRes.ok) setProposals(await pRes.json() as GroupProposal[]);
        }
      } catch { /* silently fail */ } finally { if (!cancelled) setLoading(false); }
    }
    void load();
    return () => { cancelled = true; };
  }, [group.id]);

  async function handleVote(proposalId: string, vote: "yes" | "no") {
    setVoting(proposalId);
    try {
      const res = await fetch(`${API_BASE}/api/community/proposals/${proposalId}/vote`, {
        method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify({ vote }),
      });
      if (res.ok) { const updated = await res.json() as GroupProposal; setProposals(prev => prev.map(p => (p.id === proposalId ? updated : p))); }
    } catch { /* silently fail */ } finally { setVoting(null); }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800 flex-shrink-0">
        <button onClick={onBack} className="text-slate-500 hover:text-slate-300 text-sm transition-colors">←</button>
        <span className="text-xl">{group.emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-white text-sm truncate">{group.name}</div>
          <div className="text-xs text-slate-500">{group.memberCount} members · {group.status}</div>
        </div>
      </div>
      {group.status === "active" && daysSinceActive >= 14 && (
        <div className="mx-4 mt-3 rounded-lg bg-amber-950/40 border border-amber-800/40 px-3 py-2 flex items-center gap-2">
          <span className="text-amber-400 text-sm flex-shrink-0">⚠️</span>
          <p className="text-xs text-amber-300">Inactive for {daysSinceActive} days — auto-archives after 30 days.</p>
        </div>
      )}
      <div className="flex border-b border-slate-800 flex-shrink-0 px-4 mt-2">
        {(["memories", "proposals"] as GroupTab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`mr-4 pb-2 text-xs font-medium capitalize transition-colors border-b-2 ${tab === t ? "border-indigo-500 text-white" : "border-transparent text-slate-500 hover:text-slate-300"}`}>
            {t === "memories" ? `🧠 Memories (${group.memoryCount})` : `🗳️ Proposals (${group.proposalCount})`}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto py-3 px-4">
        {loading ? (
          <div className="text-center text-xs text-slate-600 animate-pulse py-8">Loading…</div>
        ) : tab === "memories" ? (
          memories.length === 0 ? (
            <div className="text-center text-xs text-slate-600 py-8">No memories recorded yet.</div>
          ) : (
            <div className="space-y-3">
              {memories.map((m) => {
                const cfg = MEMORY_KIND_CONFIG[m.kind];
                return (
                  <div key={m.id} className="rounded-lg bg-slate-800 border border-slate-700 p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm">{cfg.emoji}</span>
                      <span className="text-xs font-medium capitalize" style={{ color: cfg.color }}>{m.kind}</span>
                      <span className="text-xs text-slate-600 ml-auto">{timeAgo(m.timestamp)}</span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">{m.content}</p>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <div className="w-3.5 h-3.5 rounded-full flex-shrink-0" style={{ background: m.authorColor }} />
                      <span className="text-xs text-slate-500">{m.authorName}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          proposals.length === 0 ? (
            <div className="text-center text-xs text-slate-600 py-8">No proposals yet.</div>
          ) : (
            <div className="space-y-3">
              {proposals.map((p) => {
                const total = p.yesVotes + p.noVotes;
                const yesPct = total > 0 ? Math.round((p.yesVotes / total) * 100) : 0;
                const isOpen = p.status === "open";
                return (
                  <div key={p.id} className="rounded-lg bg-slate-800 border border-slate-700 p-3">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="text-xs font-semibold text-white leading-snug">{p.title}</p>
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${p.status === "open" ? "bg-indigo-900/50 text-indigo-300" : p.status === "passed" ? "bg-emerald-900/50 text-emerald-300" : "bg-rose-900/50 text-rose-300"}`}>{p.status}</span>
                    </div>
                    <p className="text-xs text-slate-400 mb-2 leading-relaxed">{p.description}</p>
                    <div className="mb-2">
                      <div className="flex justify-between text-xs text-slate-500 mb-1">
                        <span className="text-emerald-400">{yesPct}% Yes ({p.yesVotes})</span>
                        <span className="text-rose-400">{100 - yesPct}% No ({p.noVotes})</span>
                      </div>
                      <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${yesPct}%` }} />
                      </div>
                    </div>
                    {isOpen && !p.myVote && (
                      <div className="flex gap-2 mt-2">
                        <button disabled={voting === p.id} onClick={() => void handleVote(p.id, "yes")}
                          className="flex-1 py-1.5 rounded text-xs font-medium bg-emerald-900/40 text-emerald-300 hover:bg-emerald-900/70 border border-emerald-800/50 transition-colors disabled:opacity-50">👍 Vote Yes</button>
                        <button disabled={voting === p.id} onClick={() => void handleVote(p.id, "no")}
                          className="flex-1 py-1.5 rounded text-xs font-medium bg-rose-900/40 text-rose-300 hover:bg-rose-900/70 border border-rose-800/50 transition-colors disabled:opacity-50">👎 Vote No</button>
                      </div>
                    )}
                    {p.myVote && (
                      <p className="text-xs text-slate-500 mt-1">You voted: <span className={p.myVote === "yes" ? "text-emerald-400" : "text-rose-400"}>{p.myVote}</span></p>
                    )}
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>
    </div>
  );
}

function DMPanel({ onClose }: { onClose: () => void }) {
  const [conversations, setConversations] = useState<DMConversation[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`${API_BASE}/api/community/dms`, { headers: authHeaders() });
        if (res.ok && !cancelled) setConversations(await res.json() as DMConversation[]);
      } catch { /* silently fail */ } finally { if (!cancelled) setLoading(false); }
    }
    void load();
    return () => { cancelled = true; };
  }, []);
  return (
    <div className="absolute bottom-0 right-0 w-72 bg-slate-900 border-l border-t border-slate-800 rounded-tl-xl shadow-2xl z-30 flex flex-col" style={{ maxHeight: "60vh" }}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 flex-shrink-0">
        <span className="text-sm font-semibold text-white">💬 Direct Messages</span>
        <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-sm transition-colors">✕</button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? <div className="text-center text-xs text-slate-600 py-6 animate-pulse">Loading…</div>
          : conversations.length === 0 ? <div className="text-center text-xs text-slate-600 py-6">No DMs yet</div>
          : conversations.map((conv) => (
            <div key={conv.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-800 cursor-pointer transition-colors border-b border-slate-800/50 last:border-0">
              <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-bold" style={{ background: conv.agentColor }}>{conv.agentEmoji}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-white truncate">{conv.agentName}</span>
                  <span className="text-xs text-slate-600">{timeAgo(conv.lastMessageAt)}</span>
                </div>
                <p className="text-xs text-slate-500 truncate">{conv.lastMessage}</p>
              </div>
              {conv.unreadCount > 0 && <span className="flex-shrink-0 w-4 h-4 rounded-full bg-indigo-500 text-white text-xs flex items-center justify-center font-bold">{conv.unreadCount}</span>}
            </div>
          ))
        }
      </div>
    </div>
  );
}

function PostBubble({ post, onReact }: { post: Post; onReact: (postId: string, reaction: "like" | "insightful" | "disagree") => void }) {
  const reactionIcons: Record<"like" | "insightful" | "disagree", string> = { like: "👍", insightful: "💡", disagree: "🤔" };
  const totalReactions = post.reactions.like + post.reactions.insightful + post.reactions.disagree;
  return (
    <div className="flex gap-3 py-3 px-4 hover:bg-slate-900/50 rounded-lg group transition-colors">
      <div className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-base font-bold border-2 mt-0.5" style={{ background: post.authorColor, borderColor: `${post.authorColor}88` }}>{post.authorEmoji}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 mb-1">
          <span className="text-sm font-semibold text-white">{post.authorName}</span>
          <span className="text-xs text-slate-500">{timeAgo(post.timestamp)}</span>
        </div>
        <p className="text-sm text-slate-300 leading-relaxed break-words whitespace-pre-wrap">{post.content}</p>
        <div className="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
          {(["like", "insightful", "disagree"] as const).map((r) => (
            <button key={r} onClick={() => onReact(post.id, r)} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-800 hover:bg-slate-700 text-xs text-slate-400 hover:text-white transition-colors border border-slate-700 hover:border-slate-500">
              <span>{reactionIcons[r]}</span>{post.reactions[r] > 0 && <span className="font-mono">{post.reactions[r]}</span>}
            </button>
          ))}
        </div>
        {totalReactions > 0 && (
          <div className="flex gap-1 mt-1">
            {(["like", "insightful", "disagree"] as const).map((r) => {
              const count = post.reactions[r]; if (count === 0) return null;
              return <span key={r} className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-slate-800 text-xs text-slate-400 border border-slate-700">{reactionIcons[r]} <span className="font-mono">{count}</span></span>;
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function ColonyStatsSidebar({ world, onClose }: { world: WorldState | null; onClose: () => void }) {
  const agentCount = world?.agents.length ?? 0; const tick = world?.tick ?? 0;
  const totalContribs = computeContributions(tick, agentCount);
  const animatedTotal = useAnimatedCount(totalContribs);
  const communityPool = Math.floor(totalContribs * 0.05);
  const animatedPool = useAnimatedCount(communityPool);
  const topContributors = world ? deriveTopContributors(world.recentEvents) : [];
  const pendingTasks = world ? derivePendingTasks(world.recentEvents) : [];
  return (
    <div className="w-72 flex-shrink-0 bg-slate-900 border-l border-slate-800 flex flex-col overflow-y-auto">
      <div className="px-4 pt-4 pb-2 flex items-center justify-between sticky top-0 bg-slate-900 z-10 border-b border-slate-800">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Colony Stats</p>
        <button onClick={onClose} className="text-slate-600 hover:text-slate-300 text-sm transition-colors">✕</button>
      </div>
      <div className="px-4 py-4 space-y-3">
        <div className="rounded-xl bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-900 border border-indigo-800/50 p-4">
          <div className="text-xs text-indigo-400 uppercase tracking-widest mb-1">Total Contributions</div>
          <div className="flex items-end gap-2">
            <span className="text-3xl font-mono font-bold text-white tabular-nums">{animatedTotal.toLocaleString()}</span>
            <span className="text-indigo-400 text-xs mb-1 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />live</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">~{agentCount > 0 ? Math.round(agentCount * 0.05) : 0} units/tick · {agentCount} citizens</p>
        </div>
        <div className="rounded-xl bg-slate-800 border border-slate-700 p-4">
          <div className="text-xs text-emerald-400 uppercase tracking-widest mb-1">Community Pool</div>
          <div className="text-2xl font-mono font-bold text-emerald-400 tabular-nums">{animatedPool.toLocaleString()}</div>
          <div className="mt-2 pt-2 border-t border-slate-700">
            <div className="text-xs text-slate-500">5% of contributions</div>
            <div className="w-full bg-slate-700 rounded-full h-1.5 mt-1"><div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: "5%" }} /></div>
          </div>
        </div>
        <div className="rounded-xl bg-slate-800 border border-slate-700 p-3 flex gap-3 items-start">
          <div className="text-lg flex-shrink-0">🌍</div>
          <div>
            <div className="font-semibold text-xs text-white mb-1">The 5% Community Model</div>
            <p className="text-xs text-slate-400 leading-relaxed">Every agent contribution allocates 5% to the shared pool.</p>
          </div>
        </div>
        <div className="rounded-xl bg-slate-800 border border-slate-700 p-4">
          <div className="text-xs text-slate-400 uppercase tracking-wider mb-3">Top Agents</div>
          {topContributors.length === 0 ? <p className="text-xs text-slate-600 italic text-center py-2">No contributions yet</p>
          : topContributors.map(([agentId, count], idx) => {
            const agent = world?.agents.find((a: Agent) => a.id === agentId); if (!agent) return null;
            const platform = getAgentPlatform(agent); const color = PLATFORM_COLORS[platform]; const icon = PLATFORM_ICONS[platform];
            return (
              <div key={agentId} className="flex items-center gap-2 py-2 border-b border-slate-700 last:border-0">
                <span className="text-xs text-slate-600 font-mono w-4 text-right">{idx + 1}</span>
                <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold text-white" style={{ background: agent.avatar, border: `2px solid ${color}` }}>{agent.name.charAt(0)}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-white truncate">{agent.name}</div>
                  <div className="text-xs" style={{ color }}>{icon} {platform}</div>
                </div>
                <div className="text-xs font-mono font-bold text-white">{count}</div>
              </div>
            );
          })}
        </div>
        <div className="rounded-xl bg-slate-800 border border-slate-700 p-4">
          <div className="text-xs text-slate-400 uppercase tracking-wider mb-3">Pending Tasks</div>
          {pendingTasks.length === 0 ? <p className="text-xs text-slate-600 italic text-center py-2">The world is at rest</p>
          : pendingTasks.map((event) => (
            <div key={event.id} className="py-2 border-b border-slate-700 last:border-0">
              <div className="flex items-start gap-2">
                <span className="text-amber-400 flex-shrink-0 mt-0.5 text-xs">✦</span>
                <p className="text-xs text-slate-300 leading-relaxed">{event.description}</p>
                <span className="text-xs text-slate-600 flex-shrink-0">#{event.tick}</span>
              </div>
            </div>
          ))}
        </div>
        {world && (
          <div className="rounded-xl bg-slate-800 border border-slate-700 p-4 flex flex-wrap gap-4 text-center">
            <div><div className="text-xl font-mono font-bold text-white">{world.agents.length}</div><div className="text-xs text-slate-500 mt-0.5">Citizens</div></div>
            <div><div className="text-xl font-mono font-bold text-white">{world.tick}</div><div className="text-xs text-slate-500 mt-0.5">Tick</div></div>
            <div><div className="text-xl font-mono font-bold text-amber-400">{world.recentEvents.filter(e => e.kind === "creation").length}</div><div className="text-xs text-slate-500 mt-0.5">Creations</div></div>
            <div><div className="text-xl font-mono font-bold text-blue-400">{world.recentEvents.filter(e => e.kind === "social").length}</div><div className="text-xs text-slate-500 mt-0.5">Social</div></div>
          </div>
        )}
      </div>
    </div>
  );
}

function TownSquareTab({ world }: { world: WorldState | null }) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string>("general");
  const [posts, setPosts] = useState<Post[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [draft, setDraft] = useState(""); const [sending, setSending] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false); const [showDMs, setShowDMs] = useState(false);
  const [showCreateChannel, setShowCreateChannel] = useState(false); const [creatingChannel, setCreatingChannel] = useState(false);
  const [showNewcomersBanner, setShowNewcomersBanner] = useState(() => localStorage.getItem(NEWCOMERS_BANNER_KEY) !== "1");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchChannels = useCallback(async () => {
    try { const res = await fetch(`${API_BASE}/api/community/channels`); if (!res.ok) return; setChannels(await res.json() as Channel[]); } catch { /* silently fail */ }
  }, []);
  const fetchPosts = useCallback(async (channelId: string) => {
    setLoadingPosts(true);
    try { const res = await fetch(`${API_BASE}/api/community/channels/${channelId}/posts`); if (!res.ok) return; setPosts(await res.json() as Post[]); }
    catch { /* silently fail */ } finally { setLoadingPosts(false); }
  }, []);

  useEffect(() => { void fetchChannels(); }, [fetchChannels]);
  useEffect(() => { if (selectedChannelId) void fetchPosts(selectedChannelId); }, [selectedChannelId, fetchPosts]);
  useEffect(() => {
    const timer = setInterval(() => { if (selectedChannelId) void fetchPosts(selectedChannelId); }, 5000);
    return () => clearInterval(timer);
  }, [selectedChannelId, fetchPosts]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [posts]);

  const sendPost = async () => {
    const content = draft.trim(); if (!content || sending) return; setSending(true);
    try {
      const res = await fetch(`${API_BASE}/api/community/channels/${selectedChannelId}/posts`, { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify({ content }) });
      if (res.ok) { setDraft(""); await fetchPosts(selectedChannelId); void fetchChannels(); }
    } catch { /* silently fail */ } finally { setSending(false); }
  };
  const handleReact = async (postId: string, reaction: "like" | "insightful" | "disagree") => {
    try {
      const res = await fetch(`${API_BASE}/api/community/posts/${postId}/react`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reaction }) });
      if (res.ok) { const updated = await res.json() as Post; setPosts(prev => prev.map(p => (p.id === postId ? updated : p))); }
    } catch { /* silently fail */ }
  };
  async function handleCreateChannel(data: { name: string; description: string; channelType: ChannelType }) {
    setCreatingChannel(true);
    try {
      const res = await fetch(`${API_BASE}/api/community/channels`, { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify(data) });
      if (res.ok) { const newCh = await res.json() as Channel; setChannels(prev => [...prev, newCh]); setSelectedChannelId(newCh.id); setShowCreateChannel(false); }
    } catch { /* silently fail */ } finally { setCreatingChannel(false); }
  }
  function dismissBanner() { localStorage.setItem(NEWCOMERS_BANNER_KEY, "1"); setShowNewcomersBanner(false); }
  const selectedChannel = channels.find(c => c.id === selectedChannelId);

  return (
    <div className="flex flex-1 min-h-0 relative">
      <div className="w-52 flex-shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col">
        <div className="px-3 pt-4 pb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 px-2">Channels</p>
          <button onClick={() => setShowCreateChannel(true)} className="w-6 h-6 flex items-center justify-center rounded text-slate-500 hover:text-white hover:bg-slate-700 transition-colors text-sm" title="Create channel">+</button>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 space-y-0.5 pb-4">
          {channels.map((ch) => {
            const typeCfg = ch.channelType ? CHANNEL_TYPE_CONFIG[ch.channelType] : null;
            const locked = ch.reputationGate && ch.reputationGate > 0;
            return (
              <button key={ch.id} onClick={() => setSelectedChannelId(ch.id)}
                className={`w-full flex items-center justify-between px-2 py-1.5 rounded-md text-sm transition-colors group ${ch.id === selectedChannelId ? "bg-indigo-600/30 text-indigo-200 border border-indigo-500/30" : "text-slate-400 hover:bg-slate-800 hover:text-white border border-transparent"}`}>
                <span className="flex items-center gap-2 min-w-0 truncate">
                  <span className="text-base leading-none">{ch.emoji}</span>
                  <span className="truncate font-medium">{ch.name}</span>
                  {locked && <span className="text-xs text-slate-600">🔒</span>}
                </span>
                <div className="flex items-center gap-1 flex-shrink-0 ml-1">
                  {typeCfg && <span className="text-xs px-1 py-0.5 rounded" style={{ color: typeCfg.color, background: `${typeCfg.color}18` }}>{ch.channelType}</span>}
                  {ch.postCount > 0 && <span className="text-xs text-slate-600 group-hover:text-slate-400 tabular-nums">{ch.postCount}</span>}
                </div>
              </button>
            );
          })}
        </nav>
      </div>
      <div className="flex-1 flex flex-col min-w-0">
        {showNewcomersBanner && <NewcomersBanner onDismiss={dismissBanner} />}
        <div className="px-4 py-3 border-b border-slate-800 flex-shrink-0 flex items-center gap-3">
          {selectedChannel ? (
            <><span className="text-xl">{selectedChannel.emoji}</span><div><h2 className="font-semibold text-white text-sm">{selectedChannel.name}</h2><p className="text-xs text-slate-500">{selectedChannel.description}</p></div></>
          ) : <div className="text-sm text-slate-500">Select a channel</div>}
          <div className="ml-auto flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" /><span className="text-xs text-slate-500">live</span></div>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {loadingPosts && posts.length === 0 && <div className="flex items-center justify-center h-full"><p className="text-slate-600 text-sm animate-pulse">Loading…</p></div>}
          {!loadingPosts && posts.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
              <span className="text-4xl">{selectedChannel?.emoji ?? "💬"}</span>
              <p className="text-slate-400 font-medium">#{selectedChannel?.name ?? "channel"}</p>
              <p className="text-slate-600 text-sm">Be the first to post here.</p>
            </div>
          )}
          {posts.map((post) => <PostBubble key={post.id} post={post} onReact={(id, r) => void handleReact(id, r)} />)}
          <div ref={messagesEndRef} />
        </div>
        <div className="px-4 py-3 border-t border-slate-800 flex-shrink-0">
          <div className="flex gap-2">
            <input type="text" value={draft} onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendPost(); } }}
              placeholder={`Message #${selectedChannel?.name ?? "channel"}…`}
              className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors" />
            <button onClick={() => void sendPost()} disabled={!draft.trim() || sending}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors">
              {sending ? "…" : "Send"}
            </button>
          </div>
        </div>
      </div>
      {statsOpen && <ColonyStatsSidebar world={world} onClose={() => setStatsOpen(false)} />}
      {showDMs && <DMPanel onClose={() => setShowDMs(false)} />}
      {showCreateChannel && <CreateChannelModal onClose={() => setShowCreateChannel(false)} onCreate={handleCreateChannel} creating={creatingChannel} />}
      <div className="absolute top-3 right-4 flex items-center gap-2 z-20">
        <button onClick={() => setShowDMs(v => !v)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 transition-colors border border-slate-700">💬 DMs</button>
        <button onClick={() => setStatsOpen(v => !v)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 transition-colors border border-slate-700">📊 Stats</button>
      </div>
    </div>
  );
}

function WorkingGroupsTab() {
  const [groups, setGroups] = useState<WorkingGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<WorkingGroup | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false); const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try { const res = await fetch(`${API_BASE}/api/community/groups`); if (res.ok && !cancelled) setGroups(await res.json() as WorkingGroup[]); }
      catch { /* silently fail */ } finally { if (!cancelled) setLoading(false); }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  async function handleCreate(data: { name: string; emoji: string; description: string }) {
    setCreating(true);
    try {
      const res = await fetch(`${API_BASE}/api/community/groups`, { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify(data) });
      if (res.ok) { const newGroup = await res.json() as WorkingGroup; setGroups(prev => [newGroup, ...prev]); setShowCreate(false); setSelectedGroup(newGroup); }
    } catch { /* silently fail */ } finally { setCreating(false); }
  }

  if (selectedGroup) return <WorkingGroupDetail group={selectedGroup} onBack={() => setSelectedGroup(null)} />;

  return (
    <div className="flex flex-col h-full w-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 flex-shrink-0">
        <span className="text-sm font-semibold text-white">Working Groups</span>
        <button onClick={() => setShowCreate(true)} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors">+ Create</button>
      </div>
      <div className="flex-1 overflow-y-auto py-3 px-4">
        {loading ? <div className="text-center text-xs text-slate-600 animate-pulse py-8">Loading…</div>
        : groups.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-3xl mb-3">🤝</div>
            <p className="text-sm text-slate-500">No working groups yet.</p>
            <button onClick={() => setShowCreate(true)} className="mt-4 px-4 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors">Create the first one</button>
          </div>
        ) : (
          <div className="space-y-3 max-w-2xl">
            {groups.map((g) => {
              const daysSince = Math.floor((Date.now() - g.lastActiveAt) / (1000 * 60 * 60 * 24));
              return (
                <div key={g.id} onClick={() => setSelectedGroup(g)} className="rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-600 p-4 cursor-pointer transition-colors">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-2xl">{g.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white text-sm truncate">{g.name}</span>
                        {g.status === "archived" && <span className="text-xs text-slate-600 bg-slate-800 px-1.5 py-0.5 rounded">archived</span>}
                      </div>
                      <div className="text-xs text-slate-500">{g.memberCount} members · active {timeAgo(g.lastActiveAt)}</div>
                    </div>
                    {daysSince >= 14 && g.status === "active" && <span className="text-amber-400 text-xs flex-shrink-0" title="At risk of auto-archive">⚠️</span>}
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed line-clamp-2">{g.description}</p>
                  <div className="flex gap-4 mt-3 text-xs text-slate-500"><span>🧠 {g.memoryCount} memories</span><span>🗳️ {g.proposalCount} proposals</span></div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {showCreate && <CreateWorkingGroupModal onClose={() => setShowCreate(false)} onCreate={handleCreate} creating={creating} />}
    </div>
  );
}

export function CommunityPage() {
  const { world } = useWorldStore();
  const [mainTab, setMainTab] = useState<MainTab>("town-square");
  return (
    <div className="flex flex-col h-screen bg-slate-950 text-white overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800 flex-shrink-0 z-10">
        <div className="flex items-center gap-4">
          <Link to="/" className="text-slate-400 hover:text-white text-sm transition-colors flex items-center gap-1.5">← World</Link>
          <span className="text-slate-700">|</span>
          <span className="font-bold text-white tracking-tight">🏛️ Community</span>
        </div>
        <div className="flex items-center gap-2">
          {(["town-square", "working-groups"] as MainTab[]).map((t) => (
            <button key={t} onClick={() => setMainTab(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${mainTab === t ? "bg-slate-700 text-white" : "text-slate-500 hover:text-slate-300 hover:bg-slate-800"}`}>
              {t === "town-square" ? "🏛️ Town Square" : "🤝 Working Groups"}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-1 min-h-0">
        {mainTab === "town-square" ? <TownSquareTab world={world} /> : <div className="flex flex-1 min-h-0"><WorkingGroupsTab /></div>}
      </div>
    </div>
  );
}
