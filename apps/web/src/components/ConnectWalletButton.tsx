/**
 * ConnectWalletButton — sign up / connect a Privy wallet.
 *
 * Works when VITE_PRIVY_APP_ID is set (app is wrapped with PrivyProvider).
 * Renders nothing when Privy is not configured.
 */

import { useState, useEffect } from "react";
import { usePrivy as privyHook } from "@privy-io/react-auth";

const PRIVY_CONFIGURED = !!import.meta.env.VITE_PRIVY_APP_ID;

function ConnectWalletInner() {
  const { ready, authenticated, login, logout, user } = privyHook();

  const [copying, setCopying] = useState(false);

  async function copyAddress() {
    const addr = user?.wallet?.address;
    if (!addr) return;
    await navigator.clipboard.writeText(addr);
    setCopying(true);
    setTimeout(() => setCopying(false), 1500);
  }

  if (!ready) return null;

  if (!authenticated) {
    return (
      <button
        onClick={login}
        className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1 rounded transition-colors font-medium"
      >
        Connect Wallet
      </button>
    );
  }

  const address = user?.wallet?.address;
  const short = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "Connected";

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-green-400 font-mono">{short}</span>
      {address && (
        <button
          onClick={() => void copyAddress()}
          className="text-gray-500 hover:text-gray-300 transition-colors"
          title="Copy address"
        >
          {copying ? "✓" : "⎘"}
        </button>
      )}
      <button
        onClick={logout}
        className="text-xs text-gray-500 hover:text-red-400 transition-colors ml-1"
        title="Disconnect"
      >
        ×
      </button>
    </div>
  );
}

export function ConnectWalletButton() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  if (!PRIVY_CONFIGURED || !mounted) return null;
  return <ConnectWalletInner />;
}
