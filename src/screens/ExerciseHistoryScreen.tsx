import { TopBar } from "@/components/TopBar";
import { HistoryAnalytics } from "@/components/HistoryAnalytics";

interface ExerciseHistoryScreenProps {
  exerciseName: string;
  templateName: string | null;
  onBack: () => void;
  onBackToTemplates: () => void;
}

export function ExerciseHistoryScreen({
  exerciseName,
  templateName,
  onBack,
  onBackToTemplates,
}: ExerciseHistoryScreenProps) {
  return (
    <div>
      <TopBar
        title={exerciseName}
        onBack={onBack}
        breadcrumb={[
          { label: "Templates", onClick: onBackToTemplates },
          ...(templateName ? [{ label: templateName, onClick: onBack }] : []),
        ]}
      />
      <HistoryAnalytics focusExercise={exerciseName} />
    </div>
  );
}
