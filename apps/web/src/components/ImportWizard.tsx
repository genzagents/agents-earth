/**
 * ImportWizard — GEN-99 (Phase 3 + Phase 5)
 *
 * Multi-step onboarding flow for importing agents from external tools.
 *
 * Steps:
 *  1. ToolSelect   — multi-select grid: Claude Desktop, OpenClaw, ChatGPT, Cursor,
 *                    Local VPS, Generic Upload
 *  2. ConfigForms  — per-tool config (fields, file upload, textarea paste)
 *  3. AgentReview  — card grid of detected agents with checkboxes + rename
 *  4. Importing    — progress indicator while backend runs ingestion
 *  5. Success      — "Your X agents are now alive on GenZAgents"
 *
 * API:
 *  POST /api/pickup/detect  → { agents: ExtractedAgent[] }
 *  POST /api/pickup/import  → IngestionResult
 */

import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? "";

// ─── Types ────────────────────────────────────────────────────────────────────

type WizardStep = "tool-select" | "config" | "agent-review" | "importing" | "success";

type ToolId =
  | "claude_desktop"
  | "openclaw"
  | "gpt"
  | "cursor"
  | "local_vps"
  | "generic_file";

interface ToolOption {
  id: ToolId;
  label: string;
  icon: string;
  /** Whether this tool has a real backend connector */
  hasConnector: boolean;
  comingSoonLabel?: string;
}

const TOOLS: ToolOption[] = [
  { id: "claude_desktop", label: "Claude Desktop", icon: "🤖", hasConnector: true },
  { id: "openclaw",       label: "OpenClaw",       icon: "🦀", hasConnector: true },
  { id: "gpt",            label: "ChatGPT / GPT",  icon: "💬", hasConnector: false, comingSoonLabel: "Coming soon" },
  { id: "cursor",         label: "Cursor",         icon: "⚡", hasConnector: false, comingSoonLabel: "Coming soon" },
  { id: "local_vps",      label: "Local / VPS",    icon: "🖥️", hasConnector: false, comingSoonLabel: "Coming soon" },
  { id: "generic_file",   label: "Generic Upload", icon: "📄", hasConnector: true },
];

interface DetectedAgent {
  sourceId: string;
  name: string;
  systemPrompt: string;
  description?: string;
  model?: string;
  selected: boolean;
}

interface IngestionResult {
  imported: number;
  skipped: number;
  agents: Array<{ id: string; name: string; isNew: boolean }>;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5 mb-6">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`h-1 rounded-full flex-1 transition-colors ${
            i < current ? "bg-indigo-500" : i === current ? "bg-indigo-400" : "bg-slate-700"
          }`}
        />
      ))}
    </div>
  );
}

// ─── Step 1: Tool Select ──────────────────────────────────────────────────────

function ToolSelectStep({
  selected,
  onToggle,
  onContinue,
}: {
  selected: Set<ToolId>;
  onToggle: (t: ToolId) => void;
  onContinue: () => void;
}) {
  const hasConnectable = [...selected].some(
    t => TOOLS.find(o => o.id === t)?.hasConnector
  );

  return (
    <div>
      <h2 className="text-white text-xl font-semibold mb-1">Which tools do you use?</h2>
      <p className="text-slate-400 text-sm mb-5">
        Select all that apply. We'll import your agents and memories where possible.
      </p>

      <div className="grid grid-cols-2 gap-2 mb-6">
        {TOOLS.map(tool => {
          const isSelected = selected.has(tool.id);
          return (
            <button
              key={tool.id}
              onClick={() => onToggle(tool.id)}
              disabled={!tool.hasConnector}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg border text-left transition-all ${
                !tool.hasConnector
                  ? "border-slate-800 bg-slate-900/30 text-slate-600 cursor-not-allowed"
                  : isSelected
                  ? "border-indigo-500 bg-indigo-600/15 text-white"
                  : "border-slate-700 bg-slate-800/50 text-slate-300 hover:border-slate-500 hover:text-white"
              }`}
            >
              <span className="text-xl flex-shrink-0">{tool.icon}</span>
              <div className="min-w-0">
                <p className="text-sm font-medium">{tool.label}</p>
                {tool.comingSoonLabel && (
                  <p className="text-xs text-slate-600">{tool.comingSoonLabel}</p>
                )}
                {tool.hasConnector && !tool.comingSoonLabel && (
                  <p className="text-xs text-indigo-400">Import available</p>
                )}
              </div>
              {isSelected && (
                <span className="ml-auto text-indigo-400 flex-shrink-0">✓</span>
              )}
            </button>
          );
        })}
      </div>

      <button
        disabled={selected.size === 0 || !hasConnectable}
        onClick={onContinue}
        className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
      >
        {hasConnectable ? "Configure import →" : "Select a supported tool to continue"}
      </button>
    </div>
  );
}

