import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { setSWUpdateReady } from "@/lib/swUpdate";
import "./index.css";
import App from "./App";
import { ErrorBoundary } from "@/components/ErrorBoundary";

if (import.meta.env.PROD) {
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      setSWUpdateReady(() => updateSW(true));
    },
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* The last resort, outside every provider and the app chrome: whatever
        the screen-level boundary cannot catch (a crash in the nav bar, the
        weight-unit provider, or App's own render) lands here instead of on a
        blank page. */}
    <ErrorBoundary root>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
