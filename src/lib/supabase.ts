import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!supabaseUrl || !supabaseAnonKey) {
  // createClient throws synchronously on an empty/undefined URL, and this
  // module is imported at the top of main.tsx before React ever renders —
  // so a missing .env doesn't fail gracefully, it white-screens the entire
  // app with nothing in the DOM and only a console error to explain why.
  // A placeholder client instead lets the app boot; every real Supabase
  // call on it just fails at request time (network error) instead of
  // crashing at import time. See .env.example.
  console.warn(
    "VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set — auth and cloud sync are disabled. See .env.example."
  );
}

export const supabase = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseAnonKey || "placeholder-anon-key"
);

// iOS suspends a backgrounded PWA's JS timers, including the one that
// drives Supabase's scheduled token refresh. If that timer's refresh
// request is in flight right as iOS freezes the process, it can come back
// stale or fail outright — and since nothing else re-triggers a refresh,
// the SDK gives up and clears the session, surfacing as a random sign-out
// well before the token should've actually expired. Explicitly stopping
// the timer while hidden and forcing a fresh refresh the moment the app
// regains focus (Supabase's own recommended pattern for mobile/suspended
// apps) avoids relying on a timer that may have been frozen mid-request.
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
