import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "@sf6cm/practice-app";

import { createBrowserGamepadAdapter } from "./platform/browserGamepadAdapter";
import { getBrowserSupportIssues } from "./platform/browserSupportGuard";
import { registerServiceWorker } from "./registerServiceWorker";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Missing #root mount element for the web shell.");
}

registerServiceWorker();

createRoot(rootElement).render(
  <StrictMode>
    <App inputAdapter={createBrowserGamepadAdapter()} supportIssues={getBrowserSupportIssues()} />
  </StrictMode>,
);
