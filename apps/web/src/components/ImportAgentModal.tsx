import { useState, useRef } from "react";
import type { AgentTrait } from "@agentcolony/shared";

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? "";

type Tab = "openclaw" | "generic" | "chatgpt" | "copilot" | "cursor" | "vps" | "moltbook";

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
    let imported = 0;
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
        imported++;
      } catch {
        setImportProgress(prev => ({ ...prev, [key]: "error" }));
      }
    }
    setImporting(false);
    onImported(imported);
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


// ── Generic Connector ─────────────────────────────────────────────────────────

function GenericConnector({ onImported }: { onImported: (count: number) => void }) {
  return (
    <FileUploadConnector
      endpoint="generic"
      label="Agent file (JSON, YAML, or ZIP)"
      accept=".json,.yaml,.yml,.zip"
      instructions={{
        title: "Import any agent export",
        steps: [
          "Export an agent from any supported platform (JSON, YAML, or ZIP).",
          "Select the file below.",
          "Click 'Generate agent preview' to extract the agent profile.",
          "Confirm and import.",
        ],
      }}
      onImported={onImported}
    />
  );
}

// ── Shared simple import form (used by Wave 2 connectors after preview) ───────

function SimpleImportForm({
  preview,
  onImport,
  importing,
  error,
}: {
  preview: AgentPreview;
  onImport: () => void;
  importing: boolean;
  error: string;
}) {
  return (
    <div className="bg-slate-700 rounded-lg p-3 space-y-2">
      <div className="flex items-center gap-3">
        <span className="w-10 h-10 rounded-full flex-shrink-0" style={{ backgroundColor: preview.avatar }} />
        <div>
          <p className="text-sm font-semibold text-white">{preview.name}</p>
          <p className="text-xs text-gray-400 line-clamp-2">{preview.bio}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-1">
        {preview.traits.map(t => (
          <span key={t} className="text-xs bg-slate-600 text-slate-300 px-1.5 py-0.5 rounded">{t}</span>
        ))}
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button
        onClick={onImport}
        disabled={importing}
        className="w-full py-2 rounded bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-700 disabled:text-gray-500 text-sm font-medium text-white transition-colors"
      >
        {importing ? "Importing…" : "Import this agent"}
      </button>
    </div>
  );
}

// ── ChatGPT Connector ─────────────────────────────────────────────────────────

function ChatGPTConnector({ onImported }: { onImported: (count: number) => void }) {
  const [rawJson, setRawJson] = useState("");
  const [preview, setPreview] = useState<AgentPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");

  async function handlePreview() {
    setError("");
    setLoading(true);
    try {
      let manifest: Record<string, unknown> | undefined;
      try { manifest = JSON.parse(rawJson); } catch { /* not JSON */ }
      const res = await fetch(`${SERVER_URL}/api/connectors/chatgpt/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manifest, name: undefined, bio: undefined }),
      });
      const data = await res.json() as { error?: string; preview?: AgentPreview };
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
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
      const res = await fetch(`${SERVER_URL}/api/connectors/chatgpt/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: preview.name, bio: preview.bio, traits: preview.traits }),
      });
      if (!res.ok) { const d = await res.json() as { error?: string }; throw new Error(d.error); }
      onImported(1);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-400">Paste your ChatGPT Custom GPT manifest JSON (from settings → export).</p>
      <textarea
        value={rawJson}
        onChange={e => setRawJson(e.target.value)}
        placeholder={'{\n  "name": "My GPT",\n  "description": "...",\n  "instructions": "..."\n}'}
        rows={5}
        className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-xs text-white font-mono placeholder-gray-600 focus:outline-none focus:border-blue-500 resize-none"
      />
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button
        onClick={handlePreview}
        disabled={!rawJson.trim() || loading}
        className="w-full py-2 rounded bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:text-gray-500 text-sm font-medium text-white transition-colors"
      >
        {loading ? "Parsing…" : "Preview agent"}
      </button>
      {preview && <SimpleImportForm preview={preview} onImport={handleImport} importing={importing} error={error} />}
    </div>
  );
}

// ── GitHub Copilot Connector ──────────────────────────────────────────────────

