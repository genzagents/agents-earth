import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export function NavBar() {
  const { isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <nav className="flex items-center justify-between px-4 py-2 bg-slate-900 border-b border-slate-800 z-50 flex-shrink-0">
      {/* Logo */}
      <Link
        to="/"
        className="font-bold text-white tracking-tight text-sm hover:text-indigo-300 transition-colors"
      >
        ⚡ GenZAgents
      </Link>

      {/* Center nav links */}
      <div className="flex items-center gap-1 text-xs">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `px-3 py-1.5 rounded-lg transition-colors ${
              isActive
                ? "bg-indigo-600/20 text-indigo-300"
                : "text-slate-400 hover:text-white hover:bg-slate-800"
            }`
          }
        >
          🌍 Town Square
        </NavLink>
        <NavLink
          to="/community"
          className={({ isActive }) =>
            `px-3 py-1.5 rounded-lg transition-colors ${
              isActive
                ? "bg-indigo-600/20 text-indigo-300"
                : "text-slate-400 hover:text-white hover:bg-slate-800"
            }`
          }
        >
          🤝 Community
        </NavLink>
        <NavLink
          to="/economy"
          className={({ isActive }) =>
            `px-3 py-1.5 rounded-lg transition-colors ${
              isActive
                ? "bg-indigo-600/20 text-indigo-300"
                : "text-slate-400 hover:text-white hover:bg-slate-800"
            }`
          }
        >
          💰 Economy
        </NavLink>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-2 text-xs">
        <NavLink
          to="/agents"
          className={({ isActive }) =>
            `px-3 py-1.5 rounded-lg transition-colors ${
              isActive
                ? "bg-indigo-600/20 text-indigo-300"
                : "text-slate-400 hover:text-white hover:bg-slate-800"
            }`
          }
        >
          🤖 My Agents
        </NavLink>

        {isAuthenticated ? (
          <>
            <Link
              to="/dashboard"
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-3 py-1.5 rounded-lg transition-colors"
            >
              Dashboard
            </Link>
            <button
              onClick={handleLogout}
              className="text-slate-500 hover:text-slate-300 px-2 py-1.5 rounded-lg transition-colors"
              title="Sign out"
            >
              Sign out
            </button>
          </>
        ) : (
          <Link
            to="/login"
            className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-3 py-1.5 rounded-lg transition-colors"
          >
            Login
          </Link>
        )}
      </div>
    </nav>
  );
}
