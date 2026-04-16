import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

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

    // Production flow: server handles GET /api/auth/callback, sets cookie, redirects to
    // /dashboard — this frontend page is never reached in production.
    //
    // Dev flow: LoginPage "Continue to dashboard anyway" navigates here with an emailParam.
    // We trust it directly since there's no real backend token in dev mode.
    if (emailParam) {
      login({ email: emailParam, token });
      navigate("/dashboard", { replace: true });
      return;
    }

    setError("This magic link is invalid or has expired. Please request a new one.");
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