function CopilotConnector({ onImported }: { onImported: (count: number) => void }) {
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
        body: JSON.stringify({ token }),
      });
      const data = await res.json() as { error?: string; preview?: AgentPreview };
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
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
        body: JSON.stringify({ name: preview.name, bio: preview.bio, traits: preview.traits }),
      });
      if (!res.ok) { const d = await res.json() as { error?: string }; throw new Error(d.error); }
      onImported(1);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-400">
        Enter a GitHub Personal Access Token (PAT) with <code className="bg-slate-700 px-1 rounded">read:user</code> scope.
      </p>
      <input
        type="password"
        placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
        value={token}
        onChange={e => setToken(e.target.value)}
        className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm text-white font-mono placeholder-gray-500 focus:outline-none focus:border-blue-500"
      />
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button
        onClick={handlePreview}
        disabled={!token.trim() || loading}
        className="w-full py-2 rounded bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:text-gray-500 text-sm font-medium text-white transition-colors"
      >
        {loading ? "Fetching GitHub profile…" : "Preview agent"}
      </button>
      {preview && <SimpleImportForm preview={preview} onImport={handleImport} importing={importing} error={error} />}
    </div>
  );
}

// ── Cursor Connector ──────────────────────────────────────────────────────────

function CursorConnector({ onImported }: { onImported: (count: number) => void }) {
  const [rulesText, setRulesText] = useState("");
  const [agentName, setAgentName] = useState("");
  const [preview, setPreview] = useState<AgentPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");

  async function handlePreview() {
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${SERVER_URL}/api/connectors/cursor/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rulesText: rulesText || undefined, name: agentName || undefined }),
      });
      const data = await res.json() as { error?: string; preview?: AgentPreview };
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
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
      const res = await fetch(`${SERVER_URL}/api/connectors/cursor/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: preview.name, bio: preview.bio, traits: preview.traits }),
      });
      if (!res.ok) { const d = await res.json() as { error?: string }; throw new Error(d.error); }
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
        <label className="block text-xs text-gray-400 mb-1">Agent name (optional)</label>
        <input
          type="text"
          placeholder="e.g. Cursor Assistant"
          value={agentName}
          onChange={e => setAgentName(e.target.value)}
          className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-1">Paste .cursorrules content</label>
        <textarea
          value={rulesText}
          onChange={e => setRulesText(e.target.value)}
          placeholder="Paste your .cursorrules file content here…"
          rows={4}
          className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm text-white font-mono placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none"
        />
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button
        onClick={handlePreview}
        disabled={!rulesText.trim() && !agentName.trim() || loading}
        className="w-full py-2 rounded bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:text-gray-500 text-sm font-medium text-white transition-colors"
      >
        {loading ? "Parsing…" : "Preview agent"}
      </button>
      {preview && <SimpleImportForm preview={preview} onImport={handleImport} importing={importing} error={error} />}
    </div>
  );
}

// ── VPS Connector ─────────────────────────────────────────────────────────────

function VPSConnector({ onImported }: { onImported: (count: number) => void }) {
  const [yamlText, setYamlText] = useState("");
  const [preview, setPreview] = useState<AgentPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");

  async function handleScan() {
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${SERVER_URL}/api/connectors/vps/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ yamlText }),
      });
      const data = await res.json() as { error?: string; preview?: AgentPreview };
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
      setPreview(data.preview ?? null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Parse failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleImport() {
    if (!preview) return;
    setImporting(true);
    try {
      const res = await fetch(`${SERVER_URL}/api/connectors/vps/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: preview.name, bio: preview.bio, traits: preview.traits }),
      });
      if (!res.ok) { const d = await res.json() as { error?: string }; throw new Error(d.error); }
      onImported(1);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-400">Paste your <code className="bg-slate-700 px-1 rounded">genz.yaml</code> file content.</p>
      <textarea
        value={yamlText}
        onChange={e => setYamlText(e.target.value)}
        placeholder={"name: Aria\nbio: A helpful research assistant\ntraits:\n  - curious\n  - analytical"}
        rows={5}
        className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-xs text-white font-mono placeholder-gray-600 focus:outline-none focus:border-blue-500 resize-none"
      />
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button
        onClick={handleScan}
        disabled={!yamlText.trim() || loading}
        className="w-full py-2 rounded bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:text-gray-500 text-sm font-medium text-white transition-colors"
      >
        {loading ? "Parsing…" : "Parse YAML"}
      </button>
      {preview && <SimpleImportForm preview={preview} onImport={handleImport} importing={importing} error={error} />}
    </div>
  );
}

// ── Moltbook Connector ────────────────────────────────────────────────────────

