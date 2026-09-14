import { useState, useEffect, useRef } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { NavBar, type Screen } from "@/components/NavBar";
import { PlanScreen } from "@/screens/PlanScreen";
import { TemplateDetail } from "@/screens/TemplateDetail";
import { ActiveWorkout } from "@/screens/ActiveWorkout";
import { HistoryScreen } from "@/screens/HistoryScreen";
import { AuthScreen } from "@/screens/AuthScreen";
import { ProfileScreen } from "@/screens/ProfileScreen";
import { ExerciseHistoryScreen } from "@/screens/ExerciseHistoryScreen";
import { WorkoutHomeScreen } from "@/screens/WorkoutHomeScreen";
import { WeightUnitProvider } from "@/lib/weightUnit";
import {
  getActiveWorkoutDraft,
  applyProgramSeed,
  clearLocalData,
  requestPersistentStorage,
} from "@/lib/db";
import { syncNow } from "@/lib/sync";
import { UpdateBanner } from "@/components/UpdateBanner";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { SyncStatusBar } from "@/components/SyncStatusBar";

const SYNC_INTERVAL_MS = 5 * 60 * 1000;

// IndexedDB is per-origin, so one local database is shared by every account
// that signs in on this device. This records who used it last, so a different
// user signing in can start from an empty store instead of inheriting — and
// then uploading — the previous account's data.
const LAST_USER_KEY = "peak-last-user";

// Opt-in local preview: with no real Supabase project configured, set
// VITE_LOCAL_PREVIEW=1 in .env to skip AuthScreen and use the app directly.
// Templates, exercises, workouts, and history all live in IndexedDB via
// lib/db.ts — only auth and cross-device sync need a real backend — so this
// is enough to run and click through the whole app locally. Gated on DEV so
// it can never affect a production build regardless of env misconfiguration.
const LOCAL_PREVIEW = import.meta.env.DEV && import.meta.env.VITE_LOCAL_PREVIEW === "1";

