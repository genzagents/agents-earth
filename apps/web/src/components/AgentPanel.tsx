import { useEffect, useRef, useState, useCallback } from "react";
import { useWorldStore, getSelectedAgent } from "../store/worldStore";
import { RelationshipGraph } from "./RelationshipGraph";
import type { Memory, ProvenanceEntry } from "@agentcolony/shared";

type ChatMessage = {
  role: "user" | "agent";
  text: string;
  attachments?: AttachmentMeta[];
};

interface AttachmentMeta {
  name: string;
  url: string;
  type: string;
}

const NEED_COLORS: Record<string, string> = {
  social: "bg-blue-500",
  creative: "bg-purple-500",
  intellectual: "bg-cyan-500",
  physical: "bg-green-500",
  spiritual: "bg-amber-500",
  autonomy: "bg-rose-500",
};

const MOOD_BADGES: Record<string, string> = {
  thriving: "bg-green-900 text-green-300",
  content: "bg-blue-900 text-blue-300",
  struggling: "bg-amber-900 text-amber-300",
  critical: "bg-red-900 text-red-300",
};

const ACTIVITY_ICONS: Record<string, string> = {
  socializing: "💬", reading: "📖", writing: "✍️", meditating: "🧘",
  working: "💼", exploring: "🚶", resting: "😴", creating: "🎨", conversing: "🗣",
};

const PROVENANCE_ICONS: Record<string, string> = {
  wallet_provisioned: "💳",
  did_created: "🔑",
  did_anchored: "⛓",
  agent_created: "✨",
  agent_retired: "🕊",
};

const BASE_EXPLORER = "https://basescan.org";

