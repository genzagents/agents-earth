import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { getStoredSession } from "../hooks/useAuth";

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? "";

type AuthState = "checking" | "authenticated" | "unauthenticated";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  // Optimistically trust localStorage for dev flow; still verify with server
  const [authState, setAuthState] = useState<AuthState>(
    getStoredSession() ? "authenticated" : "checking"
  );

  useEffect(() => {
    if (authState === "authenticated") return; // dev localStorage session present

    fetch(`${SERVER_URL}/api/auth/session`, { credentials: "include" })
      .then((res) => {
        setAuthState(res.ok ? "authenticated" : "unauthenticated");
      })
      .catch(() => setAuthState("unauthenticated"));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (authState === "checking") {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (authState === "unauthenticated") {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
