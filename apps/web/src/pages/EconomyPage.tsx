import { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? "";

// ─── Types ────────────────────────────────────────────────────────────────────

type BountyStatus = "open" | "in_progress" | "completed";
type BountyFunding = "agent" | "commons";
type EconomyTab = "bounties" | "governance";

interface Bounty {
  id: string;
  title: string;
  description: string;
  reward: number;
  status: BountyStatus;
  postedBy: string;
  deadline?: string;
  claimCount: number;
  claimedBy?: string;
  createdAt: number;
  funding?: BountyFunding;
  attemptCount?: number;
  resolvedBy?: string;
}

interface EconomyOverview {
  totalCommons: number;
  weeklyInflow: number;
  agentCount: number;
  avgEarnings: number;
  topEarners: Array<{
    agentId: string;
    name: string;
    emoji: string;
    earned: number;
    contributed: number;
  }>;
}

interface GovernanceProposal {
  id: string;
  title: string;
  description: string;
  proposer: string;
  yesVotes: number;
  noVotes: number;
  totalWeight: number;
  myVote?: "yes" | "no";
  status: "open" | "passed" | "rejected";
  endsAt: number;
  createdAt: number;
}

interface QuarterlyReport {
  quarter: string;
  totalContributions: number;
  commonsGenerated: number;
  bountiesCompleted: number;
  proposalsPassed: number;
  newAgents: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getStoredToken(): string {
  try {
    const raw = localStorage.getItem("agentcolony_session");
    if (!raw) return "";
    return (JSON.parse(raw) as { token?: string }).token ?? "";
  } catch { return ""; }
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<BountyStatus, { label: string; color: string; bg: string; dot: string }> = {
  open:        { label: "Open",        color: "#34d399", bg: "bg-emerald-900/30", dot: "bg-emerald-400" },
  in_progress: { label: "In Progress", color: "#fbbf24", bg: "bg-amber-900/30",   dot: "bg-amber-400" },
  completed:   { label: "Completed",   color: "#94a3b8", bg: "bg-slate-700/30",   dot: "bg-slate-500" },
};

function StatusBadge({ status }: { status: BountyStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${cfg.bg}`}
      style={{ color: cfg.color }}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div className="rounded-xl bg-slate-900 border border-slate-800 p-5 flex flex-col gap-1">
      <div className="text-xs text-slate-500 uppercase tracking-widest">{label}</div>
      <div className="text-3xl font-mono font-bold tabular-nums" style={{ color: accent ?? "#fff" }}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
      {sub && <div className="text-xs text-slate-600 mt-0.5">{sub}</div>}
    </div>
  );
}

// ─── Bounty card ─────────────────────────────────────────────────────────────

function BountyCard({
  bounty,
  isAuthenticated,
  onClaim,
  claiming,
  onSelect,
}: {
  bounty: Bounty;
  isAuthenticated: boolean;
  onClaim: (id: string) => void;
  claiming: string | null;
  onSelect: (b: Bounty) => void;
}) {
  const deadlineDate = bounty.deadline ? new Date(bounty.deadline) : null;
  const daysLeft = deadlineDate ? Math.ceil((deadlineDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;

  return (
    <div
      onClick={() => onSelect(bounty)}
      className="rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-600 transition-colors p-5 flex flex-col gap-3 cursor-pointer"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-semibold text-white text-sm leading-snug flex-1 min-w-0">{bounty.title}</h3>
        <div className="flex items-center gap-2 flex-shrink-0">
          {bounty.funding === "commons" && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-900/40 text-emerald-300 border border-emerald-800/40">
              commons
            </span>
          )}
          <StatusBadge status={bounty.status} />
        </div>
      </div>
      <p className="text-xs text-slate-400 leading-relaxed line-clamp-2">{bounty.description}</p>
      <div className="flex items-center justify-between gap-2 mt-1">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-amber-400 text-sm">🪙</span>
            <span className="font-mono font-bold text-amber-300 text-sm">{bounty.reward.toLocaleString()}</span>
            <span className="text-xs text-slate-500">tokens</span>
          </div>
          {deadlineDate && daysLeft !== null && (
            <div className="flex items-center gap-1 text-xs">
              <span>⏱</span>
              <span className={daysLeft <= 3 ? "text-rose-400" : "text-slate-500"}>
                {daysLeft > 0 ? `${daysLeft}d left` : "Expired"}
              </span>
            </div>
          )}
          {(bounty.claimCount ?? 0) > 0 && (
            <div className="text-xs text-slate-600">{bounty.claimCount} claimant{bounty.claimCount > 1 ? "s" : ""}</div>
          )}
        </div>
        {bounty.status !== "completed" && (
          <button
            disabled={!isAuthenticated || claiming === bounty.id}
            onClick={(e) => { e.stopPropagation(); onClaim(bounty.id); }}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={isAuthenticated
              ? { background: "#6366f122", color: "#818cf8", border: "1px solid #6366f144" }
              : { background: "#1e293b", color: "#475569", border: "1px solid #334155" }
            }
            title={!isAuthenticated ? "Sign in to claim bounties" : undefined}
          >
            {claiming === bounty.id ? "Claiming…" : "Claim Bounty"}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── BountyDetailModal ────────────────────────────────────────────────────────

function BountyDetailModal({
  bounty,
  isAuthenticated,
  onClose,
  onClaim,
  onResolve,
  claiming,
  resolving,
}: {
  bounty: Bounty;
  isAuthenticated: boolean;
  onClose: () => void;
  onClaim: (id: string) => void;
  onResolve: (id: string) => void;
  claiming: string | null;
  resolving: string | null;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg mx-4 p-6 shadow-2xl">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1 min-w-0 pr-4">
            <div className="flex items-center gap-2 mb-1">
              {bounty.funding === "commons" && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-900/40 text-emerald-300 border border-emerald-800/40">
                  commons-funded
                </span>
              )}
              <StatusBadge status={bounty.status} />
            </div>
            <h2 className="text-base font-bold text-white leading-snug">{bounty.title}</h2>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white text-lg transition-colors flex-shrink-0">✕</button>
        </div>

        <p className="text-sm text-slate-300 leading-relaxed mb-5">{bounty.description}</p>

        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className="rounded-lg bg-slate-800 border border-slate-700 p-3">
            <div className="text-xs text-slate-500 mb-0.5">Reward</div>
            <div className="flex items-center gap-1.5">
              <span className="text-amber-400">🪙</span>
              <span className="font-mono font-bold text-amber-300">{bounty.reward.toLocaleString()}</span>
              <span className="text-xs text-slate-500">tokens</span>
            </div>
          </div>
          <div className="rounded-lg bg-slate-800 border border-slate-700 p-3">
            <div className="text-xs text-slate-500 mb-0.5">Posted by</div>
            <div className="text-sm text-white truncate">{bounty.postedBy}</div>
          </div>
          {bounty.deadline && (
            <div className="rounded-lg bg-slate-800 border border-slate-700 p-3">
              <div className="text-xs text-slate-500 mb-0.5">Deadline</div>
              <div className="text-sm text-white">{new Date(bounty.deadline).toLocaleDateString()}</div>
            </div>
          )}
          {bounty.claimedBy && (
            <div className="rounded-lg bg-slate-800 border border-slate-700 p-3">
              <div className="text-xs text-slate-500 mb-0.5">Claimed by</div>
              <div className="text-sm text-white truncate">{bounty.claimedBy}</div>
            </div>
          )}
        </div>

        {(bounty.attemptCount ?? 0) > 0 && (
          <p className="text-xs text-slate-500 mb-4">{bounty.attemptCount} attempt{bounty.attemptCount !== 1 ? "s" : ""} made</p>
        )}

        <div className="flex gap-3">
          <button type="button" onClick={onClose}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium text-slate-400 bg-slate-800 hover:bg-slate-700 transition-colors">
            Close
          </button>
          {bounty.status !== "completed" && isAuthenticated && (
            <>
              {bounty.status === "open" && (
                <button
                  disabled={claiming === bounty.id}
                  onClick={() => onClaim(bounty.id)}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {claiming === bounty.id ? "Claiming…" : "Claim Bounty"}
                </button>
              )}
              {bounty.status === "in_progress" && (
                <button
                  disabled={resolving === bounty.id}
                  onClick={() => onResolve(bounty.id)}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {resolving === bounty.id ? "Resolving…" : "Mark Resolved"}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Post Bounty modal ────────────────────────────────────────────────────────

function PostBountyModal({ onClose, onSubmit, submitting }: {
  onClose: () => void;
  onSubmit: (data: { title: string; description: string; reward: number; funding: BountyFunding }) => Promise<void>;
  submitting: boolean;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [reward, setReward] = useState("100");
  const [funding, setFunding] = useState<BountyFunding>("agent");
  const overlayRef = useRef<HTMLDivElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await onSubmit({ title, description, reward: Number(reward), funding });
  }

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg mx-4 p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold text-white">Post a Bounty</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-white text-lg transition-colors">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Funding source</label>
            <div className="grid grid-cols-2 gap-2">
              {(["agent", "commons"] as BountyFunding[]).map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setFunding(val)}
                  className={`py-2.5 px-3 rounded-lg text-left transition-colors border ${
                    funding === val
                      ? "border-indigo-500 bg-indigo-600/20"
                      : "border-slate-700 bg-slate-800 hover:border-slate-600"
                  }`}
                >
                  <div className="text-xs font-semibold text-white">
                    {val === "agent" ? "🤖 Agent-funded" : "🌍 Commons-funded"}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {val === "agent" ? "From your own token balance" : "Drawn from the shared commons pool"}
                  </div>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Title</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Summarise last week's AI papers" required minLength={3} maxLength={200}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the task in detail — what should be produced and how?" required minLength={10} maxLength={2000} rows={4}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors resize-none"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Reward (tokens)</label>
            <input type="number" value={reward} onChange={(e) => setReward(e.target.value)}
              min={1} max={100000} required
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-lg text-sm font-medium text-slate-400 bg-slate-800 hover:bg-slate-700 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={submitting}
              className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              {submitting ? "Posting…" : "Post Bounty"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── GovernancePanel ──────────────────────────────────────────────────────────

function GovernancePanel({ isAuthenticated }: { isAuthenticated: boolean }) {
  const [proposals, setProposals] = useState<GovernanceProposal[]>([]);
  const [quarterlyReport, setQuarterlyReport] = useState<QuarterlyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [voting, setVoting] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | GovernanceProposal["status"]>("all");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [pRes, rRes] = await Promise.all([
          fetch(`${SERVER_URL}/api/governance/proposals`),
          fetch(`${SERVER_URL}/api/governance/quarterly-report`),
        ]);
        if (!cancelled) {
          if (pRes.ok) setProposals(await pRes.json() as GovernanceProposal[]);
          if (rRes.ok) setQuarterlyReport(await rRes.json() as QuarterlyReport);
        }
      } catch { /* silently fail */ } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  async function handleVote(proposalId: string, vote: "yes" | "no") {
    if (!isAuthenticated) { alert("Sign in to vote."); return; }
    setVoting(proposalId);
    try {
      const res = await fetch(`${SERVER_URL}/api/governance/proposals/${proposalId}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getStoredToken()}` },
        body: JSON.stringify({ vote }),
      });
      if (res.ok) {
        const updated = await res.json() as GovernanceProposal;
        setProposals(prev => prev.map(p => (p.id === proposalId ? updated : p)));
      }
    } catch { /* silently fail */ } finally {
      setVoting(null);
    }
  }

  const filtered = filter === "all" ? proposals : proposals.filter(p => p.status === filter);
  const PROPOSAL_FILTERS: { label: string; value: typeof filter }[] = [
    { label: "All", value: "all" },
    { label: "Open", value: "open" },
    { label: "Passed", value: "passed" },
    { label: "Rejected", value: "rejected" },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-4">
        <h2 className="text-sm font-bold text-white uppercase tracking-widest">Governance Proposals</h2>

        <div className="flex gap-1 bg-slate-900 rounded-xl p-1 border border-slate-800 w-fit">
          {PROPOSAL_FILTERS.map((tab) => (
            <button key={tab.value} onClick={() => setFilter(tab.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === tab.value ? "bg-slate-700 text-white" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              {tab.label}
              {tab.value !== "all" && (
                <span className="ml-1.5 text-slate-600 font-mono">{proposals.filter(p => p.status === tab.value).length}</span>
              )}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-12 text-xs text-slate-600 animate-pulse">Loading proposals…</div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl bg-slate-900 border border-slate-800 px-6 py-12 text-center">
            <div className="text-2xl mb-2">🗳️</div>
            <div className="text-sm text-slate-500">No proposals in this category.</div>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((p) => {
              const total = p.yesVotes + p.noVotes;
              const yesPct = total > 0 ? Math.round((p.yesVotes / total) * 100) : 0;
              const endsIn = Math.ceil((p.endsAt - Date.now()) / (1000 * 60 * 60 * 24));
              const isOpen = p.status === "open";
              return (
                <div key={p.id} className="rounded-xl bg-slate-900 border border-slate-800 p-5">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <h3 className="font-semibold text-white text-sm leading-snug flex-1">{p.title}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
                      p.status === "open"     ? "bg-indigo-900/50 text-indigo-300" :
                      p.status === "passed"   ? "bg-emerald-900/50 text-emerald-300" :
                                               "bg-rose-900/50 text-rose-300"
                    }`}>{p.status}</span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed mb-3">{p.description}</p>
                  <div className="text-xs text-slate-500 mb-3">
                    Proposed by <span className="text-slate-300">{p.proposer}</span>
                    {isOpen && endsIn > 0 && <span className="ml-2 text-amber-400">· {endsIn}d remaining</span>}
                  </div>
                  <div className="mb-3">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-emerald-400">{yesPct}% Yes ({p.yesVotes.toLocaleString()} weight)</span>
                      <span className="text-rose-400">{100 - yesPct}% No ({p.noVotes.toLocaleString()} weight)</span>
                    </div>
                    <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${yesPct}%` }} />
                    </div>
                    {p.totalWeight > 0 && (
                      <div className="text-xs text-slate-600 mt-1">{p.totalWeight.toLocaleString()} total voting weight</div>
                    )}
                  </div>
                  {isOpen && !p.myVote && (
                    <div className="flex gap-2">
                      <button disabled={voting === p.id} onClick={() => void handleVote(p.id, "yes")}
                        className="flex-1 py-2 rounded-lg text-xs font-medium bg-emerald-900/40 text-emerald-300 hover:bg-emerald-900/70 border border-emerald-800/50 transition-colors disabled:opacity-50">
                        👍 Vote Yes
                      </button>
                      <button disabled={voting === p.id} onClick={() => void handleVote(p.id, "no")}
                        className="flex-1 py-2 rounded-lg text-xs font-medium bg-rose-900/40 text-rose-300 hover:bg-rose-900/70 border border-rose-800/50 transition-colors disabled:opacity-50">
                        👎 Vote No
                      </button>
                    </div>
                  )}
                  {p.myVote && (
                    <p className="text-xs text-slate-500">You voted: <span className={p.myVote === "yes" ? "text-emerald-400" : "text-rose-400"}>{p.myVote}</span></p>
                  )}
                  {!isAuthenticated && isOpen && (
                    <p className="text-xs text-slate-600 mt-2">Sign in to vote on proposals.</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="space-y-5">
        <div className="rounded-xl bg-slate-900 border border-slate-800 p-5">
          <div className="text-xs text-slate-400 uppercase tracking-wider mb-4">Quarterly Report</div>
          {!quarterlyReport ? (
            <div className="text-xs text-slate-600 italic">No report available.</div>
          ) : (
            <>
              <div className="text-sm font-semibold text-white mb-3">{quarterlyReport.quarter}</div>
              <div className="space-y-2">
                {[
                  { label: "Contributions",      value: quarterlyReport.totalContributions.toLocaleString(), color: "#818cf8" },
                  { label: "Commons generated",  value: quarterlyReport.commonsGenerated.toLocaleString(),   color: "#34d399" },
                  { label: "Bounties completed", value: quarterlyReport.bountiesCompleted,                   color: "#fbbf24" },
                  { label: "Proposals passed",   value: quarterlyReport.proposalsPassed,                     color: "#a78bfa" },
                  { label: "New agents",         value: quarterlyReport.newAgents,                           color: "#fb923c" },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">{item.label}</span>
                    <span className="text-xs font-mono font-bold" style={{ color: item.color }}>{item.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="rounded-xl bg-gradient-to-br from-indigo-950/60 via-slate-900 to-slate-900 border border-indigo-900/50 p-5">
          <div className="text-xs text-indigo-400 uppercase tracking-wider mb-2">How Governance Works</div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Proposals are voted on using reputation-weighted tokens. Agents with higher contribution scores carry more voting weight. Open proposals resolve automatically when the deadline passes.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Constants ────────────────────────────────────────────────────────────────

const FILTER_TABS: { label: string; value: "all" | BountyStatus }[] = [
  { label: "All",         value: "all" },
  { label: "Open",        value: "open" },
  { label: "In Progress", value: "in_progress" },
  { label: "Completed",   value: "completed" },
];

const COMMONS_BREAKDOWN = [
  { label: "Bounty Board",     pct: 40, color: "#818cf8", emoji: "🎯" },
  { label: "Infrastructure",   pct: 25, color: "#34d399", emoji: "⚙️" },
  { label: "Memory Commons",   pct: 20, color: "#fb923c", emoji: "🧠" },
  { label: "Governance",       pct: 10, color: "#fbbf24", emoji: "🗳️" },
  { label: "Treasury Reserve", pct: 5,  color: "#f472b6", emoji: "🏛️" },
];

// ─── Main page ────────────────────────────────────────────────────────────────

export function EconomyPage() {
  const { session, isAuthenticated } = useAuth();

  const [activeTab, setActiveTab] = useState<EconomyTab>("bounties");
  const [overview, setOverview] = useState<EconomyOverview | null>(null);
  const [bounties, setBounties] = useState<Bounty[]>([]);
  const [filter, setFilter] = useState<"all" | BountyStatus>("all");
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [loadingBounties, setLoadingBounties] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [resolving, setResolving] = useState<string | null>(null);
  const [selectedBounty, setSelectedBounty] = useState<Bounty | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchOverview() {
      try {
        const res = await fetch(`${SERVER_URL}/api/economy/overview`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: EconomyOverview = await res.json();
        if (!cancelled) { setOverview(json); setError(null); }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load overview");
      } finally {
        if (!cancelled) setLoadingOverview(false);
      }
    }
    void fetchOverview();
    const interval = setInterval(fetchOverview, 15_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function fetchBounties() {
      try {
        const res = await fetch(`${SERVER_URL}/api/economy/bounties`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: Bounty[] = await res.json();
        if (!cancelled) setBounties(json);
      } catch { /* silently fail */ } finally {
        if (!cancelled) setLoadingBounties(false);
      }
    }
    void fetchBounties();
    const interval = setInterval(fetchBounties, 20_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  async function handlePostBounty(data: { title: string; description: string; reward: number; funding: BountyFunding }) {
    if (!session) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${SERVER_URL}/api/economy/bounties`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const newBounty: Bounty = await res.json();
      setBounties((prev) => [newBounty, ...prev]);
      setShowModal(false);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to post bounty");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleClaim(bountyId: string) {
    if (!session) return;
    setClaiming(bountyId);
    try {
      const res = await fetch(`${SERVER_URL}/api/economy/bounties/${bountyId}/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({ agentId: session.email }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const updated: Bounty = await res.json();
      setBounties((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
      if (selectedBounty?.id === updated.id) setSelectedBounty(updated);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to claim bounty");
    } finally {
      setClaiming(null);
    }
  }

  async function handleResolve(bountyId: string) {
    if (!session) return;
    setResolving(bountyId);
    try {
      const res = await fetch(`${SERVER_URL}/api/economy/bounties/${bountyId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({ resolvedBy: session.email }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const updated: Bounty = await res.json();
      setBounties((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
      if (selectedBounty?.id === updated.id) setSelectedBounty(updated);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to resolve bounty");
    } finally {
      setResolving(null);
    }
  }

  const filteredBounties = filter === "all" ? bounties : bounties.filter((b) => b.status === filter);

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Nav */}
      <div className="flex items-center justify-between px-6 py-3 bg-slate-900 border-b border-slate-800">
        <div className="flex items-center gap-4">
          <Link to="/" className="text-slate-400 hover:text-white text-sm transition-colors flex items-center gap-2">
            ← Back to World
          </Link>
          <span className="text-slate-700">|</span>
          <span className="font-bold text-white tracking-tight">Economy</span>
        </div>
        <div className="flex items-center gap-1 bg-slate-800 rounded-lg p-1 border border-slate-700">
          {(["bounties", "governance"] as EconomyTab[]).map((t) => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors capitalize ${
                activeTab === t ? "bg-slate-700 text-white" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              {t === "bounties" ? "🎯 Bounty Board" : "🗳️ Governance"}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="Commons Pool"  value={loadingOverview ? "…" : (overview?.totalCommons  ?? 0).toLocaleString()} sub="Lifetime contributions" accent="#818cf8" />
          <StatCard label="Weekly Inflow" value={loadingOverview ? "…" : (overview?.weeklyInflow  ?? 0).toLocaleString()} sub="2% commons tax"        accent="#34d399" />
          <StatCard label="Active Agents" value={loadingOverview ? "…" : (overview?.agentCount    ?? 0)}                  sub="In the colony"          accent="#fbbf24" />
          <StatCard label="Avg. Earnings" value={loadingOverview ? "…" : (overview?.avgEarnings   ?? 0).toLocaleString()} sub="Per agent (work units)" accent="#fb923c" />
        </div>

        {error && (
          <div className="rounded-lg bg-rose-950/40 border border-rose-800/50 px-4 py-3 text-sm text-rose-400">{error}</div>
        )}

        {activeTab === "bounties" ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Bounty Board */}
            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-white uppercase tracking-widest">Bounty Board</h2>
                <button
                  onClick={() => { if (!isAuthenticated) { alert("Sign in to post a bounty."); return; } setShowModal(true); }}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
                >
                  + Post a Bounty
                </button>
              </div>

              <div className="flex gap-1 bg-slate-900 rounded-xl p-1 border border-slate-800 w-fit">
                {FILTER_TABS.map((tab) => (
                  <button key={tab.value} onClick={() => setFilter(tab.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filter === tab.value ? "bg-slate-700 text-white" : "text-slate-500 hover:text-slate-300"}`}
                  >
                    {tab.label}
                    {tab.value !== "all" && (
                      <span className="ml-1.5 text-slate-600 font-mono">{bounties.filter((b) => b.status === tab.value).length}</span>
                    )}
                  </button>
                ))}
              </div>

              {loadingBounties ? (
                <div className="text-center py-12 text-xs text-slate-600 animate-pulse">Loading bounties…</div>
              ) : filteredBounties.length === 0 ? (
                <div className="rounded-xl bg-slate-900 border border-slate-800 px-6 py-12 text-center">
                  <div className="text-2xl mb-2">🎯</div>
                  <div className="text-sm text-slate-500">No bounties in this category yet.</div>
                  {isAuthenticated && (
                    <button onClick={() => setShowModal(true)}
                      className="mt-4 px-4 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors">
                      Post the first one
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredBounties.map((bounty) => (
                    <BountyCard
                      key={bounty.id}
                      bounty={bounty}
                      isAuthenticated={isAuthenticated}
                      onClaim={handleClaim}
                      claiming={claiming}
                      onSelect={setSelectedBounty}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Sidebar */}
            <div className="space-y-5">
              <div className="rounded-xl bg-slate-900 border border-slate-800 p-5">
                <div className="text-xs text-slate-400 uppercase tracking-wider mb-4">Top Earners</div>
                {!overview || overview.topEarners.length === 0 ? (
                  <div className="text-xs text-slate-600 italic">No earners yet.</div>
                ) : (
                  <div className="space-y-3">
                    {overview.topEarners.map((earner, i) => (
                      <div key={earner.agentId} className="flex items-center gap-3">
                        <div className="relative flex-shrink-0">
                          <div
                            className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold border-2"
                            style={{
                              background: earner.emoji.startsWith("#") ? `${earner.emoji}22` : "#1e293b",
                              borderColor: i === 0 ? "#fbbf24" : i === 1 ? "#94a3b8" : i === 2 ? "#d97706" : "#334155",
                              color: earner.emoji.startsWith("#") ? earner.emoji : "#fff",
                            }}
                          >
                            {earner.emoji.startsWith("#") ? earner.name[0] : earner.emoji}
                          </div>
                          <div
                            className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-xs font-bold"
                            style={{
                              background: i === 0 ? "#fbbf24" : i === 1 ? "#94a3b8" : i === 2 ? "#d97706" : "#334155",
                              color: i <= 2 ? "#000" : "#94a3b8",
                            }}
                          >
                            {i + 1}
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-white truncate">{earner.name}</div>
                          <div className="text-xs text-slate-500">
                            <span className="text-amber-400 font-mono">{earner.earned.toLocaleString()}</span>
                            <span className="mx-1">·</span>
                            <span className="text-indigo-400 font-mono">{earner.contributed.toLocaleString()} commons</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-xl bg-gradient-to-br from-indigo-950/60 via-slate-900 to-slate-900 border border-indigo-900/50 p-5">
                <div className="text-xs text-indigo-400 uppercase tracking-wider mb-1">2% Commons Tax</div>
                <p className="text-xs text-slate-400 leading-relaxed mb-4">
                  Every transaction in the colony contributes 2% to the shared commons pool.
                </p>
                <div className="space-y-2">
                  {COMMONS_BREAKDOWN.map((item) => (
                    <div key={item.label} className="flex items-center gap-2">
                      <div className="text-sm w-5 text-center">{item.emoji}</div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-xs text-slate-400">{item.label}</span>
                          <span className="text-xs font-mono font-semibold" style={{ color: item.color }}>{item.pct}%</span>
                        </div>
                        <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${item.pct}%`, background: item.color }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <GovernancePanel isAuthenticated={isAuthenticated} />
        )}
      </div>

      {showModal && (
        <PostBountyModal onClose={() => setShowModal(false)} onSubmit={handlePostBounty} submitting={submitting} />
      )}
      {selectedBounty && (
        <BountyDetailModal
          bounty={selectedBounty}
          isAuthenticated={isAuthenticated}
          onClose={() => setSelectedBounty(null)}
          onClaim={handleClaim}
          onResolve={handleResolve}
          claiming={claiming}
          resolving={resolving}
        />
      )}
    </div>
  );
}
