/**
 * ImportWizard — GEN-99
 *
 * Onboarding flow for importing agents from external tools.
 *
 * Steps:
 *  1. ToolSelect  — multi-select which tools the user comes from
 *  2. FileUpload  — upload Claude Desktop JSON export
 *  3. AgentReview — compare detected agents, edit names, pick which to import
 *  4. Importing   — progress indicator while server runs ingestion
 *  5. Success     — "Your X agents are now alive on GenZAgents"
 */

import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? "";

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = "tool-select" | "file-upload" | "agent-review" | "importing" | "success";

type Tool = "claude" | "openclaw" | "gpt" | "copilot" | "cursor" | "local-vps" | "other";

interface ToolOption {
  id: Tool;
  label: string;
  icon: string;
  supportsImport: boolean;
  importLabel?: string;
}

const TOOLS: ToolOption[] = [
  { id: "claude",    label: "Claude",        icon: "🤖", supportsImport: true,  importLabel: "Import projects & conversations" },
  { id: "openclaw",  label: "OpenClaw",       icon: "🦀", supportsImport: false },
  { id: "gpt",       label: "ChatGPT / GPT",  icon: "💬", supportsImport: false },
  { id: "copilot",   label: "GitHub Copilot", icon: "🐙", supportsImport: false },
  { id: "cursor",    label: "Cursor",         icon: "⚡", supportsImport: false },
  { id: "local-vps", label: "Local / VPS",    icon: "🖥️", supportsImport: false },
  { id: "other",     label: "Other",          icon: "✨", supportsImport: false },
];

// What the Claude Desktop JSON export looks like
interface ClaudeExportProject {
  id: string;
  name: string;
  systemPrompt?: string;
  description?: string;
  model?: string;
}

interface ClaudeExportMessage {
  role: "human" | "assistant" | "user";
  content: string;
}

interface ClaudeExportConversation {
  projectId?: string;
  messages: ClaudeExportMessage[];
  createdAt?: number;
}

interface ClaudeExportData {
  projects?: ClaudeExportProject[];
  conversations?: ClaudeExportConversation[];
}

