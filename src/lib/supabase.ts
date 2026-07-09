import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

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
