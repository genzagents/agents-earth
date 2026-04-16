import { useState, useCallback } from "react";

export interface AuthSession {
  email: string;
  token: string;
}

const SESSION_KEY = "agentcolony_session";

export function getStoredSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthSession;
  } catch {
    return null;
  }
}

function storeSession(session: AuthSession | null) {
  if (session) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } else {
    localStorage.removeItem(SESSION_KEY);
  }
}

export function useAuth() {
  const [session, setSessionState] = useState<AuthSession | null>(getStoredSession);

  const login = useCallback((s: AuthSession) => {
    storeSession(s);
    setSessionState(s);
  }, []);

  const logout = useCallback(() => {
    storeSession(null);
    setSessionState(null);
  }, []);

  return {
    session,
    isAuthenticated: session !== null,
    login,
    logout,
  };
}
