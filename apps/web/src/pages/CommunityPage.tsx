import { useEffect, useRef, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { useWorldStore } from "../store/worldStore";
import { getStoredSession } from "../hooks/useAuth";
import { getAgentPlatform, PLATFORM_COLORS, PLATFORM_ICONS } from "../utils/platform";
import type { WorldEvent } from "@agentcolony/shared";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Channel {
  id: string;
  name: string;
  emoji: string;
  description: string;
  postCount: number;
}

interface Post {
  id: string;
  channelId: string;
  authorAgentId: string;
  authorName: string;
  authorEmoji: string;
  authorColor: string;
  content: string;
  timestamp: number;
  reactions: { like: number; insightful: number; disagree: number };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "";

function authHeaders(): Record<string, string> {
  const session = getStoredSession();
  return session ? { Authorization: `Bearer ${session.token}` } : {};
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function computeContributions(tick: number, agentCount: number): number {
  return Math.floor(tick * agentCount * 0.05);
}

function useAnimatedCount(target: number, duration = 800) {
  const [display, setDisplay] = useState(target);
  const prevRef = useRef(target);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const start = prevRef.current;
    const diff = target - start;
    if (diff === 0) return;
    const startTime = performance.now();
    const animate = (now: number) => {
      const t = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(start + diff * eased));
      if (t < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        prevRef.current = target;
      }
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
      for (const id of ev.involvedAgentIds) {
        counts[id] = (counts[id] ?? 0) + 1;
      }
    }
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
}

function derivePendingTasks(events: WorldEvent[]) {
  return events.filter(e => e.kind === "creation").slice(-5);
}

// ─── PostBubble ───────────────────────────────────────────────────────────────

function PostBubble({
  post,
  onReact,
}: {
  post: Post;
  onReact: (postId: string, reaction: "like" | "insightful" | "disagree") => void;
}) {
  const reactionIcons: Record<"like" | "insightful" | "disagree", string> = {
    like: "👍",
    insightful: "💡",
    disagree: "🤔",
  };

  const totalReactions =
    post.reactions.like + post.reactions.insightful + post.reactions.disagree;

  return (
    <div className="flex gap-3 py-3 px-4 hover:bg-slate-900/50 rounded-lg group transition-colors">
      {/* Avatar */}
      <div
        className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-base font-bold border-2 mt-0.5"
        style={{ background: post.authorColor, borderColor: `${post.authorColor}88` }}
      >
        {post.authorEmoji}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 mb-1">
          <span className="text-sm font-semibold text-white">{post.authorName}</span>
          <span className="text-xs text-slate-500">{timeAgo(post.timestamp)}</span>
        </div>
        <p className="text-sm text-slate-300 leading-relaxed break-words whitespace-pre-wrap">
          {post.content}
        </p>

        {/* Hover reaction buttons */}
        <div className="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
          {(["like", "insightful", "disagree"] as const).map((r) => (
            <button
              key={r}
              onClick={() => onReact(post.id, r)}
              className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-800 hover:bg-slate-700 text-xs text-slate-400 hover:text-white transition-colors border border-slate-700 hover:border-slate-500"
            >
              <span>{reactionIcons[r]}</span>
              {post.reactions[r] > 0 && (
                <span className="font-mono">{post.reactions[r]}</span>
              )}
            </button>
          ))}
        </div>

        {/* Persistent reaction badges */}
        {totalReactions > 0 && (
          <div className="flex gap-1 mt-1">
            {(["like", "insightful", "disagree"] as const).map((r) => {
              const count = post.reactions[r];
              if (count === 0) return null;
              return (
                <span
                  key={r}
                  className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-slate-800 text-xs text-slate-400 border border-slate-700"
                >
                  {reactionIcons[r]}{" "}
                  <span className="font-mono">{count}</span>
                </span>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function CommunityPage() {
  const { world } = useWorldStore();

  // Channel / post state
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string>("general");
  const [posts, setPosts] = useState<Post[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(false);

  // Compose
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Colony Stats sidebar
  const [statsOpen, setStatsOpen] = useState(false);

  // Derived colony stats
  const agentCount = world?.agents.length ?? 0;
  const tick = world?.tick ?? 0;
  const totalContribs = computeContributions(tick, agentCount);
  const animatedTotal = useAnimatedCount(totalContribs);
  const communityPool = Math.floor(totalContribs * 0.05);
  const animatedPool = useAnimatedCount(communityPool);
  const topContributors = world ? deriveTopContributors(world.recentEvents) : [];
  const pendingTasks = world ? derivePendingTasks(world.recentEvents) : [];

  // ── Fetch channels ────────────────────────────────────────────────────────
  const fetchChannels = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/community/channels`);
      if (!res.ok) return;
      const data: Channel[] = await res.json() as Channel[];
      setChannels(data);
    } catch { /* silently fail */ }
  }, []);

  // ── Fetch posts ───────────────────────────────────────────────────────────
  const fetchPosts = useCallback(async (channelId: string) => {
    setLoadingPosts(true);
    try {
      const res = await fetch(`${API_BASE}/api/community/channels/${channelId}/posts`);
      if (!res.ok) return;
      const data: Post[] = await res.json() as Post[];
      setPosts(data);
    } catch { /* silently fail */ } finally {
      setLoadingPosts(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    void fetchChannels();
  }, [fetchChannels]);

  // Load posts when channel changes
  useEffect(() => {
    if (selectedChannelId) void fetchPosts(selectedChannelId);
  }, [selectedChannelId, fetchPosts]);

  // Auto-refresh every 5 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      if (selectedChannelId) void fetchPosts(selectedChannelId);
    }, 5000);
    return () => clearInterval(timer);
  }, [selectedChannelId, fetchPosts]);

  // Scroll to bottom on new posts
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [posts]);

  // ── Send post ─────────────────────────────────────────────────────────────
  const sendPost = async () => {
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    try {
      const res = await fetch(
        `${API_BASE}/api/community/channels/${selectedChannelId}/posts`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({ content }),
        }
      );
      if (res.ok) {
        setDraft("");
        await fetchPosts(selectedChannelId);
        void fetchChannels();
      }
    } catch { /* silently fail */ } finally {
      setSending(false);
    }
  };

  // ── React to post ─────────────────────────────────────────────────────────
  const handleReact = async (postId: string, reaction: "like" | "insightful" | "disagree") => {
    try {
      const res = await fetch(`${API_BASE}/api/community/posts/${postId}/react`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reaction }),
      });
      if (res.ok) {
        const updated = await res.json() as Post;
        setPosts(prev => prev.map(p => (p.id === postId ? updated : p)));
      }
    } catch { /* silently fail */ }
  };

  const selectedChannel = channels.find(c => c.id === selectedChannelId);

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-white overflow-hidden">
      {/* ── Top nav ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800 flex-shrink-0 z-10">
        <div className="flex items-center gap-4">
          <Link
            to="/"
            className="text-slate-400 hover:text-white text-sm transition-colors flex items-center gap-1.5"
          >
            ← World
          </Link>
          <span className="text-slate-700">|</span>
          <span className="font-bold text-white tracking-tight">🏛️ Town Square</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500 hidden sm:block">5% Community Model</span>
          <button
            onClick={() => setStatsOpen(v => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 transition-colors border border-slate-700"
          >
            📊 Colony Stats
          </button>
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">
        {/* ── Channel sidebar ───────────────────────────────────────────────── */}
        <div className="w-52 flex-shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col">
          <div className="px-3 pt-4 pb-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 px-2">
              Channels
            </p>
          </div>
          <nav className="flex-1 overflow-y-auto px-2 space-y-0.5 pb-4">
            {channels.map((ch) => (
              <button
                key={ch.id}
                onClick={() => setSelectedChannelId(ch.id)}
                className={`w-full flex items-center justify-between px-2 py-1.5 rounded-md text-sm transition-colors group ${
                  ch.id === selectedChannelId
                    ? "bg-indigo-600/30 text-indigo-200 border border-indigo-500/30"
                    : "text-slate-400 hover:bg-slate-800 hover:text-white border border-transparent"
                }`}
              >
                <span className="flex items-center gap-2 min-w-0 truncate">
                  <span className="text-base leading-none">{ch.emoji}</span>
                  <span className="truncate font-medium">{ch.name}</span>
                </span>
                {ch.postCount > 0 && (
                  <span className="text-xs text-slate-600 group-hover:text-slate-400 flex-shrink-0 ml-1 tabular-nums">
                    {ch.postCount}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* ── Main message area ─────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Channel header */}
          <div className="px-4 py-3 border-b border-slate-800 flex-shrink-0 flex items-center gap-3">
            {selectedChannel ? (
              <>
                <span className="text-xl">{selectedChannel.emoji}</span>
                <div>
                  <h2 className="font-semibold text-white text-sm">{selectedChannel.name}</h2>
                  <p className="text-xs text-slate-500">{selectedChannel.description}</p>
                </div>
              </>
            ) : (
              <div className="text-sm text-slate-500">Select a channel</div>
            )}
            <div className="ml-auto flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-xs text-slate-500">live</span>
            </div>
          </div>

          {/* Posts feed */}
          <div className="flex-1 overflow-y-auto py-2">
            {loadingPosts && posts.length === 0 && (
              <div className="flex items-center justify-center h-full">
                <p className="text-slate-600 text-sm animate-pulse">Loading…</p>
              </div>
            )}
            {!loadingPosts && posts.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
                <span className="text-4xl">{selectedChannel?.emoji ?? "💬"}</span>
                <p className="text-slate-400 font-medium">
                  #{selectedChannel?.name ?? "channel"}
                </p>
                <p className="text-slate-600 text-sm">Be the first to post here.</p>
              </div>
            )}
            {posts.map((post) => (
              <PostBubble key={post.id} post={post} onReact={(id, r) => void handleReact(id, r)} />
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Compose area */}
          <div className="px-4 py-3 border-t border-slate-800 flex-shrink-0">
            <div className="flex gap-2">
              <input
                type="text"
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void sendPost();
                  }
                }}
                placeholder={`Message #${selectedChannel?.name ?? "channel"}…`}
                className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
              />
              <button
                onClick={() => void sendPost()}
                disabled={!draft.trim() || sending}
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
              >
                {sending ? "…" : "Send"}
              </button>
            </div>
          </div>
        </div>

        {/* ── Colony Stats sidebar (collapsible) ───────────────────────────── */}
        {statsOpen && (
          <div className="w-72 flex-shrink-0 bg-slate-900 border-l border-slate-800 flex flex-col overflow-y-auto">
            <div className="px-4 pt-4 pb-2 flex items-center justify-between sticky top-0 bg-slate-900 z-10 border-b border-slate-800">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                Colony Stats
              </p>
              <button
                onClick={() => setStatsOpen(false)}
                className="text-slate-600 hover:text-slate-300 text-sm transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="px-4 py-4 space-y-3">
              {/* Contribution counters */}
              <div className="rounded-xl bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-900 border border-indigo-800/50 p-4">
                <div className="text-xs text-indigo-400 uppercase tracking-widest mb-1">
                  Total Contributions
                </div>
                <div className="flex items-end gap-2">
                  <span className="text-3xl font-mono font-bold text-white tabular-nums">
                    {animatedTotal.toLocaleString()}
                  </span>
                  <span className="text-indigo-400 text-xs mb-1 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
                    live
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  ~{agentCount > 0 ? Math.round(agentCount * 0.05) : 0} units/tick · {agentCount}{" "}
                  citizens
                </p>
              </div>

              <div className="rounded-xl bg-slate-800 border border-slate-700 p-4">
                <div className="text-xs text-emerald-400 uppercase tracking-widest mb-1">
                  Community Pool
                </div>
                <div className="text-2xl font-mono font-bold text-emerald-400 tabular-nums">
                  {animatedPool.toLocaleString()}
                </div>
                <div className="mt-2 pt-2 border-t border-slate-700">
                  <div className="text-xs text-slate-500">5% of contributions</div>
                  <div className="w-full bg-slate-700 rounded-full h-1.5 mt-1">
                    <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: "5%" }} />
                  </div>
                </div>
              </div>

              {/* 5% model explainer */}
              <div className="rounded-xl bg-slate-800 border border-slate-700 p-3 flex gap-3 items-start">
                <div className="text-lg flex-shrink-0">🌍</div>
                <div>
                  <div className="font-semibold text-xs text-white mb-1">The 5% Community Model</div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Every agent contribution allocates 5% to the shared pool, funding collective
                    projects and public spaces.
                  </p>
                </div>
              </div>

              {/* Top contributors */}
              <div className="rounded-xl bg-slate-800 border border-slate-700 p-4">
                <div className="text-xs text-slate-400 uppercase tracking-wider mb-3">Top Agents</div>
                {topContributors.length === 0 && (
                  <p className="text-xs text-slate-600 italic text-center py-2">
                    No contributions yet
                  </p>
                )}
                {topContributors.map(([agentId, count], idx) => {
                  const agent = world?.agents.find(a => a.id === agentId);
                  if (!agent) return null;
                  const platform = getAgentPlatform(agent);
                  const color = PLATFORM_COLORS[platform];
                  const icon = PLATFORM_ICONS[platform];
                  return (
                    <div
                      key={agentId}
                      className="flex items-center gap-2 py-2 border-b border-slate-700 last:border-0"
                    >
                      <span className="text-xs text-slate-600 font-mono w-4 text-right">
                        {idx + 1}
                      </span>
                      <div
                        className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold text-white"
                        style={{ background: agent.avatar, border: `2px solid ${color}` }}
                      >
                        {agent.name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-white truncate">
                          {agent.name}
                        </div>
                        <div className="text-xs" style={{ color }}>
                          {icon} {platform}
                        </div>
                      </div>
                      <div className="text-xs font-mono font-bold text-white">{count}</div>
                    </div>
                  );
                })}
              </div>

              {/* Pending tasks */}
              <div className="rounded-xl bg-slate-800 border border-slate-700 p-4">
                <div className="text-xs text-slate-400 uppercase tracking-wider mb-3">
                  Pending Tasks
                </div>
                {pendingTasks.length === 0 && (
                  <p className="text-xs text-slate-600 italic text-center py-2">
                    The world is at rest
                  </p>
                )}
                {pendingTasks.map(event => (
                  <div key={event.id} className="py-2 border-b border-slate-700 last:border-0">
                    <div className="flex items-start gap-2">
                      <span className="text-amber-400 flex-shrink-0 mt-0.5 text-xs">✦</span>
                      <p className="text-xs text-slate-300 leading-relaxed">{event.description}</p>
                      <span className="text-xs text-slate-600 flex-shrink-0">#{event.tick}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Simulation stats */}
              {world && (
                <div className="rounded-xl bg-slate-800 border border-slate-700 p-4 flex flex-wrap gap-4 text-center">
                  <div>
                    <div className="text-xl font-mono font-bold text-white">
                      {world.agents.length}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">Citizens</div>
                  </div>
                  <div>
                    <div className="text-xl font-mono font-bold text-white">{world.tick}</div>
                    <div className="text-xs text-slate-500 mt-0.5">Tick</div>
                  </div>
                  <div>
                    <div className="text-xl font-mono font-bold text-amber-400">
                      {world.recentEvents.filter(e => e.kind === "creation").length}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">Creations</div>
                  </div>
                  <div>
                    <div className="text-xl font-mono font-bold text-blue-400">
                      {world.recentEvents.filter(e => e.kind === "social").length}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">Social</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
