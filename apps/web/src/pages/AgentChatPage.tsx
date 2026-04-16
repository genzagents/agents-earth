import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? "";

// ─── Types ────────────────────────────────────────────────────────────────────

interface OwnedAgent {
  id: string;
  name: string;
  avatarColor: string;
  model: string;
  description?: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  model?: string;
  streaming?: boolean;
  error?: boolean;
  timestamp: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function modelLabel(model: string): string {
  if (model.includes("opus")) return "Opus";
  if (model.includes("sonnet")) return "Sonnet";
  if (model.includes("haiku")) return "Haiku";
  return model.split("-").slice(-2).join(" ");
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({ msg, agentColor, agentName }: {
  msg: ChatMessage;
  agentColor: string;
  agentName: string;
}) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex flex-col gap-0.5 ${isUser ? "items-end" : "items-start"}`}>
      {!isUser && (
        <div className="flex items-center gap-1.5 ml-1 mb-0.5">
          <div
            className="w-5 h-5 rounded-full flex-shrink-0"
            style={{ backgroundColor: agentColor }}
          />
          <span className="text-xs text-slate-400 font-medium">{agentName}</span>
          {msg.model && (
            <span className="text-xs text-slate-600 font-mono">
              · {modelLabel(msg.model)}
            </span>
          )}
        </div>
      )}
      <div
        className={`max-w-[80%] sm:max-w-[70%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words ${
          isUser
            ? "bg-indigo-600 text-white rounded-tr-sm"
            : msg.error
            ? "bg-red-950 border border-red-800 text-red-300 rounded-tl-sm"
            : "bg-slate-800 text-slate-100 rounded-tl-sm"
        }`}
      >
        {msg.content}
        {msg.streaming && (
          <span className="inline-block w-1 h-4 ml-0.5 bg-slate-400 animate-pulse rounded-sm align-text-bottom" />
        )}
      </div>
      <span className="text-xs text-slate-600 mx-1">
        {formatTime(msg.timestamp)}
      </span>
    </div>
  );
}

// ─── Thinking indicator ───────────────────────────────────────────────────────

function ThinkingIndicator({ agentColor, agentName }: { agentColor: string; agentName: string }) {
  return (
    <div className="flex flex-col gap-0.5 items-start">
      <div className="flex items-center gap-1.5 ml-1 mb-0.5">
        <div className="w-5 h-5 rounded-full flex-shrink-0" style={{ backgroundColor: agentColor }} />
        <span className="text-xs text-slate-400 font-medium">{agentName}</span>
      </div>
      <div className="bg-slate-800 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1.5">
        {[0, 1, 2].map(i => (
          <span
            key={i}
            className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce"
            style={{ animationDelay: `${i * 150}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

// ─── File attachment toast ────────────────────────────────────────────────────

function AttachToast({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-slate-700 text-slate-200 text-xs px-4 py-2 rounded-full shadow-lg z-50 animate-fade-in">
      File attachments coming soon
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function AgentChatPage() {
  const { agentId } = useParams<{ agentId: string }>();
  const navigate = useNavigate();

  const [agent, setAgent] = useState<OwnedAgent | null>(null);
  const [agentLoading, setAgentLoading] = useState(true);
  const [agentError, setAgentError] = useState<string | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [showAttachToast, setShowAttachToast] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ── Load agent ──
  useEffect(() => {
    if (!agentId) return;
    fetch(`${SERVER_URL}/api/agents/${agentId}`)
      .then(r => {
        if (!r.ok) throw new Error("Agent not found");
        return r.json() as Promise<OwnedAgent>;
      })
      .then(a => { setAgent(a); setAgentLoading(false); })
      .catch(() => { setAgentError("Agent not found."); setAgentLoading(false); });
  }, [agentId]);

  // ── Load conversation history ──
  useEffect(() => {
    if (!agentId || historyLoaded) return;
    fetch(`${SERVER_URL}/api/runtime/history/${agentId}`)
      .then(r => r.json())
      .then((data: { messages: Array<{ role: "user" | "assistant"; content: string }>; model: string }) => {
        const loaded: ChatMessage[] = data.messages.map((m, i) => ({
          id: `history-${i}`,
          role: m.role,
          content: m.content,
          model: m.role === "assistant" ? data.model : undefined,
          timestamp: Date.now() - (data.messages.length - i) * 1000,
        }));
        setMessages(loaded);
        setHistoryLoaded(true);
      })
      .catch(() => setHistoryLoaded(true));
  }, [agentId, historyLoaded]);

  // ── Scroll to bottom ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isThinking]);

  // ── Auto-resize textarea ──
  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    const ta = e.target;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }

  // ── Send message with SSE streaming ──
  const sendMessage = useCallback(async () => {
    if (!input.trim() || !agentId || isStreaming) return;

    const userText = input.trim();
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: userText,
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, userMsg]);
    setIsThinking(true);
    setIsStreaming(true);

    const assistantId = `assistant-${Date.now()}`;
    let streamedContent = "";
    let finalModel = agent?.model ?? "claude-sonnet-4-6";

    abortRef.current = new AbortController();

    try {
      const res = await fetch(`${SERVER_URL}/api/runtime/invoke/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, message: userText }),
        signal: abortRef.current.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(res.status === 403 ? "Access denied" : "Stream failed");
      }

      setIsThinking(false);

      // Add assistant bubble immediately (streaming)
      setMessages(prev => [...prev, {
        id: assistantId,
        role: "assistant",
        content: "",
        model: finalModel,
        streaming: true,
        timestamp: Date.now(),
      }]);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6);
          if (raw === "[DONE]") break;

          try {
            const parsed = JSON.parse(raw) as { chunk?: string; meta?: { model: string }; error?: string };
            if (parsed.error) {
              throw new Error(parsed.error);
            }
            if (parsed.meta?.model) {
              finalModel = parsed.meta.model;
            }
            if (parsed.chunk) {
              streamedContent += parsed.chunk;
              setMessages(prev => prev.map(m =>
                m.id === assistantId
                  ? { ...m, content: streamedContent, model: finalModel }
                  : m
              ));
            }
          } catch (parseErr) {
            if (parseErr instanceof SyntaxError) continue;
            throw parseErr;
          }
        }
      }

      // Finalize: remove streaming cursor
      setMessages(prev => prev.map(m =>
        m.id === assistantId ? { ...m, streaming: false, model: finalModel } : m
      ));
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        // User cancelled — finalize whatever we got
        setMessages(prev => prev.map(m =>
          m.id === assistantId
            ? { ...m, streaming: false }
            : m
        ));
      } else {
        setIsThinking(false);
        const errorMsg = err instanceof Error ? err.message : "Failed to get response";
        setMessages(prev => {
          // Remove empty streaming bubble if nothing came through
          const withoutEmpty = prev.filter(m => !(m.id === assistantId && m.content === ""));
          return [...withoutEmpty, {
            id: `error-${Date.now()}`,
            role: "assistant",
            content: errorMsg,
            error: true,
            timestamp: Date.now(),
          }];
        });
      }
    } finally {
      setIsThinking(false);
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [input, agentId, isStreaming, agent?.model]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  }

  function handleStop() {
    abortRef.current?.abort();
  }

  // ── Loading / error states ──
  if (agentLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (agentError || !agent) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <p className="text-red-400 text-sm">{agentError ?? "Agent not found"}</p>
        <button
          onClick={() => navigate("/dashboard/agents")}
          className="text-sm text-indigo-400 hover:text-indigo-300"
        >
          ← Back to agents
        </button>
      </div>
    );
  }

  const isEmpty = messages.length === 0 && !isThinking;

  return (
    <div className="flex flex-col h-full bg-slate-950">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-3 border-b border-slate-800 bg-slate-900 flex-shrink-0">
        <Link
          to="/dashboard/agents"
          className="text-slate-500 hover:text-slate-300 transition-colors text-lg leading-none"
          aria-label="Back to agents"
        >
          ←
        </Link>
        <div
          className="w-8 h-8 rounded-full flex-shrink-0 border-2 border-slate-700"
          style={{ backgroundColor: agent.avatarColor }}
        />
        <div className="min-w-0">
          <p className="text-white text-sm font-semibold truncate">{agent.name}</p>
          <p className="text-slate-500 text-xs font-mono">{modelLabel(agent.model)}</p>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4 min-h-0">
        {isEmpty && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3 pb-8">
            <div
              className="w-14 h-14 rounded-full border-2 border-slate-700"
              style={{ backgroundColor: agent.avatarColor }}
            />
            <div>
              <p className="text-white font-medium">{agent.name}</p>
              <p className="text-slate-500 text-sm mt-1">
                {agent.description ?? "Start a conversation"}
              </p>
            </div>
          </div>
        )}

        {messages.map(msg => (
          <MessageBubble
            key={msg.id}
            msg={msg}
            agentColor={agent.avatarColor}
            agentName={agent.name}
          />
        ))}

        {isThinking && (
          <ThinkingIndicator agentColor={agent.avatarColor} agentName={agent.name} />
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 border-t border-slate-800 bg-slate-900 px-4 py-3">
        <div className="flex items-end gap-2 bg-slate-800 rounded-2xl px-3 py-2 border border-slate-700 focus-within:border-indigo-500 transition-colors">
          {/* File attachment */}
          <button
            type="button"
            onClick={() => setShowAttachToast(true)}
            className="text-slate-500 hover:text-slate-300 transition-colors flex-shrink-0 mb-1 p-0.5"
            aria-label="Attach file"
            title="Attach file"
          >
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={`Message ${agent.name}…`}
            disabled={isStreaming}
            rows={1}
            className="flex-1 bg-transparent text-white text-sm placeholder-slate-500 resize-none focus:outline-none disabled:opacity-50 max-h-40 leading-relaxed py-0.5"
            style={{ height: "auto" }}
          />

          {/* Send / Stop */}
          {isStreaming ? (
            <button
              type="button"
              onClick={handleStop}
              className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-red-600 hover:bg-red-500 rounded-xl transition-colors mb-0.5"
              aria-label="Stop generation"
              title="Stop"
            >
              <svg width="10" height="10" fill="currentColor" viewBox="0 0 10 10">
                <rect width="10" height="10" rx="1" />
              </svg>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void sendMessage()}
              disabled={!input.trim()}
              className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed rounded-xl transition-colors mb-0.5"
              aria-label="Send message"
            >
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path d="M22 2L11 13M22 2L15 22 11 13 2 9l20-7z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </div>
        <p className="text-xs text-slate-600 text-center mt-2">
          Shift + Enter for new line · Enter to send
        </p>
      </div>

      {showAttachToast && (
        <AttachToast onClose={() => setShowAttachToast(false)} />
      )}
    </div>
  );
}
