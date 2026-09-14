import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cn, fmtRelativeDate } from "@/lib/utils";

// Local-time constructor: fmtRelativeDate buckets by *local* calendar day, so
// every fixture here is built in local time to stay timezone-independent.
const at = (y: number, m: number, d: number, h = 12, min = 0) =>
  new Date(y, m - 1, d, h, min, 0, 0).getTime();

const freezeAt = (ts: number) => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(ts));
};

afterEach(() => {
  vi.useRealTimers();
});

describe("fmtRelativeDate", () => {
  it('returns "Today" anywhere inside the current calendar day', () => {
    freezeAt(at(2026, 3, 15, 12));
    expect(fmtRelativeDate(at(2026, 3, 15, 0, 0))).toBe("Today");
    expect(fmtRelativeDate(at(2026, 3, 15, 12, 0))).toBe("Today");
    expect(fmtRelativeDate(at(2026, 3, 15, 23, 59))).toBe("Today");
  });

  it('returns "Yesterday" for the previous calendar day, however few hours ago', () => {
    freezeAt(at(2026, 3, 15, 0, 30));
    // Only 90 minutes earlier, but a different calendar day.
    expect(fmtRelativeDate(at(2026, 3, 14, 23, 0))).toBe("Yesterday");

    freezeAt(at(2026, 3, 15, 23, 59));
    // Nearly 48 hours earlier, but still the previous calendar day.
    expect(fmtRelativeDate(at(2026, 3, 14, 0, 1))).toBe("Yesterday");
  });

  it('returns "N days ago" for 2 through 6 days', () => {
    freezeAt(at(2026, 3, 15, 12));
    expect(fmtRelativeDate(at(2026, 3, 13))).toBe("2 days ago");
    expect(fmtRelativeDate(at(2026, 3, 12))).toBe("3 days ago");
    expect(fmtRelativeDate(at(2026, 3, 11))).toBe("4 days ago");
    expect(fmtRelativeDate(at(2026, 3, 10))).toBe("5 days ago");
    expect(fmtRelativeDate(at(2026, 3, 9))).toBe("6 days ago");
  });

  it("switches to an absolute date at exactly 7 days", () => {
    freezeAt(at(2026, 3, 15, 12));
    expect(fmtRelativeDate(at(2026, 3, 9))).toBe("6 days ago");
    expect(fmtRelativeDate(at(2026, 3, 8))).toBe("8 Mar");
    expect(fmtRelativeDate(at(2026, 3, 7))).toBe("7 Mar");
  });

  it("formats far-past dates as day + short month, with no year", () => {
    freezeAt(at(2026, 3, 15, 12));
    expect(fmtRelativeDate(at(2026, 1, 1))).toBe("1 Jan");
    expect(fmtRelativeDate(at(2025, 12, 31))).toBe("31 Dec");
    expect(fmtRelativeDate(at(2024, 6, 5))).toBe("5 Jun");
  });

  it("renders every month with the expected three-letter abbreviation", () => {
    freezeAt(at(2027, 6, 1, 12));
    const expected = [
      "1 Jan",
      "1 Feb",
      "1 Mar",
      "1 Apr",
      "1 May",
      "1 Jun",
      "1 Jul",
      "1 Aug",
      "1 Sep",
      "1 Oct",
      "1 Nov",
      "1 Dec",
    ];
    for (let month = 1; month <= 12; month++) {
      expect(fmtRelativeDate(at(2026, month, 1))).toBe(expected[month - 1]);
    }
  });

  describe("year boundaries", () => {
    it("counts relative days across new year, not calendar-year arithmetic", () => {
      freezeAt(at(2026, 1, 1, 9));
      expect(fmtRelativeDate(at(2026, 1, 1, 8))).toBe("Today");
      expect(fmtRelativeDate(at(2025, 12, 31, 20))).toBe("Yesterday");
      expect(fmtRelativeDate(at(2025, 12, 30))).toBe("2 days ago");
      expect(fmtRelativeDate(at(2025, 12, 26))).toBe("6 days ago");
      expect(fmtRelativeDate(at(2025, 12, 25))).toBe("25 Dec");
    });

    it("handles a leap day and the 2024->2025 rollover", () => {
      freezeAt(at(2024, 3, 1, 12));
      expect(fmtRelativeDate(at(2024, 2, 29))).toBe("Yesterday");
      expect(fmtRelativeDate(at(2024, 2, 28))).toBe("2 days ago");

      freezeAt(at(2025, 1, 2, 12));
      expect(fmtRelativeDate(at(2024, 12, 31))).toBe("2 days ago");
      expect(fmtRelativeDate(at(2024, 12, 27))).toBe("6 days ago");
      expect(fmtRelativeDate(at(2024, 12, 26))).toBe("26 Dec");
    });

    it("does not confuse a same-day-of-year date one year back with Today", () => {
      freezeAt(at(2026, 3, 15, 12));
      expect(fmtRelativeDate(at(2025, 3, 15, 12))).toBe("15 Mar");
    });
  });

  it("is robust to a 23- or 25-hour day (the Math.round in the day diff)", () => {
    // Whole-day arithmetic is done on local midnights and rounded, so a DST
    // shift inside the window cannot push a 2-day gap into the 1-day bucket.
    freezeAt(at(2026, 3, 9, 12));
    expect(fmtRelativeDate(at(2026, 3, 8, 12))).toBe("Yesterday");
    expect(fmtRelativeDate(at(2026, 3, 7, 12))).toBe("2 days ago");
    freezeAt(at(2026, 11, 2, 12));
    expect(fmtRelativeDate(at(2026, 11, 1, 12))).toBe("Yesterday");
    expect(fmtRelativeDate(at(2026, 10, 31, 12))).toBe("2 days ago");
  });

  it("falls through to the absolute format for future timestamps", () => {
    // Current behaviour, not necessarily desired: a negative day diff matches
    // none of the relative branches, so tomorrow renders as "16 Mar".
    freezeAt(at(2026, 3, 15, 12));
    expect(fmtRelativeDate(at(2026, 3, 16))).toBe("16 Mar");
    expect(fmtRelativeDate(at(2026, 4, 1))).toBe("1 Apr");
  });
});

