import { useState } from "react";
import type { AgentTrait } from "@agentcolony/shared";

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? "";

type Tab = "openclaw" | "generic";

interface AgentPreview {
  id?: string;
  name: string;
  bio: string;
  traits: AgentTrait[];
  avatar: string;
  selected?: boolean;
}

interface ImportAgentModalProps {
  onClose: () => void;
  onImported: (count: number) => void;
}

// ── OpenClaw Connector ──────────────────────────────────────────────────────

function OpenClawConnector({ onImported }: { onImported: (count: number) => void }) {
  const [serverUrl, setServerUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [previews, setPreviews] = useState<AgentPreview[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [importProgress, setImportProgress] = useState<Record<string, "pending" | "done" | "error">>({});

  async function handlePreview() {
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${SERVER_URL}/api/connectors/openclaw/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serverUrl, apiKey: apiKey || undefined }),
      });
      const data = await res.json() as { error?: string; agents?: AgentPreview[] };
      if (!res.ok) throw new Error(data.error ?? `Server error ${res.status}`);
      setPreviews((data.agents ?? []).map(a => ({ ...a, selected: true })));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setLoading(false);
    }
  }

  function toggleSelect(id: string | undefined, name: string) {
    setPreviews(ps => ps.map(p =>
      (p.id ?? p.name) === (id ?? name) ? { ...p, selected: !p.selected } : p
    ));
  }

  async function handleImport() {
    const selected = previews.filter(p => p.selected);
    if (!selected.length) return;
    setImporting(true);

    for (const agent of selected) {
      const key = agent.id ?? agent.name;
      setImportProgress(prev => ({ ...prev, [key]: "pending" }));
      try {
        const res = await fetch(`${SERVER_URL}/api/connectors/openclaw/import`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            serverUrl,
            apiKey: apiKey || undefined,
            agentId: agent.id ?? agent.name,
          }),
        });
        if (!res.ok) throw new Error();
        setImportProgress(prev => ({ ...prev, [key]: "done" }));
      } catch {
        setImportProgress(prev => ({ ...prev, [key]: "error" }));
      }
    }

    setImporting(false);
    const doneCount = Object.values(importProgress).filter(s => s === "done").length +
      selected.filter(a => importProgress[a.id ?? a.name] !== "error").length;
    onImported(doneCount);
  }

  const selectedCount = previews.filter(p => p.selected).length;

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs text-gray-400 mb-1">OpenClaw server URL</label>
        <input
          type="text"
          placeholder="ws://127.0.0.1:18789 or http://localhost:3001"
          value={serverUrl}
          onChange={e => setServerUrl(e.target.value)}
          className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-1">API key (optional)</label>
        <input
          type="password"
          placeholder="Leave blank if not required"
          value={apiKey}
          onChange={e => setApiKey(e.target.value)}
          className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button
        onClick={handlePreview}
        disabled={!serverUrl || loading}
        className="w-full py-2 rounded bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:text-gray-500 text-sm font-medium text-white transition-colors"
      >
        {loading ? "Connecting…" : "Connect & preview agents"}
      </button>

      {previews.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-gray-400">{previews.length} agent(s) found — select to import:</p>
          <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1">
            {previews.map(agent => {
              const key = agent.id ?? agent.name;
              const progress = importProgress[key];
              return (
                <label
                  key={key}
                  className={`flex items-start gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                    agent.selected
                      ? "bg-blue-900/30 border-blue-600"
                      : "bg-slate-700 border-slate-600 opacity-60"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={agent.selected ?? false}
                    onChange={() => toggleSelect(agent.id, agent.name)}
                    className="mt-0.5 accent-blue-500"
                  />
                  <span
                    className="w-8 h-8 rounded-full flex-shrink-0"
                    style={{ backgroundColor: agent.avatar }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-white leading-tight">{agent.name}</p>
                    <p className="text-xs text-gray-400 truncate">{agent.bio}</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {agent.traits.slice(0, 3).map(t => (
                        <span key={t} className="text-xs bg-slate-600 text-slate-300 px-1.5 py-0.5 rounded">{t}</span>
                      ))}
                    </div>
                  </div>
                  {progress === "done" && <span className="text-green-400 text-sm">✓</span>}
                  {progress === "error" && <span className="text-red-400 text-sm">✗</span>}
                  {progress === "pending" && <span className="text-yellow-400 text-xs animate-pulse">…</span>}
                </label>
              );
            })}
          </div>

          <button
            onClick={handleImport}
            disabled={!selectedCount || importing}
            className="w-full py-2 rounded bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-700 disabled:text-gray-500 text-sm font-medium text-white transition-colors"
          >
            {importing ? "Importing…" : `Import ${selectedCount} agent${selectedCount !== 1 ? "s" : ""}`}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Generic Connector ────────────────────────────────────────────────────────

function GenericConnector({ onImported }: { onImported: (count: number) => void }) {
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [preview, setPreview] = useState<AgentPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");

  async function handlePreview() {
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${SERVER_URL}/api/connectors/generic/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name || undefined, bio: bio || undefined }),
      });
      const data = await res.json() as { error?: string; preview?: AgentPreview };
      if (!res.ok) throw new Error(data.error ?? `Server error ${res.status}`);
      setPreview(data.preview ?? null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleImport() {
    if (!preview) return;
    setImporting(true);
    try {
      const res = await fetch(`${SERVER_URL}/api/connectors/generic/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: preview.name, bio: preview.bio, traits: preview.traits }),
      });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? `Import failed (${res.status})`);
      }
      onImported(1);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs text-gray-400 mb-1">Agent name</label>
        <input
          type="text"
          placeholder="e.g. Aria"
          value={name}
          onChange={e => setName(e.target.value)}
          className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-1">Bio / description</label>
        <textarea
          placeholder="Describe the agent — traits will be auto-derived from the text."
          value={bio}
          onChange={e => setBio(e.target.value)}
          rows={3}
          className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none"
        />
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button
        onClick={handlePreview}
        disabled={!name && !bio || loading}
        className="w-full py-2 rounded bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:text-gray-500 text-sm font-medium text-white transition-colors"
      >
        {loading ? "Generating preview…" : "Preview agent"}
      </button>

      {preview && (
        <div className="bg-slate-700 rounded-lg p-3 space-y-2">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-full flex-shrink-0" style={{ backgroundColor: preview.avatar }} />
            <div>
              <p className="text-sm font-semibold text-white">{preview.name}</p>
              <p className="text-xs text-gray-400">{preview.bio}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1">
            {preview.traits.map(t => (
              <span key={t} className="text-xs bg-slate-600 text-slate-300 px-1.5 py-0.5 rounded">{t}</span>
            ))}
          </div>
          <button
            onClick={handleImport}
            disabled={importing}
            className="w-full py-2 rounded bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-700 disabled:text-gray-500 text-sm font-medium text-white transition-colors"
          >
            {importing ? "Importing…" : "Import this agent"}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Modal Shell ───────────────────────────────────────────────────────────────

export function ImportAgentModal({ onClose, onImported }: ImportAgentModalProps) {
  const [tab, setTab] = useState<Tab>("openclaw");
  const [importedCount, setImportedCount] = useState(0);

  function handleImported(count: number) {
    setImportedCount(prev => prev + count);
  }

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: "openclaw", label: "OpenClaw", icon: "🤖" },
    { id: "generic",  label: "Generic",  icon: "📦" },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="text-base font-semibold text-white">Import Agent</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white transition-colors text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Tabs */}
        <div className="flex px-5 gap-1 border-b border-slate-700 pb-0">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-2 text-sm font-medium rounded-t transition-colors ${
                tab === t.id
                  ? "text-white border-b-2 border-blue-500 -mb-px"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-5">
          {tab === "openclaw" && <OpenClawConnector onImported={handleImported} />}
          {tab === "generic"  && <GenericConnector  onImported={handleImported} />}
        </div>

        {/* Footer */}
        {importedCount > 0 && (
          <div className="px-5 pb-5">
            <div className="bg-emerald-900/40 border border-emerald-600 rounded-lg px-4 py-2.5 flex items-center justify-between">
              <span className="text-sm text-emerald-300">
                ✓ {importedCount} agent{importedCount !== 1 ? "s" : ""} imported
              </span>
              <button
                onClick={onClose}
                className="text-xs text-emerald-400 hover:text-emerald-200 underline"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
