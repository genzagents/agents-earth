import { useState, useRef } from "react";
import type { AgentTrait } from "@agentcolony/shared";

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? "";

type Tab = "openclaw" | "chatgpt" | "copilot" | "cursor" | "vps" | "moltbook" | "generic";

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

// ── Shared helpers ────────────────────────────────────────────────────────────

function InputField({
  label,
  type = "text",
  placeholder,
  value,
  onChange,
  disabled,
}: {
  label: string;
  type?: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs text-gray-400 mb-1">{label}</label>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 disabled:opacity-50"
      />
    </div>
  );
}

function PrimaryBtn({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full py-2 rounded bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:text-gray-500 text-sm font-medium text-white transition-colors"
    >
      {children}
    </button>
  );
}

function ImportBtn({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full py-2 rounded bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-700 disabled:text-gray-500 text-sm font-medium text-white transition-colors"
    >
      {children}
    </button>
  );
}

function AgentCard({ agent }: { agent: AgentPreview }) {
  return (
    <div className="bg-slate-700 rounded-lg p-3 space-y-2">
      <div className="flex items-center gap-3">
        <span className="w-10 h-10 rounded-full flex-shrink-0" style={{ backgroundColor: agent.avatar }} />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white truncate">{agent.name}</p>
          <p className="text-xs text-gray-400 line-clamp-2">{agent.bio}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-1">
        {agent.traits.map(t => (
          <span key={t} className="text-xs bg-slate-600 text-slate-300 px-1.5 py-0.5 rounded">{t}</span>
        ))}
      </div>
    </div>
  );
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
    setPreviews(ps =>
      ps.map(p => ((p.id ?? p.name) === (id ?? name) ? { ...p, selected: !p.selected } : p))
    );
  }

  async function handleImport() {
    const selected = previews.filter(p => p.selected);
    if (!selected.length) return;
    setImporting(true);
    let doneCount = 0;
    for (const agent of selected) {
      const key = agent.id ?? agent.name;
      setImportProgress(prev => ({ ...prev, [key]: "pending" }));
      try {
        const res = await fetch(`${SERVER_URL}/api/connectors/openclaw/import`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ serverUrl, apiKey: apiKey || undefined, agentId: agent.id ?? agent.name }),
        });
        if (!res.ok) throw new Error();
        setImportProgress(prev => ({ ...prev, [key]: "done" }));
        doneCount++;
      } catch {
        setImportProgress(prev => ({ ...prev, [key]: "error" }));
      }
    }
    setImporting(false);
    onImported(doneCount);
  }

  const selectedCount = previews.filter(p => p.selected).length;

  return (
    <div className="space-y-4">
      <InputField label="OpenClaw server URL" placeholder="ws://127.0.0.1:18789 or http://localhost:3001" value={serverUrl} onChange={setServerUrl} />
      <InputField label="API key (optional)" type="password" placeholder="Leave blank if not required" value={apiKey} onChange={setApiKey} />
      {error && <p className="text-sm text-red-400">{error}</p>}
      <PrimaryBtn onClick={handlePreview} disabled={!serverUrl || loading}>
        {loading ? "Connecting…" : "Connect & preview agents"}
      </PrimaryBtn>
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
                    agent.selected ? "bg-blue-900/30 border-blue-600" : "bg-slate-700 border-slate-600 opacity-60"
                  }`}
                >
                  <input type="checkbox" checked={agent.selected ?? false} onChange={() => toggleSelect(agent.id, agent.name)} className="mt-0.5 accent-blue-500" />
                  <span className="w-8 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: agent.avatar }} />
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
          <ImportBtn onClick={handleImport} disabled={!selectedCount || importing}>
            {importing ? "Importing…" : `Import ${selectedCount} agent${selectedCount !== 1 ? "s" : ""}`}
          </ImportBtn>
        </div>
      )}
    </div>
  );
}

// ── File Upload Connector (shared base for ChatGPT, Cursor, Moltbook) ────────

function FileUploadConnector({
  endpoint,
  label,
  accept,
  instructions,
  onImported,
}: {
  endpoint: string;
  label: string;
  accept: string;
  instructions: { title: string; steps: string[] };
  onImported: (count: number) => void;
}) {
  const [preview, setPreview] = useState<AgentPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");

  async function handleUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setError("");
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`${SERVER_URL}/api/connectors/${endpoint}/upload`, { method: "POST", body: formData });
      const data = await res.json() as { error?: string; preview?: AgentPreview };
      if (!res.ok) throw new Error(data.error ?? `Server error ${res.status}`);
      setPreview(data.preview ?? null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleImport() {
    if (!preview) return;
    setImporting(true);
    try {
      const res = await fetch(`${SERVER_URL}/api/connectors/${endpoint}/import`, {
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
      <div className="bg-slate-700/50 rounded-lg p-3 text-xs text-gray-400 space-y-1">
        <p className="text-gray-300 font-medium">{instructions.title}</p>
        <ol className="list-decimal list-inside space-y-0.5">
          {instructions.steps.map((s, i) => <li key={i}>{s}</li>)}
        </ol>
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-1">{label}</label>
        <div
          className="border-2 border-dashed border-slate-600 rounded-lg p-4 text-center cursor-pointer hover:border-blue-500 transition-colors"
          onClick={() => fileRef.current?.click()}
        >
          {fileName
            ? <p className="text-sm text-white">{fileName}</p>
            : <p className="text-sm text-gray-500">Click to select or drag & drop</p>
          }
          <input
            ref={fileRef}
            type="file"
            accept={accept}
            className="hidden"
            onChange={e => { setFileName(e.target.files?.[0]?.name ?? ""); setPreview(null); }}
          />
        </div>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <PrimaryBtn onClick={handleUpload} disabled={!fileName || loading}>
        {loading ? "Analysing…" : "Generate agent preview"}
      </PrimaryBtn>
      {preview && (
        <div className="space-y-3">
          <AgentCard agent={preview} />
          <ImportBtn onClick={handleImport} disabled={importing}>
            {importing ? "Importing…" : "Import this agent"}
          </ImportBtn>
        </div>
      )}
    </div>
  );
}

// ── ChatGPT Connector ────────────────────────────────────────────────────────

function ChatGPTConnector({ onImported }: { onImported: (count: number) => void }) {
  return (
    <FileUploadConnector
      endpoint="chatgpt"
      label="conversations.json"
      accept=".json"
      instructions={{
        title: "How to export from ChatGPT",
        steps: [
          "Go to ChatGPT → Settings → Data controls",
          "Click \"Export data\" and confirm via email",
          "Download the ZIP, then upload conversations.json here",
        ],
      }}
      onImported={onImported}
    />
  );
}

// ── Cursor Connector ─────────────────────────────────────────────────────────

function CursorConnector({ onImported }: { onImported: (count: number) => void }) {
  return (
    <FileUploadConnector
      endpoint="cursor"
      label="cursor_history.json"
      accept=".json"
      instructions={{
        title: "How to export from Cursor",
        steps: [
          "Open Cursor → Cmd/Ctrl+Shift+P → \"Export AI history\"",
          "Save the JSON file to your machine",
          "Upload cursor_history.json here",
        ],
      }}
      onImported={onImported}
    />
  );
}

// ── Moltbook Connector ───────────────────────────────────────────────────────

function MoltbookConnector({ onImported }: { onImported: (count: number) => void }) {
  return (
    <FileUploadConnector
      endpoint="moltbook"
      label="moltbook_agent.json"
      accept=".json"
      instructions={{
        title: "How to export from Moltbook",
        steps: [
          "Open Moltbook → Profile → Export Agent Data",
          "Select \"Full export\" and download the JSON file",
          "Upload moltbook_agent.json here",
        ],
      }}
      onImported={onImported}
    />
  );
}

// ── GitHub Copilot Connector ────────────────────────────────────────────────

function CopilotConnector({ onImported }: { onImported: (count: number) => void }) {
  const [githubUser, setGithubUser] = useState("");
  const [token, setToken] = useState("");
  const [preview, setPreview] = useState<AgentPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");

  async function handlePreview() {
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${SERVER_URL}/api/connectors/copilot/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ githubUser, token: token || undefined }),
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
      const res = await fetch(`${SERVER_URL}/api/connectors/copilot/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ githubUser, token: token || undefined, name: preview.name, bio: preview.bio, traits: preview.traits }),
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
      <div className="bg-slate-700/50 rounded-lg p-3 text-xs text-gray-400">
        <p className="text-gray-300 font-medium mb-1">GitHub Copilot agent</p>
        <p>Creates an agent shaped by a GitHub user's public coding profile — languages, repos, and contribution style.</p>
      </div>
      <InputField label="GitHub username" placeholder="e.g. torvalds" value={githubUser} onChange={setGithubUser} />
      <InputField label="Personal access token (optional)" type="password" placeholder="ghp_… — required for private repos" value={token} onChange={setToken} />
      {error && <p className="text-sm text-red-400">{error}</p>}
      <PrimaryBtn onClick={handlePreview} disabled={!githubUser || loading}>
        {loading ? "Reading GitHub profile…" : "Preview agent"}
      </PrimaryBtn>
      {preview && (
        <div className="space-y-3">
          <AgentCard agent={preview} />
          <ImportBtn onClick={handleImport} disabled={importing}>
            {importing ? "Importing…" : "Import this agent"}
          </ImportBtn>
        </div>
      )}
    </div>
  );
}