describe("cn", () => {
  it("joins class names and applies clsx conditional forms", () => {
    expect(cn("px-2", "py-1")).toBe("px-2 py-1");
    expect(cn("px-2", false && "hidden", undefined, null, "py-1")).toBe("px-2 py-1");
    expect(cn(["px-2", "py-1"], { "opacity-50": true, hidden: false })).toBe(
      "px-2 py-1 opacity-50"
    );
    expect(cn()).toBe("");
  });

  it("still de-duplicates ordinary conflicting Tailwind utilities", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
    expect(cn("text-muted-foreground", "text-foreground")).toBe("text-foreground");
    expect(cn("text-sm", "text-base")).toBe("text-base");
  });

  describe("custom type scale must not evict the color beside it", () => {
    // Regression coverage for a real defect. tailwind-merge only knows
    // Tailwind's stock scale, and its fallback for an unrecognised
    // `text-<x>` is to treat it as a COLOR. Every class in this app's custom
    // type scale therefore looked like a color and silently dropped the real
    // text color next to it — which is how the lime primary Button's label
    // lost `text-primary-foreground` and became near-invisible.
    const SCALE = [
      "text-title",
      "text-body",
      "text-label",
      "text-caption",
      "text-subtext",
      "text-field",
      "text-stat",
    ] as const;

    it("keeps text-primary-foreground on a lime primary button", () => {
      const result = cn("bg-primary text-primary-foreground", "text-title");
      expect(result).toContain("text-primary-foreground");
      expect(result).toContain("text-title");
      expect(result).toContain("bg-primary");
    });

    it.each(SCALE)("keeps a color class beside %s", (size) => {
      const result = cn("text-primary-foreground", size);
      expect(result.split(" ").sort()).toEqual(
        ["text-primary-foreground", size].sort()
      );
    });

    it.each(SCALE)("%s keeps a muted / destructive color too", (size) => {
      expect(cn("text-muted-foreground", size).split(" ")).toContain(
        "text-muted-foreground"
      );
      expect(cn("text-destructive", size).split(" ")).toContain("text-destructive");
    });

    it("works with the size first and the color second", () => {
      const result = cn("text-body", "text-primary-foreground");
      expect(result).toContain("text-body");
      expect(result).toContain("text-primary-foreground");
    });

    it("treats the custom scale as one group, so two sizes still collapse", () => {
      expect(cn("text-title", "text-body")).toBe("text-body");
      expect(cn("text-label", "text-stat")).toBe("text-stat");
      expect(cn("text-caption", "text-subtext", "text-field")).toBe("text-field");
    });

    it("lets a custom size override a stock Tailwind size and vice versa", () => {
      expect(cn("text-sm", "text-title")).toBe("text-title");
      expect(cn("text-title", "text-lg")).toBe("text-lg");
    });

    it("still collapses two colors even when a custom size is present", () => {
      const result = cn("text-muted-foreground text-body", "text-foreground");
      expect(result).toContain("text-foreground");
      expect(result).not.toContain("text-muted-foreground");
      expect(result).toContain("text-body");
    });

    it("keeps a color beside every custom size, wordmark and countdown included", () => {
      // These two were left out when the other seven were declared, so they
      // went on being mis-classified as colors — the same defect that made a
      // lime button's label invisible, latent only because neither call site
      // happened to pair them with a text color.
      expect(cn("text-primary-foreground", "text-wordmark")).toContain("text-primary-foreground");
      expect(cn("text-primary-foreground", "text-countdown")).toContain("text-primary-foreground");
    });

    it("declares every fontSize key in tailwind.config.js", () => {
      // Read the config rather than a hand-copied list: the original bug was
      // exactly a hand-copied list drifting from the source of truth.
      const config = readFileSync(
        fileURLToPath(new URL("../../../tailwind.config.js", import.meta.url)),
        "utf8"
      );
      const block = config.slice(config.indexOf("fontSize:"));
      const keys = [
        ...block.slice(0, block.indexOf("\n      }")).matchAll(/^\s{8}([A-Za-z][\w-]*):/gm),
      ].map((m) => m[1]);
      expect(keys.length).toBeGreaterThanOrEqual(9);

      for (const key of keys) {
        expect(
          cn("text-primary-foreground", `text-${key}`),
          `text-${key} is a fontSize key in tailwind.config.js but is not declared in cn()'s ` +
            "font-size group, so tailwind-merge treats it as a color and strips the real one"
        ).toContain("text-primary-foreground");
      }
    });
  });
});
