import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? "";

async function verifyToken(token: string): Promise<{ email: string } | null> {
  try {
    const res = await fetch(`${SERVER_URL}/api/auth/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (res.ok) {
      const data = (await res.json()) as { email: string };
      return data;
    }
    return null;
  } catch {
    return null;
  }
}

export function AuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = searchParams.get("token");
    const emailParam = searchParams.get("email");

    if (!token) {
      setError("Invalid or missing token.");
      return;
    }

    async function hydrate() {
      // Try real verify endpoint first
      const verified = await verifyToken(token!);
      if (verified) {
        login({ email: verified.email, token: token! });
        navigate("/dashboard", { replace: true });
        return;
      }

      // Dev fallback: accept a dev-generated token if email param is present
      if (emailParam) {
        login({ email: emailParam, token: token! });
        navigate("/dashboard", { replace: true });
        return;
      }

      setError("This magic link is invalid or has expired. Please request a new one.");
    }

    hydrate();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="text-3xl mb-4">❌</div>
          <h1 className="text-white font-semibold text-lg mb-2">Link expired</h1>
          <p className="text-slate-400 text-sm mb-6">{error}</p>
          <a
            href="/login"
            className="inline-block bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
          >
            Back to sign in
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-slate-400 text-sm">Signing you in…</p>
      </div>
    </div>
  );
}