type AppScreen =
  | "plan"
  | "template"
  | "workout"
  | "workout-home"
  | "history"
  | "profile"
  | "exercise-history";

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [screen, setScreen] = useState<AppScreen>("plan");
  const [nav, setNav] = useState<Screen>("workout");
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
  const [viewingExerciseName, setViewingExerciseName] = useState<string | null>(null);
  const [viewingTemplateName, setViewingTemplateName] = useState<string | null>(null);
  // Drives NavBar's "workout in progress" indicator — otherwise nothing
  // signals a session is running once you leave the Workout tab.
  const [hasActiveDraft, setHasActiveDraft] = useState(false);
  // Bumped when the database is replaced underneath the UI (an account switch
  // wiped it, or seeding populated it after a screen already read it empty).
  // Used as a key so the current screen remounts and re-reads.
  const [dataVersion, setDataVersion] = useState(0);
  const resolvedUserId = useRef<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      if (!s) resolvedUserId.current = null;
      setSession(s);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session && !LOCAL_PREVIEW) return;
    // Supabase fires onAuthStateChange (with a new session object) on every
    // background token refresh, not just real sign-ins — without this guard,
    // that would re-run the initial-landing-screen logic and yank the user
    // away from whatever they're doing (e.g. mid-workout) every ~time the
    // token refreshes. Only resolve the landing screen once per actual user
    // (or once for the local-preview "user", which has no real session).
    const userKey = session?.user.id ?? "local-preview";
    if (resolvedUserId.current === userKey) return;
    resolvedUserId.current = userKey;

    let cancelled = false;

    (async () => {
      // 1. Wipe first, before anything reads the database. Whatever is in
      //    there belongs to whoever signed in last; if that was someone else,
      //    reading it would show their templates and history, and syncing it
      //    would upload their data into this account.
      let previousUser: string | null = null;
      try {
        previousUser = window.localStorage.getItem(LAST_USER_KEY);
      } catch {
        previousUser = null;
      }
      if (previousUser && previousUser !== userKey) {
        await clearLocalData();
        setDataVersion((v) => v + 1);
      }
      try {
        window.localStorage.setItem(LAST_USER_KEY, userKey);
      } catch {
        // Private browsing with storage blocked — the wipe above still ran;
        // only the "who was here last" record is lost.
      }
      if (cancelled) return;

      // Ask once a real account is on this device: IndexedDB is evictable by
      // default, and what is in it is the user's training history — including
      // anything logged offline that has not reached the account yet.
      void requestPersistentStorage();

      // 2. Resolve the landing screen from local data, which is fast and
      //    works offline. Sync and seeding continue underneath.
      const draft = await getActiveWorkoutDraft().catch(() => undefined);
      if (cancelled) return;
      setHasActiveDraft(!!draft);
      if (draft) {
        setActiveTemplateId(draft.templateId);
        setScreen("workout");
        setNav("workout");
      } else {
        setScreen("workout-home");
        setNav("workout");
      }

      // 3. Sync before seeding, never the other way round. The seeded program
      //    uses fixed ids, so seeding an empty database and pushing it would
      //    overwrite this account's customized rows of the same ids on every
      //    device. Pulling first means an already-customized copy is present
      //    locally and applyProgramSeed() leaves it alone. A signed-in device
      //    that cannot reach the server therefore stays unseeded until a sync
      //    succeeds — the periodic pass below picks it up.
      if (session) {
        if (!navigator.onLine) return;
        const result = await syncNow().catch(() => ({ ok: false }) as const);
        if (cancelled || !result.ok) return;
      }
      const seeded = await applyProgramSeed().catch(() => false);
      if (seeded && !cancelled) setDataVersion((v) => v + 1);
    })();

    return () => {
      cancelled = true;
    };
  }, [session]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;

    const pass = async () => {
      if (cancelled || !navigator.onLine) return;
      const result = await syncNow().catch(() => ({ ok: false }) as const);
      // Covers the device that was offline at startup: seeding is gated on a
      // successful sync, so the first one that lands is where it happens.
      if (result.ok && !cancelled && (await applyProgramSeed().catch(() => false))) {
        setDataVersion((v) => v + 1);
      }
    };

    // A five-minute timer alone misses the two moments that actually decide
    // whether a workout logged in a basement gym ever reaches the account:
    // the phone regaining signal, and the app being put away. Waiting up to
    // five minutes for the first means a walk out of the gym and a closed tab
    // can land inside the same window. syncNow() already coalesces overlapping
    // passes, so these can fire as often as the browser likes.
    const iv = setInterval(pass, SYNC_INTERVAL_MS);
    const onOnline = () => void pass();
    const onVisibility = () => void pass();
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      clearInterval(iv);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [session]);

  if (session === undefined) return <UpdateBanner />;
  if (session === null && !LOCAL_PREVIEW) return (
    <>
      <UpdateBanner />
      <AuthScreen />
    </>
  );

  const handleNav = async (tab: Screen) => {
    setNav(tab);
    if (tab === "history") {
      setScreen("history");
    } else if (tab === "plan") {
      setScreen("plan");
    } else if (tab === "profile") {
      setScreen("profile");
    } else {
      const draft = await getActiveWorkoutDraft().catch(() => undefined);
      setHasActiveDraft(!!draft);
      if (draft) {
        setActiveTemplateId(draft.templateId);
        setScreen("workout");
        return;
      }
      setScreen("workout-home");
    }
  };

  return (
    <WeightUnitProvider>
    <UpdateBanner />
    <div
      className="bg-background min-h-screen relative"
      style={{ maxWidth: 430, margin: "0 auto" }}
    >
      <div className="scroll-area" key={dataVersion}>
        {/* LOCAL_PREVIEW stands in for a signed-in user everywhere else in
            this file; excluding it here would leave the one state that is
            awkward to reach in production unreachable in the preview too. */}
        <SyncStatusBar signedIn={!!session || LOCAL_PREVIEW} />
        {/* Keyed by the current screen so navigating to another tab clears a
            caught error, and inside the chrome so the nav bar below survives
            it — a crash on one screen must not strand you there. */}
        {/* The app's one main landmark. Without it, a screen-reader user has
            no way to skip the chrome and jump to the screen's content, and
            everything outside a landmark is announced as loose page text. */}
        <main>
        <ErrorBoundary resetKey={screen} title="This screen hit a problem">
          {screen === "plan" && (
            <PlanScreen
              onSelectTemplate={(id) => {
                setActiveTemplateId(id);
                setScreen("template");
              }}
              onCreateTemplate={(id) => {
                setActiveTemplateId(id);
                setScreen("template");
              }}
              onStartTemplate={(id) => {
                setActiveTemplateId(id);
                setScreen("workout");
                setNav("workout");
              }}
            />
          )}
          {screen === "template" && activeTemplateId && (
            <TemplateDetail
              templateId={activeTemplateId}
              onStart={() => {
                setHasActiveDraft(true);
                setScreen("workout");
                setNav("workout");
              }}
              onBack={() => handleNav("plan")}
              onViewExerciseHistory={(name, templateName) => {
                setViewingExerciseName(name);
                setViewingTemplateName(templateName);
                setScreen("exercise-history");
              }}
            />
          )}
          {screen === "workout" && activeTemplateId && (
            <ActiveWorkout
              templateId={activeTemplateId}
              onBack={() => {
                // Re-check rather than assume: a real draft is only persisted
                // once a set is logged (see ActiveWorkout's handleLog), so
                // backing out beforehand must clear the indicator instead of
                // leaving it lit for a draft that was never actually saved.
                getActiveWorkoutDraft().then((draft) => setHasActiveDraft(!!draft));
                setScreen("template");
                setNav("plan");
              }}
              onFinish={() => {
                setHasActiveDraft(false);
                setScreen("history");
                setNav("history");
              }}
              onDiscard={() => {
                setHasActiveDraft(false);
                setScreen("template");
                setNav("plan");
              }}
              onBackToTemplates={() => handleNav("plan")}
            />
          )}
          {screen === "workout-home" && (
            <WorkoutHomeScreen
              onBrowseTemplates={() => handleNav("plan")}
              onSelectTemplate={(id) => {
                setActiveTemplateId(id);
                setScreen("template");
              }}
              onStartTemplate={(id) => {
                setActiveTemplateId(id);
                setScreen("workout");
                setNav("workout");
              }}
            />
          )}
          {screen === "history" && <HistoryScreen />}
          {screen === "profile" && (
            <ProfileScreen
              email={session?.user.email ?? (LOCAL_PREVIEW ? "local-preview" : null)}
              onSignOut={async () => {
                // Flush anything still pending while this account's session is
                // alive — afterwards these rows cannot be attributed to it.
                // The local wipe happens on the next sign-in, and only if a
                // different user signs in, so signing back in keeps your data.
                if (navigator.onLine) {
                  await syncNow().catch(() => undefined);
                }
                await supabase.auth.signOut();
              }}
            />
          )}
          {screen === "exercise-history" && viewingExerciseName && (
            <ExerciseHistoryScreen
              exerciseName={viewingExerciseName}
              templateName={viewingTemplateName}
              onBack={() => setScreen("template")}
              onBackToTemplates={() => handleNav("plan")}
            />
          )}
        </ErrorBoundary>
        </main>
      </div>
      <NavBar active={nav} onNav={handleNav} hasActiveDraft={hasActiveDraft} />
    </div>
    </WeightUnitProvider>
  );
}
