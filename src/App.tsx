import { useState, useEffect } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { NavBar, type Screen } from "@/components/NavBar";
import { TemplatesScreen } from "@/screens/TemplatesScreen";
import { TemplateDetail } from "@/screens/TemplateDetail";
import { ActiveWorkout } from "@/screens/ActiveWorkout";
import { HistoryScreen } from "@/screens/HistoryScreen";
import { AuthScreen } from "@/screens/AuthScreen";
import { getLastUsedTemplateId, getActiveWorkoutDraft } from "@/lib/db";

type AppScreen = "templates" | "template" | "workout" | "history";

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [screen, setScreen] = useState<AppScreen>("templates");
  const [nav, setNav] = useState<Screen>("workout");
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    getActiveWorkoutDraft().then((draft) => {
      if (draft) {
        setActiveTemplateId(draft.templateId);
        setScreen("workout");
        return;
      }
      getLastUsedTemplateId().then((id) => {
        if (id) {
          setActiveTemplateId(id);
          setScreen("template");
        } else {
          setScreen("templates");
        }
      });
    });
  }, [session]);

  if (session === undefined) return null;
  if (session === null) return <AuthScreen />;

  const handleNav = async (tab: Screen) => {
    setNav(tab);
    if (tab === "history") {
      setScreen("history");
    } else if (tab === "templates") {
      setScreen("templates");
    } else {
      const draft = await getActiveWorkoutDraft();
      if (draft) {
        setActiveTemplateId(draft.templateId);
        setScreen("workout");
        return;
      }
      const id = await getLastUsedTemplateId();
      if (id) {
        setActiveTemplateId(id);
        setScreen("template");
      } else {
        setScreen("templates");
      }
    }
  };

  return (
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
          />
        )}
        {screen === "template" && activeTemplateId && (
          <TemplateDetail
            templateId={activeTemplateId}
            onStart={() => setScreen("workout")}
            onBack={() => handleNav("templates")}
            onSignOut={() => supabase.auth.signOut()}
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
        {screen === "history" && (
          <HistoryScreen onBack={() => handleNav("workout")} />
        )}
      </div>
      <NavBar active={nav} onNav={handleNav} />
    </div>
  );
}