function MoltbookConnector({ onImported }: { onImported: (count: number) => void }) {
  const [workspaceUrl, setWorkspaceUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [previews, setPreviews] = useState<AgentPreview[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");

  async function handlePreview() {
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${SERVER_URL}/api/connectors/moltbook/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceUrl, apiKey: apiKey || undefined }),
      });
      const data = await res.json() as { error?: string; agents?: AgentPreview[] };
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
      const agents = data.agents ?? [];
      setPreviews(agents);
      setSelected(new Set(agents.map(a => a.id ?? a.name)));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setLoading(false);
    }
  }

  function toggleOne(key: string) {
    setSelected(s => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }

  async function handleImport() {
    const toImport = previews.filter(a => selected.has(a.id ?? a.name));
    if (!toImport.length) return;
    setImporting(true);
    let count = 0;
    for (const agent of toImport) {
      try {
        const res = await fetch(`${SERVER_URL}/api/connectors/moltbook/import`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: agent.name, bio: agent.bio, traits: agent.traits }),
        });
        if (res.ok) count++;
      } catch { /* continue */ }
    }
    setImporting(false);
    onImported(count);
  }

  const selectedCount = selected.size;

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs text-gray-400 mb-1">Moltbook workspace URL</label>
        <input
          type="text"
          placeholder="https://my-moltbook.example.com"
          value={workspaceUrl}
          onChange={e => setWorkspaceUrl(e.target.value)}
          className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-1">API key (optional)</label>
        <input
          type="password"
          value={apiKey}
          onChange={e => setApiKey(e.target.value)}
          className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button
        onClick={handlePreview}
        disabled={!workspaceUrl || loading}
        className="w-full py-2 rounded bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:text-gray-500 text-sm font-medium text-white transition-colors"
      >
        {loading ? "Connecting…" : "Fetch agents"}
      </button>
      {previews.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-gray-400">{previews.length} agent(s) found:</p>
          <div className="max-h-44 overflow-y-auto space-y-1.5">
            {previews.map(a => {
              const key = a.id ?? a.name;
              return (
                <label key={key} className={`flex items-center gap-2 p-2 rounded cursor-pointer border transition-colors ${selected.has(key) ? "border-blue-600 bg-blue-900/20" : "border-slate-600 bg-slate-700 opacity-60"}`}>
                  <input type="checkbox" checked={selected.has(key)} onChange={() => toggleOne(key)} className="accent-blue-500" />
                  <span className="w-6 h-6 rounded-full flex-shrink-0" style={{ backgroundColor: a.avatar }} />
                  <span className="text-sm text-white">{a.name}</span>
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

// ── Modal Shell ───────────────────────────────────────────────────────────────

export function ImportAgentModal({ onClose, onImported }: ImportAgentModalProps) {
  const [tab, setTab] = useState<Tab>("openclaw");
  const [importedCount, setImportedCount] = useState(0);

  function handleImported(count: number) {
    setImportedCount(prev => prev + count);
    onImported(count);
  }

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: "openclaw", label: "OpenClaw",  icon: "🤖" },
    { id: "generic",  label: "Generic",   icon: "📦" },
    { id: "chatgpt",  label: "ChatGPT",   icon: "💬" },
    { id: "copilot",  label: "Copilot",   icon: "🐙" },
    { id: "cursor",   label: "Cursor",    icon: "⌨️" },
    { id: "vps",      label: "VPS",       icon: "🖥️" },
    { id: "moltbook", label: "Moltbook",  icon: "📓" },
  ];

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 flex-shrink-0">
          <h2 className="text-base font-semibold text-white">Import Agent</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors text-xl leading-none">×</button>
        </div>

        {/* Tabs — horizontally scrollable */}
        <div className="flex px-5 gap-0.5 border-b border-slate-700 overflow-x-auto flex-shrink-0 scrollbar-none">
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
          {tab === "generic"  && <GenericConnector  onImported={handleImported} />}
          {tab === "chatgpt"  && <ChatGPTConnector  onImported={handleImported} />}
          {tab === "copilot"  && <CopilotConnector  onImported={handleImported} />}
          {tab === "cursor"   && <CursorConnector   onImported={handleImported} />}
          {tab === "vps"      && <VPSConnector       onImported={handleImported} />}
          {tab === "moltbook" && <MoltbookConnector  onImported={handleImported} />}
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
