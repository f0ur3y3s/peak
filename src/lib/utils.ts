import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// tailwind-merge only knows Tailwind's stock scale, and its fallback for an
// unrecognized `text-<something>` is to treat it as a COLOR. This app's type
// scale (tailwind.config.js) is entirely custom — text-title, text-body,
// text-label… — so every one of them looked like a color and silently evicted
// the real text color beside it: <Button className="text-title"> lost the
// variant's `text-primary-foreground` and fell back to inheriting
// --foreground, which on the lime primary is near-white on near-white (1:1).
// That is how the Log Set button — the control you press on every single set —
// ended up unreadable. Declaring the scale keeps size and color independent.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      // Must list EVERY fontSize key in tailwind.config.js. An omitted one is
      // silently treated as a color again — utils.test.ts reads the config and
      // fails if these two lists ever drift apart.
      "font-size": [
        {
          text: [
            "label",
            "caption",
            "subtext",
            "body",
            "field",
            "title",
            "stat",
            "wordmark",
            "countdown",
          ],
        },
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fmtRelativeDate(ts: number): string {
  const now = new Date();
  const then = new Date(ts);
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(now) - startOfDay(then)) / 86_400_000);

  if (dayDiff === 0) return "Today";
  if (dayDiff === 1) return "Yesterday";
  if (dayDiff >= 2 && dayDiff <= 6) return `${dayDiff} days ago`;

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${then.getDate()} ${months[then.getMonth()]}`;
}