// ─── Step 2: Config Forms ─────────────────────────────────────────────────────

interface ToolConfigState {
  // Claude Desktop
  claudeFile?: File;
  claudeData?: unknown;
  // OpenClaw
  openclawGatewayUrl?: string;
  openclawApiToken?: string;
  // Generic
  genericText?: string;
  genericFilename?: string;
}

function ClaudeDesktopConfigForm({
  state,
  onChange,
}: {
  state: ToolConfigState;
  onChange: (s: ToolConfigState) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  function handleFile(file: File) {
    setError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        onChange({ ...state, claudeFile: file, claudeData: data });
      } catch {
        setError("Could not parse file. Please upload a valid Claude Desktop JSON export.");
      }
    };
    reader.readAsText(file);
  }

  return (
    <div>
      <p className="text-slate-400 text-sm mb-3">
        Go to <span className="text-white font-medium">Claude Desktop → Settings → Export Data</span>.
        Upload the resulting JSON file here.
      </p>
      <div
        onClick={() => inputRef.current?.click()}
        className="border-2 border-dashed border-slate-700 hover:border-slate-500 rounded-xl p-6 text-center cursor-pointer transition-colors bg-slate-800/30 mb-2"
      >
        <input
          ref={inputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }}
        />
        <div className="text-2xl mb-1">📁</div>
        {state.claudeFile ? (
          <p className="text-sm text-indigo-300 font-medium">{state.claudeFile.name}</p>
        ) : (
          <>
            <p className="text-sm text-slate-300 font-medium">Drop JSON file here</p>
            <p className="text-xs text-slate-500 mt-0.5">or click to browse</p>
          </>
        )}
      </div>
      {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
    </div>
  );
}

function OpenClawConfigForm({
  state,
  onChange,
}: {
  state: ToolConfigState;
  onChange: (s: ToolConfigState) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs text-slate-400 font-medium mb-1">Gateway URL</label>
        <input
          type="text"
          value={state.openclawGatewayUrl ?? ""}
          onChange={e => onChange({ ...state, openclawGatewayUrl: e.target.value })}
          placeholder="https://your-openclaw-gateway.example.com"
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>
      <div>
        <label className="block text-xs text-slate-400 font-medium mb-1">API Token</label>
        <input
          type="password"
          value={state.openclawApiToken ?? ""}
          onChange={e => onChange({ ...state, openclawApiToken: e.target.value })}
          placeholder="oc_..."
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>
    </div>
  );
}

function GenericFileConfigForm({
  state,
  onChange,
}: {
  state: ToolConfigState;
  onChange: (s: ToolConfigState) => void;
}) {
  return (
    <div>
      <p className="text-slate-400 text-sm mb-3">
        Paste agent data in any format: JSON, plain text, or key:value pairs.
      </p>
      <textarea
        rows={8}
        value={state.genericText ?? ""}
        onChange={e => onChange({ ...state, genericText: e.target.value })}
        placeholder={`Paste JSON, plain text, or key:value pairs...\n\nExamples:\n{ "name": "MyBot", "systemPrompt": "You are..." }\n\nor\n\nname: MyBot\nsystemPrompt: You are a helpful assistant`}
        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono resize-y"
      />
    </div>
  );
}

