import { useBridgeStore } from "../store/bridgeStore";
import type { AuditEntry } from "../types";

const OUTCOME_STYLE: Record<AuditEntry["outcome"], string> = {
  allowed: "text-genz-green",
  blocked: "text-genz-red",
  pending_approval: "text-genz-yellow",
};

const OUTCOME_LABEL: Record<AuditEntry["outcome"], string> = {
  allowed: "✓",
  blocked: "✗",
  pending_approval: "…",
};

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return iso;
  }
}

export function AuditLog() {
  const auditLog = useBridgeStore((s) => s.auditLog);

  if (auditLog.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-40 text-slate-500 text-sm gap-2">
        <span className="text-2xl">📋</span>
        No commands logged yet
      </div>
    );
  }

  return (
    <div className="space-y-px selectable">
      {auditLog.map((entry) => (
        <div
          key={entry.id}
          className="flex items-start gap-2 py-1.5 border-b border-slate-800 last:border-0 text-xs"
        >
          <span className={`font-bold w-4 shrink-0 ${OUTCOME_STYLE[entry.outcome]}`}>
            {OUTCOME_LABEL[entry.outcome]}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-mono text-slate-200 truncate">{entry.command}</p>
            {entry.error && (
              <p className="text-slate-500 truncate">{entry.error}</p>
            )}
          </div>
          <div className="shrink-0 text-right text-slate-500 space-y-0.5">
            <p className="capitalize">{entry.capability}</p>
            <p>{formatTime(entry.createdAt)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
