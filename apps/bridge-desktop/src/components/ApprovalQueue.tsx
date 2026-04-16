import { invoke } from "@tauri-apps/api/core";
import { useBridgeStore } from "../store/bridgeStore";

export function ApprovalQueue() {
  const { approvals, removeApproval } = useBridgeStore();

  if (approvals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-40 text-slate-500 text-sm gap-2">
        <span className="text-2xl">✅</span>
        No pending approvals
      </div>
    );
  }

  async function resolve(approvalId: string, status: "approved" | "denied") {
    try {
      await invoke("resolve_approval", { approvalId, status });
      removeApproval(approvalId);
    } catch (err) {
      console.warn("Failed to resolve approval", err);
    }
  }

  return (
    <div className="space-y-2">
      {approvals.map((a) => (
        <div
          key={a.id}
          className="rounded-lg border border-genz-yellow/40 bg-genz-yellow/5 p-3 space-y-2"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-genz-yellow uppercase tracking-wide">
                Approval required
              </p>
              <p className="text-sm text-slate-200 font-mono mt-0.5 truncate selectable">
                {a.command}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                Agent: <span className="text-slate-300">{a.agentId}</span> &middot;{" "}
                <span className="capitalize">{a.capability}</span>
              </p>
              <p className="text-xs text-slate-500 mt-1 selectable">{a.reason}</p>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => resolve(a.id, "approved")}
              className="flex-1 text-xs font-medium py-1 rounded bg-genz-green/20 text-genz-green border border-genz-green/30 hover:bg-genz-green/30 transition-colors"
            >
              Approve
            </button>
            <button
              onClick={() => resolve(a.id, "denied")}
              className="flex-1 text-xs font-medium py-1 rounded bg-genz-red/20 text-genz-red border border-genz-red/30 hover:bg-genz-red/30 transition-colors"
            >
              Deny
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