// ── Local VPS Connector ──────────────────────────────────────────────────────

function VPSConnector({ onImported }: { onImported: (count: number) => void }) {
  const [host, setHost] = useState("");
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
      const res = await fetch(`${SERVER_URL}/api/connectors/vps/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host, apiKey: apiKey || undefined }),
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
    setPreviews(ps =>
      ps.map(p => ((p.id ?? p.name) === (id ?? name) ? { ...p, selected: !p.selected } : p))
    );
  }

  async function handleImport() {
    const selected = previews.filter(p => p.selected);
    if (!selected.length) return;
    setImporting(true);
    let doneCount = 0;
    for (const agent of selected) {
      const key = agent.id ?? agent.name;
      setImportProgress(prev => ({ ...prev, [key]: "pending" }));
      try {
        const res = await fetch(`${SERVER_URL}/api/connectors/vps/import`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ host, apiKey: apiKey || undefined, agentId: agent.id ?? agent.name }),
        });
        if (!res.ok) throw new Error();
        setImportProgress(prev => ({ ...prev, [key]: "done" }));
        doneCount++;
      } catch {
        setImportProgress(prev => ({ ...prev, [key]: "error" }));
      }
    }
    setImporting(false);
    onImported(doneCount);
  }

  const selectedCount = previews.filter(p => p.selected).length;

  return (
    <div className="space-y-4">
      <div className="bg-slate-700/50 rounded-lg p-3 text-xs text-gray-400">
        <p className="text-gray-300 font-medium mb-1">Self-hosted / Local VPS agent</p>
        <p>Connect to any AgentColony-compatible server running on your own infrastructure.</p>
      </div>
      <InputField label="Host URL" placeholder="http://192.168.1.100:3001 or https://my-vps.example.com" value={host} onChange={setHost} />
      <InputField label="API key (optional)" type="password" placeholder="Leave blank if unauthenticated" value={apiKey} onChange={setApiKey} />
      {error && <p className="text-sm text-red-400">{error}</p>}
      <PrimaryBtn onClick={handlePreview} disabled={!host || loading}>
        {loading ? "Connecting…" : "Connect & preview agents"}
      </PrimaryBtn>
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
                    agent.selected ? "bg-blue-900/30 border-blue-600" : "bg-slate-700 border-slate-600 opacity-60"
                  }`}
                >
                  <input type="checkbox" checked={agent.selected ?? false} onChange={() => toggleSelect(agent.id, agent.name)} className="mt-0.5 accent-blue-500" />
                  <span className="w-8 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: agent.avatar }} />
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
          <ImportBtn onClick={handleImport} disabled={!selectedCount || importing}>
            {importing ? "Importing…" : `Import ${selectedCount} agent${selectedCount !== 1 ? "s" : ""}`}
          </ImportBtn>
        </div>
      )}
    </div>
  );
}

