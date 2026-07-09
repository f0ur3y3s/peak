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

const SYNC_INTERVAL_MS = 5 * 60 * 1000;

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
    if (!session) return;
    // Supabase fires onAuthStateChange (with a new session object) on every
    // background token refresh, not just real sign-ins — without this guard,
    // that would re-run the initial-landing-screen logic and yank the user
    // away from whatever they're doing (e.g. mid-workout) every ~time the
    // token refreshes. Only resolve the landing screen once per actual user.
    if (resolvedUserId.current === session.user.id) return;
    resolvedUserId.current = session.user.id;

    getActiveWorkoutDraft().then((draft) => {
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
    // waiting for the first interval tick.
    if (navigator.onLine) syncNow();
  }, [session]);

  useEffect(() => {
    if (!session) return;
    const iv = setInterval(() => {
      if (navigator.onLine) syncNow();
    }, SYNC_INTERVAL_MS);
    return () => clearInterval(iv);
  }, [session]);

  if (session === undefined) return null;
  if (session === null) return <AuthScreen />;

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
    <div
      className="bg-background min-h-screen relative"
      style={{ maxWidth: 430, margin: "0 auto" }}
    >
      <div className="scroll-area" style={{ paddingBottom: 60 }}>
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
            onOpenLibrary={() => handleNav("exercises")}
          />
        )}
        {screen === "template" && activeTemplateId && (
          <TemplateDetail
            templateId={activeTemplateId}
            onStart={() => setScreen("workout")}
            onBack={() => handleNav("templates")}
            onViewExerciseHistory={(name) => {
              setViewingExerciseName(name);
              setScreen("exercise-history");
            }}
          />
        )}
        {screen === "workout" && activeTemplateId && (
          <ActiveWorkout
            templateId={activeTemplateId}
            onBack={() => setScreen("template")}
            onFinish={() => {
              setScreen("history");
              setNav("history");
            }}
            onDiscard={() => setScreen("template")}
          />
        )}
        {screen === "workout-home" && (
          <WorkoutHomeScreen onBrowseTemplates={() => handleNav("templates")} />
        )}
        {screen === "history" && <HistoryScreen />}
        {screen === "profile" && (
          <ProfileScreen
            email={session.user.email ?? null}
            onSignOut={() => supabase.auth.signOut()}
          />
        )}
        {screen === "exercises" && <ExercisesScreen />}
        {screen === "exercise-history" && viewingExerciseName && (
          <ExerciseHistoryScreen
            exerciseName={viewingExerciseName}
            onBack={() => setScreen("template")}
          />
        )}
      </div>
      <NavBar active={nav} onNav={handleNav} />
    </div>
    </WeightUnitProvider>
  );
}
