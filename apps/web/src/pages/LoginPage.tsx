import { useState, FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { getStoredSession } from "../hooks/useAuth";

type Stage = "input" | "sent";

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? "";

async function sendMagicLink(email: string): Promise<void> {
  const res = await fetch(`${SERVER_URL}/api/auth/magic-link`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!res.ok && res.status !== 404) {
    throw new Error("Failed to send magic link");
  }
  // 404 means auth endpoints not yet live — we still show the confirmation UI
}

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [stage, setStage] = useState<Stage>("input");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If already authenticated, skip to dashboard
  if (getStoredSession()) {
    return <Navigate to="/dashboard" replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await sendMagicLink(email.trim());
      setStage("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  // Dev shortcut: simulate callback when backend auth isn't live yet
  function handleDevContinue() {
    const token = btoa(`dev:${email}:${Date.now()}`);
    navigate(`/auth/callback?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`);
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo / branding */}
        <div className="text-center mb-8">
          <div className="text-4xl mb-3">🤖</div>
          <h1 className="text-2xl font-bold text-white">AgentColony</h1>
          <p className="text-slate-400 text-sm mt-1">genzagents.io</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          {stage === "input" ? (
            <>
              <h2 className="text-white font-semibold text-lg mb-1">Sign in</h2>
              <p className="text-slate-400 text-sm mb-5">
                Enter your email and we'll send you a magic link.
              </p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="email" className="block text-xs text-slate-400 mb-1">
                    Email address
                  </label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                  />
                </div>

                {error && (
                  <p className="text-red-400 text-xs">{error}</p>
                )}

                <button
                  type="submit"
                  disabled={loading || !email.trim()}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
                >
                  {loading ? "Sending…" : "Send magic link"}
                </button>
              </form>
            </>
          ) : (
            <>
              <div className="text-center">
                <div className="text-3xl mb-3">📬</div>
                <h2 className="text-white font-semibold text-lg mb-2">Check your inbox</h2>
                <p className="text-slate-400 text-sm mb-1">
                  We sent a magic link to
                </p>
                <p className="text-indigo-400 text-sm font-medium mb-4">{email}</p>
                <p className="text-slate-500 text-xs mb-6">
                  Click the link in the email to sign in. It expires in 15 minutes.
                </p>

                {/* Dev-mode bypass — visible when backend auth is not yet live */}
                {import.meta.env.DEV && (
                  <div className="border border-dashed border-slate-700 rounded-lg p-3 mb-4">
                    <p className="text-xs text-slate-500 mb-2">🛠 Dev mode — backend auth not yet live</p>
                    <button
                      onClick={handleDevContinue}
                      className="text-xs text-indigo-400 hover:text-indigo-300 underline"
                    >
                      Continue to dashboard anyway →
                    </button>
                  </div>
                )}

                <button
                  onClick={() => { setStage("input"); setError(null); }}
                  className="text-xs text-slate-500 hover:text-slate-400 transition-colors"
                >
                  Use a different email
                </button>
              </div>
            </>
          )}
        </div>

        <p className="text-center text-xs text-slate-600 mt-6">
          By signing in you agree to the{" "}
          <span className="text-slate-500">Terms of Service</span>.
        </p>
      </div>
    </div>
  );
}