// Card state for the agent review step
interface AgentCard {
  sourceId: string;
  name: string;        // editable
  description: string;
  systemPromptPreview: string;
  conversationCount: number;
  selected: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseClaudeExport(data: ClaudeExportData): AgentCard[] {
  const projects = data.projects ?? [];
  const conversations = data.conversations ?? [];

  if (projects.length === 0) {
    const count = conversations.filter(c => !c.projectId).length;
    return [
      {
        sourceId: "__default__",
        name: "My Claude Agent",
        description: "Imported from Claude Desktop (no project configured)",
        systemPromptPreview: "",
        conversationCount: count,
        selected: true,
      },
    ];
  }

  return projects.map(p => {
    const convCount = conversations.filter(c => c.projectId === p.id).length;
    const prompt = p.systemPrompt ?? "";
    return {
      sourceId: p.id,
      name: p.name,
      description: p.description ?? (prompt ? prompt.slice(0, 120) : "No description"),
      systemPromptPreview: prompt.length > 200 ? `${prompt.slice(0, 200)}…` : prompt,
      conversationCount: convCount,
      selected: true,
    };
  });
}

function buildFilteredExport(original: ClaudeExportData, cards: AgentCard[]): ClaudeExportData {
  const selectedIds = new Set(cards.filter(c => c.selected).map(c => c.sourceId));
  const nameMap = new Map(cards.map(c => [c.sourceId, c.name]));

  const projects = (original.projects ?? [])
    .filter(p => selectedIds.has(p.id))
    .map(p => ({ ...p, name: nameMap.get(p.id) ?? p.name }));

  const conversations = (original.conversations ?? []).filter(
    c => !c.projectId || selectedIds.has(c.projectId)
  );

  return { projects, conversations };
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

// ─── Step: Tool Select ────────────────────────────────────────────────────────

function ToolSelectStep({
  selected,
  onToggle,
  onContinue,
}: {
  selected: Set<Tool>;
  onToggle: (t: Tool) => void;
  onContinue: () => void;
}) {
  const hasImportable = [...selected].some(t => TOOLS.find(o => o.id === t)?.supportsImport);

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
              className={`flex items-center gap-3 px-4 py-3 rounded-lg border text-left transition-all ${
                isSelected
                  ? "border-indigo-500 bg-indigo-600/15 text-white"
                  : "border-slate-700 bg-slate-800/50 text-slate-300 hover:border-slate-500 hover:text-white"
              }`}
            >
              <span className="text-xl flex-shrink-0">{tool.icon}</span>
              <div className="min-w-0">
                <p className="text-sm font-medium">{tool.label}</p>
                {tool.supportsImport && (
                  <p className="text-xs text-indigo-400 truncate">{tool.importLabel}</p>
                )}
              </div>
              {isSelected && (
                <span className="ml-auto text-indigo-400 flex-shrink-0">✓</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex gap-3">
        <button
          disabled={selected.size === 0}
          onClick={onContinue}
          className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
        >
          {hasImportable ? "Import my agents →" : "Continue →"}
        </button>
      </div>

      {selected.size > 0 && !hasImportable && (
        <p className="mt-3 text-xs text-slate-500 text-center">
          Direct import isn't available for these tools yet — we'll create fresh agents for you.
        </p>
      )}
    </div>
  );
}

// ─── Step: File Upload ────────────────────────────────────────────────────────

function FileUploadStep({
  onParsed,
  onBack,
}: {
  onParsed: (data: ClaudeExportData) => void;
  onBack: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    setError(null);
    setFilename(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const data = JSON.parse(text) as ClaudeExportData;
        if (!data || typeof data !== "object") {
          throw new Error("Invalid export file format");
        }
        onParsed(data);
      } catch {
        setError("Could not parse file. Please upload a valid Claude Desktop JSON export.");
        setFilename(null);
      }
    };
    reader.readAsText(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  return (
    <div>
      <h2 className="text-white text-xl font-semibold mb-1">Upload your Claude export</h2>
      <p className="text-slate-400 text-sm mb-5">
        Export your Claude Desktop data as JSON and upload it here.
        Go to Claude Desktop → Settings → Export Data.
      </p>

      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors mb-4 ${
          dragging
            ? "border-indigo-500 bg-indigo-600/10"
            : "border-slate-700 hover:border-slate-500 bg-slate-800/30"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }}
        />
        <div className="text-3xl mb-2">📁</div>
        {filename ? (
          <p className="text-sm text-indigo-300 font-medium">{filename}</p>
        ) : (
          <>
            <p className="text-sm text-slate-300 font-medium">Drop your JSON file here</p>
            <p className="text-xs text-slate-500 mt-1">or click to browse</p>
          </>
        )}
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700/50 rounded-lg px-4 py-3 mb-4">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      <div className="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-3 mb-5">
        <p className="text-xs text-slate-400 font-medium mb-1">Expected format</p>
        <pre className="text-xs text-slate-500 leading-relaxed">{`{
  "projects": [{ "id", "name", "systemPrompt" }],
  "conversations": [{ "projectId", "messages" }]
}`}</pre>
      </div>

      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="px-4 py-2.5 border border-slate-700 hover:border-slate-500 text-slate-400 hover:text-white rounded-lg text-sm transition-colors"
        >
          ← Back
        </button>
      </div>
    </div>
  );
}

// ─── Step: Agent Review ───────────────────────────────────────────────────────

function AgentReviewStep({
  cards,
  onUpdate,
  onImport,
  onBack,
}: {
  cards: AgentCard[];
  onUpdate: (cards: AgentCard[]) => void;
  onImport: () => void;
  onBack: () => void;
}) {
  const selectedCount = cards.filter(c => c.selected).length;

  function toggleCard(idx: number) {
    const next = cards.map((c, i) => i === idx ? { ...c, selected: !c.selected } : c);
    onUpdate(next);
  }

  function renameName(idx: number, name: string) {
    const next = cards.map((c, i) => i === idx ? { ...c, name } : c);
    onUpdate(next);
  }

  return (
    <div>
      <h2 className="text-white text-xl font-semibold mb-1">Your detected agents</h2>
      <p className="text-slate-400 text-sm mb-5">
        Review and rename your agents before importing. Deselect any you don't want.
      </p>

      <div className="space-y-3 mb-5 max-h-80 overflow-y-auto pr-1">
        {cards.map((card, idx) => (
          <div
            key={card.sourceId}
            className={`border rounded-xl p-4 transition-all ${
              card.selected
                ? "border-indigo-600/60 bg-indigo-950/30"
                : "border-slate-700 bg-slate-800/30 opacity-60"
            }`}
          >
            <div className="flex items-start gap-3">
              {/* Checkbox */}
              <button
                onClick={() => toggleCard(idx)}
                className={`w-5 h-5 mt-0.5 rounded flex-shrink-0 border-2 flex items-center justify-center transition-colors ${
                  card.selected
                    ? "border-indigo-500 bg-indigo-600"
                    : "border-slate-600 bg-transparent"
                }`}
                aria-label={card.selected ? "Deselect agent" : "Select agent"}
              >
                {card.selected && <span className="text-white text-xs">✓</span>}
              </button>

              <div className="flex-1 min-w-0">
                {/* Editable name */}
                <input
                  type="text"
                  value={card.name}
                  onChange={e => renameName(idx, e.target.value)}
                  className="w-full bg-transparent text-white font-medium text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 rounded px-1 -mx-1 py-0.5"
                />

                {/* Description */}
                <p className="text-slate-400 text-xs mt-1 line-clamp-2">{card.description}</p>

                {/* Meta row */}
                <div className="flex items-center gap-3 mt-2">
                  <span className="text-xs text-slate-500">
                    💬 {card.conversationCount} conversation{card.conversationCount !== 1 ? "s" : ""}
                  </span>
                  {card.systemPromptPreview && (
                    <span className="text-xs text-indigo-400/70">has system prompt</span>
                  )}
                </div>

                {/* System prompt preview */}
                {card.systemPromptPreview && (
                  <div className="mt-2 bg-slate-900/60 border border-slate-700/50 rounded-lg p-2">
                    <p className="text-xs text-slate-500 font-mono leading-relaxed line-clamp-3">
                      {card.systemPromptPreview}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
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

// ─── Step: Importing (Progress) ───────────────────────────────────────────────

function ImportingStep({ stage }: { stage: string }) {
  const stages = [
    { key: "parsing",   label: "Parsing export file" },
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

// ─── Step: Success ────────────────────────────────────────────────────────────

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
      <div className="flex flex-col gap-3">
        <button
          onClick={onViewAgents}
          className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
        >
          View my agents →
        </button>
      </div>
    </div>
  );
}

// ─── Main Wizard ──────────────────────────────────────────────────────────────

export function ImportWizard() {
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>("tool-select");
  const [selectedTools, setSelectedTools] = useState<Set<Tool>>(new Set());
  const [exportData, setExportData] = useState<ClaudeExportData | null>(null);
  const [agentCards, setAgentCards] = useState<AgentCard[]>([]);
  const [importStage, setImportStage] = useState<"parsing" | "memory" | "creating">("parsing");
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const TOTAL_CONTENT_STEPS = 3; // tool-select, file-upload, agent-review
  const stepToIndex: Record<Step, number> = {
    "tool-select":    0,
    "file-upload":    1,
    "agent-review":   2,
    "importing":      3,
    "success":        3,
  };

  function toggleTool(tool: Tool) {
    setSelectedTools(prev => {
      const next = new Set(prev);
      if (next.has(tool)) next.delete(tool);
      else next.add(tool);
      return next;
    });
  }

  function handleToolContinue() {
    const hasImportable = [...selectedTools].some(t => TOOLS.find(o => o.id === t)?.supportsImport);
    if (hasImportable) {
      setStep("file-upload");
    } else {
      // No importable tool — skip to creating default agents (not in scope for MVP)
      navigate("/dashboard/agents/new");
    }
  }

  function handleFileParsed(data: ClaudeExportData) {
    const cards = parseClaudeExport(data);
    setExportData(data);
    setAgentCards(cards);
    setStep("agent-review");
  }

  async function handleImport() {
    if (!exportData) return;
    setImportError(null);
    setStep("importing");

    const filtered = buildFilteredExport(exportData, agentCards);

    try {
      setImportStage("parsing");
      await delay(600);
      setImportStage("memory");

      const resp = await fetch(`${SERVER_URL}/api/pickup/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceType: "claude_desktop", config: { data: filtered } }),
      });

      setImportStage("creating");
      await delay(400);

      if (!resp.ok) {
        const body = await resp.json().catch(() => ({ error: "Import failed" }));
        throw new Error((body as { error?: string }).error ?? "Import failed");
      }

      const result = await resp.json() as { imported: number; skipped: number };
      setImportResult(result);
      setStep("success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Import failed";
      setImportError(msg);
      setStep("agent-review");
    }
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

      {/* Progress bar (only for content steps) */}
      {step !== "importing" && step !== "success" && (
        <StepIndicator
          current={stepToIndex[step]}
          total={TOTAL_CONTENT_STEPS}
        />
      )}

      {/* Error banner */}
      {importError && (
        <div className="bg-red-900/30 border border-red-700/50 rounded-lg px-4 py-3 mb-4">
          <p className="text-red-400 text-sm">{importError}</p>
        </div>
      )}

      {/* Step content */}
      {step === "tool-select" && (
        <ToolSelectStep
          selected={selectedTools}
          onToggle={toggleTool}
          onContinue={handleToolContinue}
        />
      )}

      {step === "file-upload" && (
        <FileUploadStep
          onParsed={handleFileParsed}
          onBack={() => setStep("tool-select")}
        />
      )}

      {step === "agent-review" && (
        <AgentReviewStep
          cards={agentCards}
          onUpdate={setAgentCards}
          onImport={handleImport}
          onBack={() => setStep("file-upload")}
        />
      )}

      {step === "importing" && (
        <ImportingStep stage={importStage} />
      )}

      {step === "success" && importResult && (
        <SuccessStep
          count={importResult.imported}
          skipped={importResult.skipped}
          onViewAgents={() => navigate("/dashboard/agents")}
        />
      )}
    </div>
  );
}
