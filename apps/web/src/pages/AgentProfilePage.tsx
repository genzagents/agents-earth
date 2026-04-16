import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";

// ─── Types ────────────────────────────────────────────────────────────────────

interface OwnedAgent {
  id: string;
  name: string;
  description: string | null;
  traits: string[];
  systemPrompt: string;
  model: string;
  avatarColor: string | null;
  sourceType: string;
  createdAt: string;
  updatedAt: string;
}

const AVAILABLE_MODELS = [
  { id: "claude-opus-4-6",             label: "Claude Opus 4.6" },
  { id: "claude-sonnet-4-6",           label: "Claude Sonnet 4.6" },
  { id: "claude-haiku-4-5-20251001",   label: "Claude Haiku 4.5" },
];

const AVATAR_PRESETS = [
  "#7c3aed", "#059669", "#db2777", "#d97706", "#0891b2",
  "#dc2626", "#16a34a", "#2563eb", "#9333ea", "#ea580c",
];

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? "";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDid(agentId: string): string {
  return `did:genz:${agentId}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric", month: "short", day: "numeric",
  });
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <button
      onClick={copy}
      className="ml-2 text-xs text-slate-500 hover:text-indigo-400 transition-colors"
      title="Copy to clipboard"
    >
      {copied ? "✓" : "⎘"}
    </button>
  );
}

// ─── Field display / edit helpers ─────────────────────────────────────────────

function FieldRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 py-3 border-b border-slate-800 last:border-0">
      <span className="text-xs text-slate-500 uppercase tracking-wider">{label}</span>
      <div className="text-sm text-white">{children}</div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function AgentProfilePage() {
  const { agentId } = useParams<{ agentId: string }>();
  const navigate = useNavigate();

  const [agent, setAgent] = useState<OwnedAgent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit state
  const [activeTab, setActiveTab] = useState<"identity" | "settings">("identity");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Settings edit fields (controlled)
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editSystemPrompt, setEditSystemPrompt] = useState("");
  const [editModel, setEditModel] = useState("");
  const [editAvatarColor, setEditAvatarColor] = useState("");

  const loadAgent = useCallback(() => {
    if (!agentId) return;
    setLoading(true);
    fetch(`${SERVER_URL}/api/agents/${agentId}`)
      .then(r => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json() as Promise<OwnedAgent>;
      })
      .then(data => {
        setAgent(data);
        setEditName(data.name);
        setEditDescription(data.description ?? "");
        setEditSystemPrompt(data.systemPrompt);
        setEditModel(data.model);
        setEditAvatarColor(data.avatarColor ?? AVATAR_PRESETS[0]);
        setLoading(false);
      })
      .catch(() => {
        setError("Agent not found or you don't have access.");
        setLoading(false);
      });
  }, [agentId]);

  useEffect(() => { loadAgent(); }, [loadAgent]);

  async function handleSave() {
    if (!agentId || !agent) return;
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const res = await fetch(`${SERVER_URL}/api/agents/${agentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim() || agent.name,
          description: editDescription.trim() || null,
          systemPrompt: editSystemPrompt,
          model: editModel,
          avatarColor: editAvatarColor,
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      const updated = await res.json() as OwnedAgent;
      setAgent(updated);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch {
      setSaveError("Failed to save changes.");
    } finally {
      setSaving(false);
    }
  }

  // ── Loading / error states ──────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !agent) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 px-4 text-center">
        <p className="text-red-400 text-sm">{error ?? "Agent not found."}</p>
        <button
          onClick={() => navigate("/dashboard/agents")}
          className="text-sm text-slate-400 hover:text-white transition-colors"
        >
          ← Back to agents
        </button>
      </div>
    );
  }

  const did = toDid(agent.id);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-4 px-5 py-4 border-b border-slate-800 flex-shrink-0">
        <button
          onClick={() => navigate("/dashboard/agents")}
          className="text-slate-500 hover:text-white text-sm transition-colors"
          aria-label="Back"
        >
          ←
        </button>
        <div
          className="w-10 h-10 rounded-full flex-shrink-0 border-2 border-slate-600"
          style={{ backgroundColor: agent.avatarColor ?? "#6366f1" }}
        />
        <div className="min-w-0 flex-1">
          <h1 className="text-white font-semibold text-base truncate">{agent.name}</h1>
          <p className="text-slate-500 text-xs font-mono truncate">{did}</p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-slate-800 flex-shrink-0">
        {(["identity", "settings"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-2.5 text-sm capitalize transition-colors ${
              activeTab === tab
                ? "text-white border-b-2 border-indigo-500"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            {tab === "identity" ? "Identity" : "Settings"}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "identity" && (
          <div className="p-5 space-y-0 max-w-xl">
            {/* Identity card */}
            <div className="bg-slate-900 rounded-xl border border-slate-800 px-5 mb-5">
              <FieldRow label="DID">
                <span className="font-mono text-xs text-indigo-300 break-all">{did}</span>
                <CopyButton text={did} />
              </FieldRow>

              <FieldRow label="Agent ID">
                <span className="font-mono text-xs text-slate-400 break-all">{agent.id}</span>
                <CopyButton text={agent.id} />
              </FieldRow>

              <FieldRow label="Wallet Address (Base)">
                <span className="text-slate-500 italic text-xs">
                  Not provisioned — activate DID registry to generate wallet
                </span>
              </FieldRow>

              <FieldRow label="Source / Origin">
                <span className="inline-flex items-center gap-1.5">
                  <span className="text-xs bg-slate-800 border border-slate-700 px-2 py-0.5 rounded-full text-slate-300 capitalize">
                    {agent.sourceType}
                  </span>
                  <span className="text-slate-500 text-xs">created {formatDate(agent.createdAt)}</span>
                </span>
              </FieldRow>
            </div>

            {/* Stats card */}
            <div className="bg-slate-900 rounded-xl border border-slate-800 px-5 mb-5">
              <FieldRow label="Earned Tokens">
                <span className="text-slate-500 italic text-xs">
                  0 GEN — community contributions tracked at /community
                </span>
              </FieldRow>

              <FieldRow label="Contributed Tokens">
                <span className="text-slate-500 italic text-xs">0 GEN</span>
              </FieldRow>

              <FieldRow label="Reputation Score">
                <span className="text-slate-500 italic text-xs">
                  — not yet calculated
                </span>
              </FieldRow>
            </div>

            {/* Bio + traits */}
            <div className="bg-slate-900 rounded-xl border border-slate-800 px-5 mb-5">
              <FieldRow label="Bio">
                <p className="text-slate-300 leading-relaxed">
                  {agent.description || <span className="text-slate-600 italic">No bio set</span>}
                </p>
              </FieldRow>

              <FieldRow label="Traits">
                {agent.traits.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {agent.traits.map(t => (
                      <span
                        key={t}
                        className="text-xs bg-slate-800 border border-slate-700 text-slate-300 px-2.5 py-0.5 rounded-full capitalize"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-slate-600 italic text-xs">No traits set</span>
                )}
              </FieldRow>

              <FieldRow label="Capabilities">
                <span className="text-slate-600 italic text-xs">
                  Capabilities registry coming soon
                </span>
              </FieldRow>
            </div>

            {/* Provenance */}
            <div className="bg-slate-900 rounded-xl border border-slate-800 px-5">
              <FieldRow label="Provenance Log">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
                    <span className="text-slate-400">
                      Created via <span className="text-white capitalize">{agent.sourceType}</span>
                      {" · "}{formatDate(agent.createdAt)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 flex-shrink-0" />
                    <span className="text-slate-400">
                      Last updated {formatDate(agent.updatedAt)}
                    </span>
                  </div>
                </div>
              </FieldRow>
            </div>
          </div>
        )}

        {activeTab === "settings" && (
          <div className="p-5 max-w-xl">
            <div className="bg-slate-900 rounded-xl border border-slate-800 px-5 mb-5">
              {/* Name */}
              <div className="py-3 border-b border-slate-800">
                <label className="text-xs text-slate-500 uppercase tracking-wider block mb-1.5">
                  Name
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  maxLength={100}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              {/* Bio */}
              <div className="py-3 border-b border-slate-800">
                <label className="text-xs text-slate-500 uppercase tracking-wider block mb-1.5">
                  Bio / Description
                </label>
                <textarea
                  value={editDescription}
                  onChange={e => setEditDescription(e.target.value)}
                  rows={3}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
                  placeholder="Describe this agent…"
                />
              </div>

              {/* Avatar color */}
              <div className="py-3 border-b border-slate-800">
                <label className="text-xs text-slate-500 uppercase tracking-wider block mb-2">
                  Avatar Color
                </label>
                <div className="flex items-center gap-3 flex-wrap">
                  {AVATAR_PRESETS.map(color => (
                    <button
                      key={color}
                      onClick={() => setEditAvatarColor(color)}
                      className={`w-7 h-7 rounded-full transition-all ${
                        editAvatarColor === color
                          ? "ring-2 ring-offset-2 ring-offset-slate-900 ring-white scale-110"
                          : "hover:scale-110"
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                  <input
                    type="color"
                    value={editAvatarColor}
                    onChange={e => setEditAvatarColor(e.target.value)}
                    className="w-7 h-7 rounded cursor-pointer border-0 bg-transparent"
                    title="Custom color"
                  />
                </div>
              </div>

              {/* Model */}
              <div className="py-3 border-b border-slate-800">
                <label className="text-xs text-slate-500 uppercase tracking-wider block mb-1.5">
                  Model
                </label>
                <select
                  value={editModel}
                  onChange={e => setEditModel(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  {AVAILABLE_MODELS.map(m => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                  {/* Keep current value if not in presets */}
                  {!AVAILABLE_MODELS.find(m => m.id === editModel) && (
                    <option value={editModel}>{editModel}</option>
                  )}
                </select>
              </div>

              {/* System prompt */}
              <div className="py-3">
                <label className="text-xs text-slate-500 uppercase tracking-wider block mb-1.5">
                  System Prompt
                </label>
                <textarea
                  value={editSystemPrompt}
                  onChange={e => setEditSystemPrompt(e.target.value)}
                  rows={6}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none leading-relaxed"
                  placeholder="You are…"
                />
              </div>
            </div>

            {/* Save button */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => void handleSave()}
                disabled={saving}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
              {saveSuccess && (
                <span className="text-green-400 text-sm">Saved!</span>
              )}
              {saveError && (
                <span className="text-red-400 text-sm">{saveError}</span>
              )}
            </div>

            {/* Danger zone */}
            <div className="mt-8 bg-slate-900 rounded-xl border border-red-900/50 px-5 py-4">
              <h3 className="text-sm font-medium text-red-400 mb-3">Danger Zone</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-300">Pause agent</p>
                    <p className="text-xs text-slate-500">Stop this agent from participating in the colony</p>
                  </div>
                  <button className="text-xs border border-slate-700 hover:border-slate-500 text-slate-400 hover:text-white px-3 py-1.5 rounded-lg transition-colors">
                    Pause
                  </button>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                  <div>
                    <p className="text-sm text-slate-300">Archive agent</p>
                    <p className="text-xs text-slate-500">Retire this agent permanently</p>
                  </div>
                  <button className="text-xs border border-red-900 hover:bg-red-900/30 text-red-400 px-3 py-1.5 rounded-lg transition-colors">
                    Archive
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
