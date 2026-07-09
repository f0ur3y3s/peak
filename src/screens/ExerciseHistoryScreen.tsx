import { TopBar } from "@/components/TopBar";
import { HistoryAnalytics } from "@/components/HistoryAnalytics";

interface ExerciseHistoryScreenProps {
  exerciseName: string;
  onBack: () => void;
}

export function ExerciseHistoryScreen({ exerciseName, onBack }: ExerciseHistoryScreenProps) {
  return (
    <div>
      <TopBar title={exerciseName} onBack={onBack} />
      <HistoryAnalytics focusExercise={exerciseName} />
    </div>
  );
}
