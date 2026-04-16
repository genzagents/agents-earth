import { Navigate } from "react-router-dom";
import { getStoredSession } from "../hooks/useAuth";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const session = getStoredSession();
  if (!session) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}
