import { Button } from "@/components/ui/button";
import { TopBar } from "@/components/TopBar";

interface WorkoutHomeScreenProps {
  onBrowseTemplates: () => void;
}

export function WorkoutHomeScreen({ onBrowseTemplates }: WorkoutHomeScreenProps) {
  return (
    <div>
      <TopBar title="Workout" />
      <div className="px-5 pt-24 text-center flex flex-col items-center gap-4">
        <p className="text-muted-foreground text-sm">Start a template to work out</p>
        <Button className="font-semibold" onClick={onBrowseTemplates}>
          Browse Templates
        </Button>
      </div>
    </div>
  );
}
