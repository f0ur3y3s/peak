import { useState, useEffect } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { NavBar, type Screen } from "@/components/NavBar";
import { TemplateDetail } from "@/screens/TemplateDetail";
import { ActiveWorkout } from "@/screens/ActiveWorkout";
import { HistoryScreen } from "@/screens/HistoryScreen";
import { AuthScreen } from "@/screens/AuthScreen";

type AppScreen = "template" | "workout" | "history";

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [screen, setScreen]   = useState<AppScreen>("template");
  const [nav, setNav]         = useState<Screen>("workout");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => subscription.unsubscribe();
  }, []);

  // undefined = still loading initial session from localStorage
  if (session === undefined) return null;

  if (session === null) return <AuthScreen />;

  const handleNav = (tab: Screen) => {
    setNav(tab);
    if (tab === "history") setScreen("history");
    else setScreen("template");
  };

  return (
    <div
      className="bg-background min-h-screen relative"
      style={{ maxWidth: 430, margin: "0 auto" }}
    >
      <div className="scroll-area" style={{ paddingBottom: 60 }}>
        {screen === "template" && (
          <TemplateDetail
            onStart={() => setScreen("workout")}
            onBack={() => {}}
            onSignOut={() => supabase.auth.signOut()}
          />
        )}
        {screen === "workout" && (
          <ActiveWorkout
            onBack={() => setScreen("template")}
            onFinish={() => {
              setScreen("history");
              setNav("history");
            }}
          />
        )}
        {screen === "history" && (
          <HistoryScreen
            onBack={() => {
              setScreen("template");
              setNav("workout");
            }}
          />
        )}
      </div>
      <NavBar active={nav} onNav={handleNav} />
    </div>
  );
}
