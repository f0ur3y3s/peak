import { useState, useEffect, useRef } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { NavBar, type Screen } from "@/components/NavBar";
import { TemplatesScreen } from "@/screens/TemplatesScreen";
import { TemplateDetail } from "@/screens/TemplateDetail";
import { ActiveWorkout } from "@/screens/ActiveWorkout";
import { HistoryScreen } from "@/screens/HistoryScreen";
import { AuthScreen } from "@/screens/AuthScreen";
import { ProfileScreen } from "@/screens/ProfileScreen";
import { ExercisesScreen } from "@/screens/ExercisesScreen";
import { ExerciseHistoryScreen } from "@/screens/ExerciseHistoryScreen";
import { WorkoutHomeScreen } from "@/screens/WorkoutHomeScreen";
import { WeightUnitProvider } from "@/lib/weightUnit";
import { getActiveWorkoutDraft } from "@/lib/db";
import { syncNow } from "@/lib/sync";
import { UpdateBanner } from "@/components/UpdateBanner";

const SYNC_INTERVAL_MS = 5 * 60 * 1000;

// Opt-in local preview: with no real Supabase project configured, set
// VITE_LOCAL_PREVIEW=1 in .env to skip AuthScreen and use the app directly.
// Templates, exercises, workouts, and history all live in IndexedDB via
// lib/db.ts — only auth and cross-device sync need a real backend — so this
// is enough to run and click through the whole app locally. Gated on DEV so
// it can never affect a production build regardless of env misconfiguration.
const LOCAL_PREVIEW = import.meta.env.DEV && import.meta.env.VITE_LOCAL_PREVIEW === "1";

type AppScreen =
  | "templates"
  | "template"
  | "workout"
  | "workout-home"
  | "history"
  | "profile"
  | "exercises"
  | "exercise-history";

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [screen, setScreen] = useState<AppScreen>("templates");
  const [nav, setNav] = useState<Screen>("workout");
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
  const [viewingExerciseName, setViewingExerciseName] = useState<string | null>(null);
  const [viewingTemplateName, setViewingTemplateName] = useState<string | null>(null);
  // Drives NavBar's "workout in progress" indicator — otherwise nothing
  // signals a session is running once you leave the Workout tab.
  const [hasActiveDraft, setHasActiveDraft] = useState(false);
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

    getActiveWorkoutDraft().then((draft) => {
      setHasActiveDraft(!!draft);
      if (draft) {
        setActiveTemplateId(draft.templateId);
        setScreen("workout");
        setNav("workout");
        return;
      }
      setScreen("workout-home");
      setNav("workout");
    });

    // One sync pass on sign-in/app-open, in addition to the periodic timer
    // below, so a freshly opened app catches up immediately rather than
    // waiting for the first interval tick. Skipped in local-preview mode —
    // there's no real backend to sync with.
    if (session && navigator.onLine) syncNow();
  }, [session]);

  useEffect(() => {
    if (!session) return;
    const iv = setInterval(() => {
      if (navigator.onLine) syncNow();
    }, SYNC_INTERVAL_MS);
    return () => clearInterval(iv);
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
    } else if (tab === "templates") {
      setScreen("templates");
    } else if (tab === "profile") {
      setScreen("profile");
    } else if (tab === "exercises") {
      setScreen("exercises");
    } else {
      const draft = await getActiveWorkoutDraft();
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
      <div className="scroll-area">
        {screen === "templates" && (
          <TemplatesScreen
            onSelectTemplate={(id) => {
              setActiveTemplateId(id);
              setScreen("template");
            }}
            onCreateTemplate={(id) => {
              setActiveTemplateId(id);
              setScreen("template");
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
            onBack={() => handleNav("templates")}
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
              setNav("templates");
            }}
            onFinish={() => {
              setHasActiveDraft(false);
              setScreen("history");
              setNav("history");
            }}
            onDiscard={() => {
              setHasActiveDraft(false);
              setScreen("template");
              setNav("templates");
            }}
            onBackToTemplates={() => handleNav("templates")}
          />
        )}
        {screen === "workout-home" && (
          <WorkoutHomeScreen
            onBrowseTemplates={() => handleNav("templates")}
            onSelectTemplate={(id) => {
              setActiveTemplateId(id);
              setScreen("template");
            }}
          />
        )}
        {screen === "history" && <HistoryScreen />}
        {screen === "profile" && (
          <ProfileScreen
            email={session?.user.email ?? (LOCAL_PREVIEW ? "local-preview" : null)}
            onSignOut={() => supabase.auth.signOut()}
          />
        )}
        {screen === "exercises" && <ExercisesScreen />}
        {screen === "exercise-history" && viewingExerciseName && (
          <ExerciseHistoryScreen
            exerciseName={viewingExerciseName}
            templateName={viewingTemplateName}
            onBack={() => setScreen("template")}
            onBackToTemplates={() => handleNav("templates")}
          />
        )}
      </div>
      <NavBar active={nav} onNav={handleNav} hasActiveDraft={hasActiveDraft} />
    </div>
    </WeightUnitProvider>
  );
}
