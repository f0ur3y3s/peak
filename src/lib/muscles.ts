export interface MuscleGroup {
  group: string;
  muscles: string[];
}

export const MUSCLE_GROUPS: MuscleGroup[] = [
  { group: "Chest", muscles: ["Upper Chest", "Lower Chest", "Chest"] },
  { group: "Shoulders", muscles: ["Front Delts", "Side Delts", "Rear Delts"] },
  { group: "Back", muscles: ["Lats", "Traps", "Rhomboids", "Lower Back"] },
  { group: "Arms", muscles: ["Biceps", "Triceps", "Forearms"] },
  { group: "Legs", muscles: ["Quads", "Hamstrings", "Glutes", "Calves"] },
  { group: "Core", muscles: ["Abs", "Obliques"] },
];

export const ALL_MUSCLES: string[] = MUSCLE_GROUPS.flatMap((g) => g.muscles);

/** Case-insensitive subsequence match — lets "tri" match "Triceps", "lb" match "Lower Back", etc. */
export function fuzzyMatch(query: string, target: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const t = target.toLowerCase();
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length;
}

/** Maps a specific muscle (or a broad group name) to its broad group, for sectioning lists. */
export function groupForMuscle(muscle: string): string {
  const m = muscle.trim().toLowerCase();
  for (const g of MUSCLE_GROUPS) {
    if (g.group.toLowerCase() === m) return g.group;
    if (g.muscles.some((sub) => sub.toLowerCase() === m)) return g.group;
  }
  return "Other";
}