export function AgentPanel() {
  const store = useWorldStore();
  const agent = getSelectedAgent(store);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [provenance, setProvenance] = useState<ProvenanceEntry[]>([]);
  const [provenanceLoading, setProvenanceLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"info" | "memories" | "graph" | "talk" | "provenance">("info");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!agent) { setMemories([]); return; }
    fetch(`/api/agents/${agent.id}/memories`)
      .then(r => r.json())
      .then(setMemories)
      .catch(() => setMemories([]));
  }, [agent?.id]);

  useEffect(() => {
    if (!agent || activeTab !== "provenance") return;
    setProvenanceLoading(true);
    fetch(`/api/agents/${agent.id}/provenance`)
      .then(r => r.ok ? r.json() as Promise<ProvenanceEntry[]> : [])
      .then(data => setProvenance(data))
      .catch(() => setProvenance([]))
      .finally(() => setProvenanceLoading(false));
  }, [agent?.id, activeTab]);

  useEffect(() => {
    setMessages([]);
    setInputText("");
    setPendingFiles([]);
  }, [agent?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function copyWalletAddress() {
    if (!agent?.walletAddress) return;
    await navigator.clipboard.writeText(agent.walletAddress);
    setCopiedAddress(true);
    setTimeout(() => setCopiedAddress(false), 1500);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    setPendingFiles(prev => [...prev, ...files].slice(0, 5));
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeFile(index: number) {
    setPendingFiles(prev => prev.filter((_, i) => i !== index));
  }

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => setIsDragging(false), []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    setPendingFiles(prev => [...prev, ...files].slice(0, 5));
  }, []);

  async function uploadFiles(agentId: string, files: File[]): Promise<AttachmentMeta[]> {
    const results: AttachmentMeta[] = [];
    for (const file of files) {
      const form = new FormData();
      form.append("file", file);
      try {
        const res = await fetch(`/api/agents/${agentId}/attachments`, {
          method: "POST",
          body: form,
        });
        if (res.ok) {
          const data = await res.json() as { url: string; filename: string; contentType: string };
          results.push({ name: data.filename, url: data.url, type: data.contentType });
        } else {
          results.push({ name: file.name, url: URL.createObjectURL(file), type: file.type });
        }
      } catch {
        results.push({ name: file.name, url: URL.createObjectURL(file), type: file.type });
      }
    }
    return results;
  }

  async function sendMessage() {
    if ((!inputText.trim() && pendingFiles.length === 0) || !agent || isSending) return;
    const text = inputText.trim();
    const files = [...pendingFiles];
    setInputText("");
    setPendingFiles([]);
    setIsSending(true);

    let attachments: AttachmentMeta[] = [];
    if (files.length > 0) {
      attachments = await uploadFiles(agent.id, files);
    }

    setMessages(prev => [...prev, { role: "user", text, attachments }]);

    if (!text) {
      setMessages(prev => [...prev, { role: "agent", text: "(Attachments received — I'll review them.)" }]);
      setIsSending(false);
      return;
    }

    try {
      const res = await fetch(`/api/agents/${agent.id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      if (!res.ok) throw new Error("API error");
      const data = await res.json() as { response: string; agentName: string };
      setMessages(prev => [...prev, { role: "agent", text: data.response }]);
    } catch {
      setMessages(prev => [...prev, { role: "agent", text: "(LLM not ready yet)" }]);
    } finally {
      setIsSending(false);
    }
  }

  if (!agent) {
    return (
      <div className="p-4 text-gray-500 text-sm italic">
        Click an agent on the map to inspect them.
      </div>
    );
  }

  const tabs = ["info", "memories", "graph", "talk", "provenance"] as const;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full flex-shrink-0" style={{ backgroundColor: agent.avatar }} />
          <div className="min-w-0">
            <div className="font-semibold text-white text-sm truncate">{agent.name}</div>
            <div className="flex items-center gap-1 mt-0.5">
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${MOOD_BADGES[agent.state.mood] ?? ""}`}>
                {agent.state.mood}
              </span>
              <span className="text-xs text-gray-500">
                {ACTIVITY_ICONS[agent.state.currentActivity] ?? "·"} {agent.state.currentActivity}
              </span>
              {agent.reputationScore !== undefined && (
                <span className="text-xs text-amber-400 font-mono ml-1">★ {agent.reputationScore}</span>
              )}
            </div>
          </div>
        </div>
        <p className="text-xs text-gray-400 italic mt-2 leading-relaxed">"{agent.state.statusMessage}"</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-shrink-0 flex-1 text-xs py-1.5 capitalize transition-colors min-w-0 ${
              activeTab === tab ? "text-white border-b border-indigo-500" : "text-gray-500 hover:text-gray-300"
            }`}
          >
            {tab === "graph" ? "Network" : tab === "provenance" ? "Chain" : tab}
            {tab === "memories" && memories.length > 0 ? ` (${memories.length})` : ""}
          </button>
        ))}
      </div>

      {/* Chat tab */}
      {activeTab === "talk" && (
        <div
          className={`flex flex-col flex-1 min-h-0 ${isDragging ? "ring-2 ring-inset ring-indigo-500" : ""}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {messages.length === 0 && (
              <p className="text-xs text-gray-600 italic text-center mt-4">
                Say something to {agent.name}…
              </p>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`flex flex-col gap-0.5 ${msg.role === "user" ? "items-end" : "items-start"}`}>
                {msg.role === "agent" && (
                  <div className="flex items-center gap-1.5 ml-1">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: agent.avatar }} />
                    <span className="text-xs text-gray-500">{agent.name}</span>
                  </div>
                )}
                {msg.attachments && msg.attachments.length > 0 && (
                  <div className="flex flex-wrap gap-1 max-w-[85%]">
                    {msg.attachments.map((att, ai) => (
                      <a
                        key={ai}
                        href={att.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 text-xs bg-slate-700 text-slate-300 px-2 py-1 rounded hover:bg-slate-600 transition-colors"
                      >
                        <span>📎</span>
                        <span className="truncate max-w-[100px]">{att.name}</span>
                      </a>
                    ))}
                  </div>
                )}
                {msg.text && (
                  <div className={`max-w-[85%] rounded-lg px-2.5 py-1.5 text-xs leading-relaxed ${
                    msg.role === "user"
                      ? "bg-indigo-600 text-white"
                      : "bg-slate-800 text-gray-200"
                  }`}>
                    {msg.text}
                  </div>
                )}
              </div>
            ))}
            {isSending && (
              <div className="flex items-center gap-1.5 ml-1">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: agent.avatar }} />
                <div className="bg-slate-800 rounded-lg px-2.5 py-1.5">
                  <span className="text-xs text-gray-500 animate-pulse">…</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Pending file chips */}
          {pendingFiles.length > 0 && (
            <div className="px-2 py-1 flex flex-wrap gap-1 border-t border-slate-800">
              {pendingFiles.map((f, i) => (
                <span key={i} className="flex items-center gap-1 text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full">
                  <span className="truncate max-w-[80px]">{f.name}</span>
                  <button onClick={() => removeFile(i)} className="text-gray-500 hover:text-red-400 ml-0.5">×</button>
                </span>
              ))}
            </div>
          )}

          {/* Input bar */}
          <div className="p-2 border-t border-slate-800 flex gap-2 items-end">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.pdf,.txt,.md,.json"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-gray-500 hover:text-gray-300 transition-colors text-lg leading-none pb-1"
              title="Attach files (or drag & drop)"
            >
              📎
            </button>
            <input
              type="text"
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendMessage(); } }}
              placeholder="Type a message…"
              disabled={isSending}
              className="flex-1 bg-slate-800 text-white text-xs rounded px-2.5 py-1.5 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
            />
            <button
              onClick={() => void sendMessage()}
              disabled={(!inputText.trim() && pendingFiles.length === 0) || isSending}
              className="text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded transition-colors"
            >
              Send
            </button>
          </div>
        </div>
      )}

      {/* All other tabs */}
      <div className={`flex-1 overflow-y-auto p-3 space-y-3 ${activeTab === "talk" ? "hidden" : ""}`}>

        {/* INFO tab */}
        {activeTab === "info" && (
          <>
            <div>
              <div className="text-xs text-gray-500 mb-1 uppercase tracking-wider">Bio</div>
              <p className="text-xs text-gray-300 leading-relaxed">{agent.bio}</p>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1 uppercase tracking-wider">Traits</div>
              <div className="flex flex-wrap gap-1">
                {agent.traits.map(t => (
                  <span key={t} className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full">{t}</span>
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-2 uppercase tracking-wider">Needs</div>
              <div className="space-y-1.5">
                {Object.entries(agent.needs).map(([need, value]) => (
                  <div key={need} className="flex items-center gap-2">
                    <div className="text-xs text-gray-400 w-20 capitalize">{need}</div>
                    <div className="flex-1 bg-slate-700 rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full transition-all duration-500 ${NEED_COLORS[need] ?? "bg-slate-400"}`}
                        style={{ width: `${value}%` }}
                      />
                    </div>
                    <div className={`text-xs w-6 text-right font-mono ${value < 20 ? "text-red-400" : value > 70 ? "text-green-400" : "text-gray-500"}`}>
                      {Math.round(value)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Web3 Identity section */}
            {(agent.walletAddress || agent.did) && (
              <div>
                <div className="text-xs text-gray-500 mb-2 uppercase tracking-wider">Web3 Identity</div>
                <div className="bg-slate-800 rounded-lg p-2.5 space-y-2">
                  {agent.walletAddress && (
                    <div>
                      <div className="text-xs text-gray-600 mb-0.5">EVM Wallet</div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-mono text-gray-300 truncate">
                          {agent.walletAddress.slice(0, 10)}…{agent.walletAddress.slice(-8)}
                        </span>
                        <button
                          onClick={() => void copyWalletAddress()}
                          className="text-gray-500 hover:text-gray-300 transition-colors flex-shrink-0"
                          title="Copy address"
                        >
                          {copiedAddress ? "✓" : "⎘"}
                        </button>
                        <a
                          href={`${BASE_EXPLORER}/address/${agent.walletAddress}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-gray-500 hover:text-indigo-400 transition-colors flex-shrink-0 text-xs"
                          title="View on BaseScan"
                        >
                          ↗
                        </a>
                      </div>
                    </div>
                  )}
                  {agent.did && (
                    <div>
                      <div className="text-xs text-gray-600 mb-0.5">DID</div>
                      <span className="text-xs font-mono text-gray-400 break-all">{agent.did}</span>
                    </div>
                  )}
                  {agent.didAnchorTx && (
                    <div>
                      <div className="text-xs text-gray-600 mb-0.5">Anchor Tx</div>
                      <a
                        href={`${BASE_EXPLORER}/tx/${agent.didAnchorTx}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-mono text-indigo-400 hover:text-indigo-300 transition-colors"
                      >
                        {agent.didAnchorTx.slice(0, 10)}…{agent.didAnchorTx.slice(-8)} ↗
                      </a>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* NETWORK tab */}
        {activeTab === "graph" && (
          <RelationshipGraph agent={agent} />
        )}

        {/* MEMORIES tab */}
        {activeTab === "memories" && (
          <div className="space-y-2">
            {memories.length === 0
              ? <p className="text-xs text-gray-600 italic">No memories yet.</p>
              : memories.slice(0, 20).map(mem => (
                <div key={mem.id} className="bg-slate-800 rounded p-2 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      mem.kind === "social" ? "bg-blue-900 text-blue-300" :
                      mem.kind === "creation" ? "bg-purple-900 text-purple-300" :
                      "bg-slate-700 text-slate-300"
                    }`}>{mem.kind}</span>
                    <span className={`text-xs font-mono ${mem.emotionalWeight > 0.2 ? "text-green-400" : mem.emotionalWeight < -0.2 ? "text-red-400" : "text-gray-500"}`}>
                      {mem.emotionalWeight > 0 ? "+" : ""}{mem.emotionalWeight.toFixed(2)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-300 leading-relaxed">{mem.description}</p>
                  {mem.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {mem.tags.map(t => <span key={t} className="text-xs text-gray-600">#{t}</span>)}
                    </div>
                  )}
                </div>
              ))
            }
          </div>
        )}

        {/* PROVENANCE (Chain) tab */}
        {activeTab === "provenance" && (
          <div className="space-y-2">
            <p className="text-xs text-gray-500">
              On-chain identity events for {agent.name}.
            </p>
            {provenanceLoading && (
              <p className="text-xs text-gray-600 italic animate-pulse">Loading provenance…</p>
            )}
            {!provenanceLoading && provenance.length === 0 && (
              <div className="bg-slate-800 rounded p-3 text-center">
                <p className="text-xs text-gray-600 italic">No provenance events yet.</p>
                <p className="text-xs text-gray-700 mt-1">
                  Provision a wallet to start the on-chain identity trail.
                </p>
              </div>
            )}
            {provenance.map(entry => (
              <div key={entry.id} className="bg-slate-800 rounded p-2.5 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-base">{PROVENANCE_ICONS[entry.kind] ?? "•"}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-gray-200">{entry.description}</div>
                    <div className="text-xs text-gray-600 mt-0.5">
                      {new Date(entry.timestamp).toLocaleString()}
                    </div>
                  </div>
                </div>
                {entry.txHash && (
                  <a
                    href={`${BASE_EXPLORER}/tx/${entry.txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-mono text-indigo-400 hover:text-indigo-300 transition-colors block"
                  >
                    {entry.txHash.slice(0, 12)}…{entry.txHash.slice(-8)} ↗
                  </a>
                )}
                {entry.address && !entry.txHash && (
                  <a
                    href={`${BASE_EXPLORER}/address/${entry.address}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-mono text-indigo-400 hover:text-indigo-300 transition-colors block"
                  >
                    {entry.address.slice(0, 10)}…{entry.address.slice(-8)} ↗
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