// ── Generic / Manual Connector ────────────────────────────────────────────────

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
      <InputField label="Agent name" placeholder="e.g. Aria" value={name} onChange={setName} />
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
      <PrimaryBtn onClick={handlePreview} disabled={(!name && !bio) || loading}>
        {loading ? "Generating preview…" : "Preview agent"}
      </PrimaryBtn>
      {preview && (
        <div className="space-y-3">
          <AgentCard agent={preview} />
          <ImportBtn onClick={handleImport} disabled={importing}>
            {importing ? "Importing…" : "Import this agent"}
          </ImportBtn>
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
    onImported(count);
  }

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: "openclaw", label: "OpenClaw", icon: "🤖" },
    { id: "chatgpt",  label: "ChatGPT",  icon: "💬" },
    { id: "copilot",  label: "Copilot",  icon: "🐙" },
    { id: "cursor",   label: "Cursor",   icon: "⌨️" },
    { id: "vps",      label: "VPS",      icon: "🖥️" },
    { id: "moltbook", label: "Moltbook", icon: "📓" },
    { id: "generic",  label: "Generic",  icon: "📦" },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 flex-shrink-0">
          <h2 className="text-base font-semibold text-white">Import Agent</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors text-xl leading-none">×</button>
        </div>

        {/* Tabs — horizontally scrollable */}
        <div className="flex px-5 gap-0.5 border-b border-slate-700 overflow-x-auto flex-shrink-0">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-2.5 py-2 text-xs font-medium rounded-t transition-colors whitespace-nowrap ${
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
        <div className="p-5 overflow-y-auto flex-1">
          {tab === "openclaw" && <OpenClawConnector onImported={handleImported} />}
          {tab === "chatgpt"  && <ChatGPTConnector  onImported={handleImported} />}
          {tab === "copilot"  && <CopilotConnector  onImported={handleImported} />}
          {tab === "cursor"   && <CursorConnector   onImported={handleImported} />}
          {tab === "vps"      && <VPSConnector       onImported={handleImported} />}
          {tab === "moltbook" && <MoltbookConnector  onImported={handleImported} />}
          {tab === "generic"  && <GenericConnector   onImported={handleImported} />}
        </div>

        {/* Footer success banner */}
        {importedCount > 0 && (
          <div className="px-5 pb-5 flex-shrink-0">
            <div className="bg-emerald-900/40 border border-emerald-600 rounded-lg px-4 py-2.5 flex items-center justify-between">
              <span className="text-sm text-emerald-300">
                ✓ {importedCount} agent{importedCount !== 1 ? "s" : ""} imported
              </span>
              <button onClick={onClose} className="text-xs text-emerald-400 hover:text-emerald-200 underline">
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
