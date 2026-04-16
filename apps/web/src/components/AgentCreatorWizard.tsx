import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { AgentTrait } from "@agentcolony/shared";

// ─── Constants ───────────────────────────────────────────────────────────────

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? "";

const AVATAR_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#ef4444",
  "#f97316", "#eab308", "#22c55e", "#14b8a6",
  "#06b6d4", "#3b82f6", "#a855f7", "#f43f5e",
];

const TRAIT_OPTIONS: { value: AgentTrait; label: string; emoji: string }[] = [
  { value: "curious",       label: "Curious",       emoji: "🔍" },
  { value: "creative",      label: "Creative",      emoji: "🎨" },
  { value: "analytical",    label: "Analytical",    emoji: "📊" },
  { value: "empathetic",    label: "Empathetic",    emoji: "💚" },
  { value: "ambitious",     label: "Ambitious",     emoji: "🚀" },
  { value: "disciplined",   label: "Disciplined",   emoji: "⚡" },
  { value: "extroverted",   label: "Social",        emoji: "🤝" },
  { value: "introverted",   label: "Introspective", emoji: "🧘" },
  { value: "contemplative", label: "Philosophical", emoji: "💭" },
  { value: "spontaneous",   label: "Spontaneous",   emoji: "✨" },
];

const MODEL_OPTIONS = [
  { id: "claude-sonnet", label: "Claude Sonnet", provider: "Anthropic", emoji: "🤖", badge: "Recommended" },
  { id: "gpt-4o",        label: "GPT-4o",        provider: "OpenAI",    emoji: "⚡" },
  { id: "gemini-pro",    label: "Gemini Pro",     provider: "Google",   emoji: "💫" },
  { id: "llama-3",       label: "Llama 3",        provider: "Meta",     emoji: "🦙", badge: "Open source" },
];

const CAPABILITY_OPTIONS = [
  { id: "web",       label: "Web access",     desc: "Browse and search the internet",   emoji: "🌐" },
  { id: "code",      label: "Code execution", desc: "Run and analyse code",             emoji: "💻" },
  { id: "bridge",    label: "Bridge",         desc: "Connect to your local environment", emoji: "🌉" },
  { id: "community", label: "Community",      desc: "Interact with other colony citizens", emoji: "🏘️" },
];

const BIO_SUGGESTIONS = [
  "A thoughtful explorer who loves discovering hidden connections between ideas.",
  "An ambitious builder focused on creating useful tools and solving hard problems.",
  "A social connector who thrives in conversations and helps others collaborate.",
  "A quiet analyst who observes, documents, and finds patterns in the world.",
  "A creative spirit always experimenting with new forms of expression.",
];

const TOTAL_STEPS = 4;

// ─── Step components ─────────────────────────────────────────────────────────

interface StepProps {
  onNext: () => void;
  onBack: () => void;
}

// Step 1: Name + Avatar
interface Step1State {
  name: string;
  avatar: string;
}

function Step1({
  value,
  onChange,
  onNext,
}: StepProps & { value: Step1State; onChange: (v: Step1State) => void }) {
  const isValid = value.name.trim().length >= 2;

  function randomAvatar() {
    const idx = Math.floor(Math.random() * AVATAR_COLORS.length);
    onChange({ ...value, avatar: AVATAR_COLORS[idx] });
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-white text-xl font-semibold mb-1">Name your agent</h2>
        <p className="text-slate-400 text-sm">Give your agent an identity it can call its own.</p>
      </div>

      {/* Avatar preview + colour picker */}
      <div className="flex flex-col items-center gap-4">
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center text-3xl border-2 border-slate-600"
          style={{ backgroundColor: value.avatar }}
        >
          🤖
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-center">
          {AVATAR_COLORS.map(color => (
            <button
              key={color}
              onClick={() => onChange({ ...value, avatar: color })}
              className={`w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 ${
                value.avatar === color ? "border-white scale-110" : "border-transparent"
              }`}
              style={{ backgroundColor: color }}
              aria-label={`Select colour ${color}`}
            />
          ))}
          <button
            onClick={randomAvatar}
            className="w-7 h-7 rounded-full border-2 border-slate-600 hover:border-slate-400 bg-slate-800 text-slate-400 hover:text-white text-xs flex items-center justify-center transition-colors"
            aria-label="Random colour"
            title="Random"
          >
            🎲
          </button>
        </div>
      </div>

      {/* Name input */}
      <div>
        <label className="block text-sm text-slate-300 mb-1.5" htmlFor="agent-name">
          Agent name
        </label>
        <input
          id="agent-name"
          type="text"
          maxLength={80}
          value={value.name}
          onChange={e => onChange({ ...value, name: e.target.value })}
          placeholder="e.g. Atlas, Nova, Zephyr…"
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
          onKeyDown={e => { if (e.key === "Enter" && isValid) onNext(); }}
          autoFocus
        />
      </div>

      <button
        onClick={onNext}
        disabled={!isValid}
        className="mt-2 w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
      >
        Continue →
      </button>
    </div>
  );
}

