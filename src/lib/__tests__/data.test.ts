import { describe, expect, it } from "vitest";
import { fmtTime } from "@/lib/data";

describe("fmtTime", () => {
  it("formats zero as 0:00", () => {
    expect(fmtTime(0)).toBe("0:00");
  });

  it("zero-pads sub-minute values to two second digits", () => {
    expect(fmtTime(1)).toBe("0:01");
    expect(fmtTime(9)).toBe("0:09");
    expect(fmtTime(10)).toBe("0:10");
    expect(fmtTime(45)).toBe("0:45");
    expect(fmtTime(59)).toBe("0:59");
  });

  it("formats exact minutes with no leftover seconds", () => {
    expect(fmtTime(60)).toBe("1:00");
    expect(fmtTime(120)).toBe("2:00");
    expect(fmtTime(180)).toBe("3:00");
    expect(fmtTime(600)).toBe("10:00");
  });

  it("formats minutes plus seconds", () => {
    expect(fmtTime(61)).toBe("1:01");
    expect(fmtTime(75)).toBe("1:15");
    expect(fmtTime(90)).toBe("1:30");
    expect(fmtTime(119)).toBe("1:59");
    expect(fmtTime(125)).toBe("2:05");
  });

  it("covers the rest durations the seed program actually uses", () => {
    expect(fmtTime(60)).toBe("1:00");
    expect(fmtTime(75)).toBe("1:15");
    expect(fmtTime(90)).toBe("1:30");
    expect(fmtTime(120)).toBe("2:00");
    expect(fmtTime(150)).toBe("2:30");
    expect(fmtTime(165)).toBe("2:45");
    expect(fmtTime(180)).toBe("3:00");
    expect(fmtTime(210)).toBe("3:30");
  });

  it("keeps counting in minutes past an hour rather than rolling over to h:mm:ss", () => {
    expect(fmtTime(3599)).toBe("59:59");
    expect(fmtTime(3600)).toBe("60:00");
    expect(fmtTime(3601)).toBe("60:01");
    expect(fmtTime(3661)).toBe("61:01");
    expect(fmtTime(5400)).toBe("90:00");
    expect(fmtTime(7325)).toBe("122:05");
  });

  it("never pads the minute field, and always pads the second field", () => {
    for (const s of [0, 5, 59, 60, 61, 599, 600, 3661]) {
      const [minutes, seconds] = fmtTime(s).split(":");
      expect(seconds).toHaveLength(2);
      expect(minutes).not.toMatch(/^0\d/);
    }
  });

  it("is consistent with the seconds it was given", () => {
    for (let s = 0; s <= 400; s++) {
      const [minutes, seconds] = fmtTime(s).split(":");
      expect(Number(minutes) * 60 + Number(seconds)).toBe(s);
    }
  });
});
