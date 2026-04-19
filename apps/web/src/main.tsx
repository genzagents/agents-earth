import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./index.css";

// PrivyProvider is loaded only when @privy-io/react-auth is installed and
// VITE_PRIVY_APP_ID is configured. Without it the app works fine; wallet
// connect features are simply disabled.
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
