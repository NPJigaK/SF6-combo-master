import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "@sf6cm/practice-app";

import { getDesktopSupportIssues } from "./platform/desktopSupportGuard";
import { createTauriInputBridge } from "./platform/tauriInputBridge";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Missing #root mount element for the desktop shell.");
}

createRoot(rootElement).render(
  <StrictMode>
    <App inputAdapter={createTauriInputBridge()} supportIssues={getDesktopSupportIssues()} />
  </StrictMode>,
);
