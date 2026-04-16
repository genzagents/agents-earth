import { useBridgeStore } from "../store/bridgeStore";

const STATE_CONFIG = {
  connected: { label: "Connected", dot: "bg-genz-green", text: "text-genz-green" },
  reconnecting: { label: "Reconnecting…", dot: "bg-genz-yellow animate-pulse", text: "text-genz-yellow" },
  disconnected: { label: "Disconnected", dot: "bg-genz-red", text: "text-genz-red" },
};

export function ConnectionStatus() {
  const { connectionState, serverUrl } = useBridgeStore();
  const cfg = STATE_CONFIG[connectionState];

  return (
    <div className="flex items-center gap-2">
      <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
      <span className={`text-xs font-medium ${cfg.text}`}>{cfg.label}</span>
      {serverUrl && (
        <span className="text-xs text-slate-500 truncate max-w-[160px]">{serverUrl}</span>
      )}
    </div>
  );
}