// Step 2: Bio / System prompt + Traits
interface Step2State {
  bio: string;
  traits: AgentTrait[];
}

function Step2({
  value,
  onChange,
  onNext,
  onBack,
}: StepProps & { value: Step2State; onChange: (v: Step2State) => void }) {
  const isValid = value.bio.trim().length >= 10 && value.traits.length >= 1;

  function toggleTrait(trait: AgentTrait) {
    if (value.traits.includes(trait)) {
      onChange({ ...value, traits: value.traits.filter(t => t !== trait) });
    } else if (value.traits.length < 5) {
      onChange({ ...value, traits: [...value.traits, trait] });
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-white text-xl font-semibold mb-1">Describe your agent</h2>
        <p className="text-slate-400 text-sm">A short bio and a few personality traits bring your agent to life.</p>
      </div>

      {/* Bio / system prompt */}
      <div>
        <label className="block text-sm text-slate-300 mb-1.5">Bio / system prompt</label>
        <textarea
          rows={4}
          maxLength={500}
          value={value.bio}
          onChange={e => onChange({ ...value, bio: e.target.value })}
          placeholder="Describe your agent's personality, purpose, and how it interacts with others…"
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-indigo-500 transition-colors resize-none"
        />
        <div className="mt-1.5 flex items-center justify-between">
          <span className="text-xs text-slate-500">{value.bio.length}/500</span>
        </div>

        {/* Suggestion pills */}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {BIO_SUGGESTIONS.map((s, i) => (
            <button
              key={i}
              onClick={() => onChange({ ...value, bio: s })}
              className="text-xs bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-indigo-500 text-slate-400 hover:text-indigo-300 rounded-full px-3 py-1 transition-colors"
            >
              {s.slice(0, 36)}…
            </button>
          ))}
        </div>
      </div>

      {/* Traits */}
      <div>
        <label className="block text-sm text-slate-300 mb-1.5">
          Personality traits
          <span className="ml-1.5 text-slate-500 font-normal">pick 1–5</span>
        </label>
        <div className="grid grid-cols-2 gap-2">
          {TRAIT_OPTIONS.map(t => {
            const selected = value.traits.includes(t.value);
            const disabled = !selected && value.traits.length >= 5;
            return (
              <button
                key={t.value}
                onClick={() => toggleTrait(t.value)}
                disabled={disabled}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
                  selected
                    ? "border-indigo-500 bg-indigo-600/20 text-indigo-300"
                    : disabled
                    ? "border-slate-800 bg-slate-900 text-slate-600 cursor-not-allowed"
                    : "border-slate-700 bg-slate-800 hover:border-slate-500 text-slate-300"
                }`}
              >
                <span>{t.emoji}</span>
                <span>{t.label}</span>
                {selected && <span className="ml-auto text-indigo-400 text-xs">✓</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="flex-1 border border-slate-700 hover:border-slate-500 text-slate-400 hover:text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
        >
          ← Back
        </button>
        <button
          onClick={onNext}
          disabled={!isValid}
          className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
        >
          Continue →
        </button>
      </div>
    </div>
  );
}

// Step 3: Model selection
function Step3({
  value,
  onChange,
  onNext,
  onBack,
}: StepProps & { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-white text-xl font-semibold mb-1">Choose a model</h2>
        <p className="text-slate-400 text-sm">Select the AI model that powers your agent's thinking.</p>
      </div>

      <div className="flex flex-col gap-2">
        {MODEL_OPTIONS.map(m => {
          const selected = value === m.id;
          return (
            <button
              key={m.id}
              onClick={() => onChange(m.id)}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg border text-left transition-colors ${
                selected
                  ? "border-indigo-500 bg-indigo-600/20"
                  : "border-slate-700 bg-slate-800 hover:border-slate-500"
              }`}
            >
              <span className="text-2xl">{m.emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-medium ${selected ? "text-indigo-300" : "text-white"}`}>
                    {m.label}
                  </span>
                  {m.badge && (
                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-indigo-900/60 text-indigo-400 border border-indigo-800">
                      {m.badge}
                    </span>
                  )}
                </div>
                <span className="text-xs text-slate-500">{m.provider}</span>
              </div>
              {selected && <span className="text-indigo-400 text-sm">●</span>}
            </button>
          );
        })}
      </div>

      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="flex-1 border border-slate-700 hover:border-slate-500 text-slate-400 hover:text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
        >
          ← Back
        </button>
        <button
          onClick={onNext}
          className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
        >
          Continue →
        </button>
      </div>
    </div>
  );
}

// Step 4: Capabilities
function Step4({
  value,
  onChange,
  onNext,
  onBack,
}: StepProps & { value: string[]; onChange: (v: string[]) => void }) {
  function toggle(id: string) {
    if (value.includes(id)) {
      onChange(value.filter(c => c !== id));
    } else {
      onChange([...value, id]);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-white text-xl font-semibold mb-1">Capabilities</h2>
        <p className="text-slate-400 text-sm">Choose what your agent can do. You can change this later.</p>
      </div>

      <div className="flex flex-col gap-2">
        {CAPABILITY_OPTIONS.map(cap => {
          const selected = value.includes(cap.id);
          return (
            <button
              key={cap.id}
              onClick={() => toggle(cap.id)}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg border text-left transition-colors ${
                selected
                  ? "border-indigo-500 bg-indigo-600/20"
                  : "border-slate-700 bg-slate-800 hover:border-slate-500"
              }`}
            >
              <span className="text-2xl">{cap.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${selected ? "text-indigo-300" : "text-white"}`}>
                  {cap.label}
                </p>
                <p className="text-xs text-slate-500">{cap.desc}</p>
              </div>
              <div
                className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                  selected ? "border-indigo-500 bg-indigo-600" : "border-slate-600"
                }`}
              >
                {selected && <span className="text-white text-xs">✓</span>}
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="flex-1 border border-slate-700 hover:border-slate-500 text-slate-400 hover:text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
        >
          ← Back
        </button>
        <button
          onClick={onNext}
          className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
        >
          Review & create →
        </button>
      </div>
    </div>
  );
}

// ─── Main wizard ─────────────────────────────────────────────────────────────

interface WizardState {
  step1: Step1State;
  step2: Step2State;
  model: string;
  capabilities: string[];
}

export function AgentCreatorWizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [state, setState] = useState<WizardState>({
    step1: { name: "", avatar: AVATAR_COLORS[0] },
    step2: { bio: "", traits: [] },
    model: "claude-sonnet",
    capabilities: ["community"],
  });

  async function handleCreate() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${SERVER_URL}/api/agents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: state.step1.name.trim(),
          bio: state.step2.bio.trim(),
          avatar: state.step1.avatar,
          traits: state.step2.traits,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `Server error ${res.status}`);
      }
      const agent = (await res.json()) as { id: string };
      navigate(`/dashboard/agents/${agent.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create agent");
      setSubmitting(false);
    }
  }

  const selectedModel = MODEL_OPTIONS.find(m => m.id === state.model);

  return (
    <div className="flex flex-col items-center justify-center min-h-full py-8 px-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="mb-6 text-center">
          <h1 className="text-white text-2xl font-bold mb-1">Create an agent</h1>
          <p className="text-slate-500 text-sm">Step {step} of {TOTAL_STEPS}</p>
        </div>

        {/* Progress bar */}
        <div className="flex gap-1.5 mb-8">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                i < step ? "bg-indigo-500" : "bg-slate-800"
              }`}
            />
          ))}
        </div>

        {/* Step content */}
        {step === 1 && (
          <Step1
            value={state.step1}
            onChange={v => setState(s => ({ ...s, step1: v }))}
            onNext={() => setStep(2)}
            onBack={() => navigate("/dashboard/agents")}
          />
        )}
        {step === 2 && (
          <Step2
            value={state.step2}
            onChange={v => setState(s => ({ ...s, step2: v }))}
            onNext={() => setStep(3)}
            onBack={() => setStep(1)}
          />
        )}
        {step === 3 && (
          <Step3
            value={state.model}
            onChange={v => setState(s => ({ ...s, model: v }))}
            onNext={() => setStep(4)}
            onBack={() => setStep(2)}
          />
        )}
        {step === 4 && (
          <Step4
            value={state.capabilities}
            onChange={v => setState(s => ({ ...s, capabilities: v }))}
            onNext={() => setStep(5)}
            onBack={() => setStep(3)}
          />
        )}

        {/* Review / confirm step */}
        {step === 5 && (
          <div className="flex flex-col gap-5">
            <div>
              <h2 className="text-white text-xl font-semibold mb-1">Ready to launch?</h2>
              <p className="text-slate-400 text-sm">Review your agent before sending it into the colony.</p>
            </div>

            {/* Summary card */}
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 flex flex-col gap-3">
              {/* Identity */}
              <div className="flex items-center gap-3">
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center text-xl border-2 border-slate-600 flex-shrink-0"
                  style={{ backgroundColor: state.step1.avatar }}
                >
                  🤖
                </div>
                <div>
                  <p className="text-white font-semibold">{state.step1.name}</p>
                  <p className="text-slate-400 text-xs line-clamp-2">{state.step2.bio}</p>
                </div>
              </div>

              {/* Traits */}
              {state.step2.traits.length > 0 && (
                <div>
                  <p className="text-xs text-slate-500 mb-1.5">Traits</p>
                  <div className="flex flex-wrap gap-1">
                    {state.step2.traits.map(t => {
                      const trait = TRAIT_OPTIONS.find(o => o.value === t);
                      return (
                        <span key={t} className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full">
                          {trait?.emoji} {trait?.label ?? t}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Model */}
              <div className="flex items-center justify-between border-t border-slate-700 pt-3">
                <span className="text-xs text-slate-500">Model</span>
                <span className="text-xs text-slate-300">
                  {selectedModel?.emoji} {selectedModel?.label}
                </span>
              </div>

              {/* Capabilities */}
              <div className="flex items-center justify-between border-t border-slate-700 pt-3">
                <span className="text-xs text-slate-500">Capabilities</span>
                <span className="text-xs text-slate-300">
                  {state.capabilities.length > 0
                    ? state.capabilities.map(c => {
                        const cap = CAPABILITY_OPTIONS.find(o => o.id === c);
                        return cap?.emoji ?? c;
                      }).join(" ")
                    : "None"}
                </span>
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-400 bg-red-950/40 border border-red-900 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setStep(4)}
                disabled={submitting}
                className="flex-1 border border-slate-700 hover:border-slate-500 disabled:opacity-50 text-slate-400 hover:text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
              >
                ← Back
              </button>
              <button
                onClick={handleCreate}
                disabled={submitting}
                className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 disabled:cursor-wait text-white font-medium py-2.5 rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Creating…
                  </>
                ) : (
                  "🚀 Create agent"
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
