import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./index.css";

const root = document.getElementById("root")!;

// Mounted outside App (#129) so it survives a render error in App itself, which
// is the exact failure that blanked the panel in #128.
createRoot(root).render(
  <ErrorBoundary surface="Sidebar">
    <App />
  </ErrorBoundary>,
);