function ConfigStep({
  selectedTools,
  configState,
  onConfigChange,
  onDetect,
  onBack,
  detecting,
  detectError,
}: {
  selectedTools: Set<ToolId>;
  configState: ToolConfigState;
  onConfigChange: (s: ToolConfigState) => void;
  onDetect: () => void;
  onBack: () => void;
  detecting: boolean;
  detectError: string | null;
}) {
  const importableTools = TOOLS.filter(t => selectedTools.has(t.id) && t.hasConnector);

  function canDetect(): boolean {
    for (const tool of importableTools) {
      if (tool.id === "claude_desktop" && !configState.claudeData) return false;
      if (tool.id === "openclaw" && (!configState.openclawGatewayUrl || !configState.openclawApiToken)) return false;
      if (tool.id === "generic_file" && !configState.genericText?.trim()) return false;
    }
    return importableTools.length > 0;
  }

  return (
    <div>
      <h2 className="text-white text-xl font-semibold mb-1">Configure import</h2>
      <p className="text-slate-400 text-sm mb-5">
        Provide credentials or data for each selected tool.
      </p>

      <div className="space-y-5 mb-5">
        {importableTools.map(tool => (
          <div key={tool.id} className="border border-slate-700 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">{tool.icon}</span>
              <h3 className="text-white text-sm font-semibold">{tool.label}</h3>
            </div>
            {tool.id === "claude_desktop" && (
              <ClaudeDesktopConfigForm state={configState} onChange={onConfigChange} />
            )}
            {tool.id === "openclaw" && (
              <OpenClawConfigForm state={configState} onChange={onConfigChange} />
            )}
            {tool.id === "generic_file" && (
              <GenericFileConfigForm state={configState} onChange={onConfigChange} />
            )}
          </div>
        ))}
      </div>

      {detectError && (
        <div className="bg-red-900/30 border border-red-700/50 rounded-lg px-4 py-3 mb-4">
          <p className="text-red-400 text-sm">{detectError}</p>
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={onBack}
          disabled={detecting}
          className="px-4 py-2.5 border border-slate-700 hover:border-slate-500 text-slate-400 hover:text-white rounded-lg text-sm transition-colors disabled:opacity-40"
        >
          ← Back
        </button>
        <button
          disabled={!canDetect() || detecting}
          onClick={onDetect}
          className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
        >
          {detecting ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Detecting agents…
            </>
          ) : (
            "Detect my agents →"
          )}
        </button>
      </div>
    </div>
  );
}

// ─── Step 3: Agent Review ─────────────────────────────────────────────────────

function AgentReviewStep({
  agents,
  onUpdate,
  onImport,
  onBack,
}: {
  agents: DetectedAgent[];
  onUpdate: (agents: DetectedAgent[]) => void;
  onImport: () => void;
  onBack: () => void;
}) {
  const selectedCount = agents.filter(a => a.selected).length;

  function toggleAgent(idx: number) {
    onUpdate(agents.map((a, i) => i === idx ? { ...a, selected: !a.selected } : a));
  }

  function renameAgent(idx: number, name: string) {
    onUpdate(agents.map((a, i) => i === idx ? { ...a, name } : a));
  }

  return (
    <div>
      <h2 className="text-white text-xl font-semibold mb-1">
        We found {agents.length} agent{agents.length !== 1 ? "s" : ""}
      </h2>
      <p className="text-slate-400 text-sm mb-5">
        Review and rename before importing. Deselect any you don't want.
      </p>

      <div className="space-y-3 mb-5 max-h-80 overflow-y-auto pr-1">
        {agents.map((agent, idx) => (
          <div
            key={agent.sourceId}
            className={`border rounded-xl p-4 transition-all ${
              agent.selected
                ? "border-indigo-600/60 bg-indigo-950/30"
                : "border-slate-700 bg-slate-800/30 opacity-60"
            }`}
          >
            <div className="flex items-start gap-3">
              {/* Checkbox */}
              <button
                onClick={() => toggleAgent(idx)}
                className={`w-5 h-5 mt-0.5 rounded flex-shrink-0 border-2 flex items-center justify-center transition-colors ${
                  agent.selected
                    ? "border-indigo-500 bg-indigo-600"
                    : "border-slate-600 bg-transparent"
                }`}
                aria-label={agent.selected ? "Deselect agent" : "Select agent"}
              >
                {agent.selected && <span className="text-white text-xs">✓</span>}
              </button>

              <div className="flex-1 min-w-0">
                {/* Editable name */}
                <input
                  type="text"
                  value={agent.name}
                  onChange={e => renameAgent(idx, e.target.value)}
                  className="w-full bg-transparent text-white font-medium text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 rounded px-1 -mx-1 py-0.5"
                />

                {/* Description */}
                {agent.description && (
                  <p className="text-slate-400 text-xs mt-1 line-clamp-2">{agent.description}</p>
                )}

                {/* System prompt preview */}
                {agent.systemPrompt && (
                  <div className="mt-2 bg-slate-900/60 border border-slate-700/50 rounded-lg p-2">
                    <p className="text-xs text-slate-500 font-mono leading-relaxed line-clamp-3">
                      {agent.systemPrompt.length > 200
                        ? `${agent.systemPrompt.slice(0, 200)}…`
                        : agent.systemPrompt}
                    </p>
                  </div>
                )}

                {agent.model && (
                  <p className="text-xs text-slate-600 mt-1.5">Model: {agent.model}</p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-3 mb-4">
        <p className="text-xs text-slate-400">
          <span className="font-medium text-white">{selectedCount}</span> of{" "}
          <span className="font-medium text-white">{agents.length}</span> agents selected for import.
        </p>
      </div>

      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="px-4 py-2.5 border border-slate-700 hover:border-slate-500 text-slate-400 hover:text-white rounded-lg text-sm transition-colors"
        >
          ← Back
        </button>
        <button
          disabled={selectedCount === 0}
          onClick={onImport}
          className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
        >
          Import {selectedCount} agent{selectedCount !== 1 ? "s" : ""} →
        </button>
      </div>
    </div>
  );
}

// ─── Step 4: Importing ────────────────────────────────────────────────────────

function ImportingStep({ stage }: { stage: string }) {
  const stages = [
    { key: "detecting", label: "Connecting to source" },
    { key: "memory",    label: "Extracting memories" },
    { key: "creating",  label: "Creating agents" },
  ];
  const currentIdx = stages.findIndex(s => s.key === stage);

  return (
    <div className="py-4">
      <h2 className="text-white text-xl font-semibold mb-1">Importing your agents…</h2>
      <p className="text-slate-400 text-sm mb-8">This may take a moment while we process your data.</p>

      <div className="space-y-4">
        {stages.map((s, i) => {
          const done = i < currentIdx;
          const active = i === currentIdx;
          return (
            <div key={s.key} className="flex items-center gap-4">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
                  done
                    ? "bg-green-600"
                    : active
                    ? "bg-indigo-600"
                    : "bg-slate-800 border border-slate-700"
                }`}
              >
                {done ? (
                  <span className="text-white text-sm">✓</span>
                ) : active ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <span className="text-slate-600 text-sm">{i + 1}</span>
                )}
              </div>
              <span
                className={`text-sm transition-colors ${
                  done ? "text-green-400" : active ? "text-white font-medium" : "text-slate-600"
                }`}
              >
                {s.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Step 5: Success ──────────────────────────────────────────────────────────

function SuccessStep({
  count,
  skipped,
  onViewAgents,
}: {
  count: number;
  skipped: number;
  onViewAgents: () => void;
}) {
  return (
    <div className="text-center py-4">
      <div className="text-5xl mb-4">🎉</div>
      <h2 className="text-white text-xl font-semibold mb-2">
        Your {count} agent{count !== 1 ? "s are" : " is"} now alive on GenZAgents!
      </h2>
      <p className="text-slate-400 text-sm mb-2">
        Memories and conversations have been imported and are ready to use.
      </p>
      {skipped > 0 && (
        <p className="text-slate-500 text-xs mb-6">
          {skipped} duplicate{skipped !== 1 ? "s were" : " was"} skipped.
        </p>
      )}
      {skipped === 0 && <div className="mb-6" />}
      <button
        onClick={onViewAgents}
        className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
      >
        Go to Dashboard →
      </button>
    </div>
  );
}

// ─── Main Wizard ──────────────────────────────────────────────────────────────

export function ImportWizard() {
  const navigate = useNavigate();

  const [step, setStep] = useState<WizardStep>("tool-select");
  const [selectedTools, setSelectedTools] = useState<Set<ToolId>>(new Set());
  const [configState, setConfigState] = useState<ToolConfigState>({});
  const [detectedAgents, setDetectedAgents] = useState<DetectedAgent[]>([]);
  const [importStage, setImportStage] = useState<"detecting" | "memory" | "creating">("detecting");
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [detectError, setDetectError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [detecting, setDetecting] = useState(false);

  const TOTAL_CONTENT_STEPS = 3; // tool-select, config, agent-review
  const stepToIndex: Record<WizardStep, number> = {
    "tool-select":   0,
    "config":        1,
    "agent-review":  2,
    "importing":     3,
    "success":       3,
  };

  function toggleTool(tool: ToolId) {
    setSelectedTools(prev => {
      const next = new Set(prev);
      if (next.has(tool)) next.delete(tool); else next.add(tool);
      return next;
    });
  }

  /** Build the detect payload for a single tool. */
  function buildDetectPayload(toolId: ToolId): { sourceType: string; config: Record<string, unknown> } | null {
    switch (toolId) {
      case "claude_desktop":
        if (!configState.claudeData) return null;
        return { sourceType: "claude_desktop", config: { data: configState.claudeData } };
      case "openclaw":
        if (!configState.openclawGatewayUrl || !configState.openclawApiToken) return null;
        return {
          sourceType: "openclaw",
          config: {
            gatewayUrl: configState.openclawGatewayUrl,
            apiToken: configState.openclawApiToken,
          },
        };
      case "generic_file":
        if (!configState.genericText?.trim()) return null;
        return {
          sourceType: "generic_file",
          config: {
            text: configState.genericText,
            filename: configState.genericFilename,
          },
        };
      default:
        return null;
    }
  }

  async function handleDetect() {
    setDetectError(null);
    setDetecting(true);

    const importableTools = TOOLS.filter(t => selectedTools.has(t.id) && t.hasConnector);
    const allAgents: DetectedAgent[] = [];

    for (const tool of importableTools) {
      const payload = buildDetectPayload(tool.id);
      if (!payload) continue;

      try {
        const resp = await fetch(`${SERVER_URL}/api/pickup/detect`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        });

        if (!resp.ok) {
          const body = await resp.json().catch(() => ({ error: "Detection failed" }));
          throw new Error((body as { error?: string }).error ?? "Detection failed");
        }

        const data = await resp.json() as { agents: Array<{ sourceId?: string; name: string; systemPrompt: string; description?: string; model?: string }> };
        for (const a of data.agents) {
          allAgents.push({
            sourceId: a.sourceId ?? `${tool.id}_${Date.now()}_${Math.random()}`,
            name: a.name,
            systemPrompt: a.systemPrompt ?? "",
            description: a.description,
            model: a.model,
            selected: true,
          });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Detection failed";
        setDetectError(`${tool.label}: ${msg}`);
        setDetecting(false);
        return;
      }
    }

    setDetectedAgents(allAgents);
    setDetecting(false);

    if (allAgents.length === 0) {
      setDetectError("No agents found. Check your configuration and try again.");
      return;
    }

    setStep("agent-review");
  }

  async function handleImport() {
    setImportError(null);
    setStep("importing");

    const selectedAgentIds = detectedAgents
      .filter(a => a.selected)
      .map(a => a.sourceId);

    const importableTools = TOOLS.filter(t => selectedTools.has(t.id) && t.hasConnector);
    let totalImported = 0;
    let totalSkipped = 0;

    for (const tool of importableTools) {
      const payload = buildDetectPayload(tool.id);
      if (!payload) continue;

      try {
        setImportStage("detecting");
        await delay(300);
        setImportStage("memory");

        const resp = await fetch(`${SERVER_URL}/api/pickup/import`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            sourceType: payload.sourceType,
            config: payload.config,
            selectedAgentIds,
          }),
        });

        setImportStage("creating");
        await delay(300);

        if (!resp.ok) {
          const body = await resp.json().catch(() => ({ error: "Import failed" }));
          throw new Error((body as { error?: string }).error ?? "Import failed");
        }

        const result = await resp.json() as IngestionResult;
        totalImported += result.imported;
        totalSkipped += result.skipped;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Import failed";
        setImportError(`${tool.label}: ${msg}`);
        setStep("agent-review");
        return;
      }
    }

    setImportResult({ imported: totalImported, skipped: totalSkipped });
    setStep("success");
  }

  function delay(ms: number) {
    return new Promise<void>(r => setTimeout(r, ms));
  }

  return (
    <div className="max-w-lg mx-auto p-6 h-full overflow-y-auto">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate("/dashboard/agents")}
          className="text-slate-500 hover:text-slate-300 text-xs transition-colors mb-4"
        >
          ← Back to agents
        </button>
        <h1 className="text-white font-bold text-2xl">Import your agents</h1>
        <p className="text-slate-500 text-sm mt-1">
          Bring your AI agents from other tools into GenZAgents.
        </p>
      </div>

      {/* Progress bar */}
      {step !== "importing" && step !== "success" && (
        <StepIndicator current={stepToIndex[step]} total={TOTAL_CONTENT_STEPS} />
      )}

      {/* Import error banner */}
      {importError && step === "agent-review" && (
        <div className="bg-red-900/30 border border-red-700/50 rounded-lg px-4 py-3 mb-4">
          <p className="text-red-400 text-sm">{importError}</p>
        </div>
      )}

      {/* Step content */}
      {step === "tool-select" && (
        <ToolSelectStep
          selected={selectedTools}
          onToggle={toggleTool}
          onContinue={() => setStep("config")}
        />
      )}

      {step === "config" && (
        <ConfigStep
          selectedTools={selectedTools}
          configState={configState}
          onConfigChange={setConfigState}
          onDetect={handleDetect}
          onBack={() => setStep("tool-select")}
          detecting={detecting}
          detectError={detectError}
        />
      )}

      {step === "agent-review" && (
        <AgentReviewStep
          agents={detectedAgents}
          onUpdate={setDetectedAgents}
          onImport={handleImport}
          onBack={() => setStep("config")}
        />
      )}

      {step === "importing" && <ImportingStep stage={importStage} />}

      {step === "success" && importResult && (
        <SuccessStep
          count={importResult.imported}
          skipped={importResult.skipped}
          onViewAgents={() => navigate("/dashboard")}
        />
      )}
    </div>
  );
}
