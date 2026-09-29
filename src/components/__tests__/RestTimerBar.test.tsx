// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RestTimerBar } from "@/components/RestTimerBar";
import { adjustRest, startRest, type TimerState } from "@/lib/data";

const fireRestAlert = vi.fn();
vi.mock("@/lib/restAlert", () => ({ fireRestAlert: (name: string) => fireRestAlert(name) }));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  fireRestAlert.mockClear();
});

/** Owns the timer the way ActiveWorkout does, so ±30s goes through adjustRest. */
function Harness({ initial, onDismiss = () => {} }: { initial: TimerState; onDismiss?: () => void }) {
  const [timer, setTimer] = useState(initial);
  return <RestTimerBar timer={timer} onAdjust={(d) => setTimer((t) => adjustRest(t, d))} onDismiss={onDismiss} />;
}

async function advance(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
}

describe("RestTimerBar", () => {
  it("counts down from the deadline and shows what's next", async () => {
    vi.useFakeTimers();
    render(<Harness initial={startRest(90, "Squat", "Set 2 of 5")} />);
    expect(screen.getByText("1:30")).toBeTruthy();
    expect(screen.getByText("Set 2 of 5 · Squat")).toBeTruthy();

    await advance(5_000);
    expect(screen.getByText("1:25")).toBeTruthy();
  });

  it("moves the countdown with the ±30 buttons", async () => {
    vi.useFakeTimers();
    render(<Harness initial={startRest(90, "Squat", "Set 2 of 5")} />);

    fireEvent.click(screen.getByRole("button", { name: "30 seconds more rest" }));
    await advance(250);
    expect(screen.getByText("2:00")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "30 seconds less rest" }));
    fireEvent.click(screen.getByRole("button", { name: "30 seconds less rest" }));
    await advance(250);
    expect(screen.getByText("1:00")).toBeTruthy();
  });

  it("skips and dismisses through plain buttons, no gesture needed", async () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(<Harness initial={startRest(1, "Row", "Set 2 of 4")} onDismiss={onDismiss} />);

    fireEvent.click(screen.getByRole("button", { name: "Skip rest" }));
    expect(onDismiss).toHaveBeenCalledOnce();

    await advance(1_200);
    expect(screen.getByText("Time to lift · Row")).toBeTruthy();
    // Once rest is over the adjusters go; only dismissing is left to do.
    expect(screen.queryByRole("button", { name: "30 seconds more rest" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss rest timer" }));
    expect(onDismiss).toHaveBeenCalledTimes(2);
  });
});

describe("the rest alert", () => {
  it("fires once as the countdown reaches zero, not on every tick", async () => {
    // The bar ticks four times a second and can sit finished for minutes.
    // Keying the alert on `remaining === 0` alone would vibrate and beep
    // continuously for as long as it stayed up.
    vi.useFakeTimers();
    render(<Harness initial={startRest(1, "Bench Press", "Set 2 of 4")} />);

    await advance(1_200);
    expect(fireRestAlert).toHaveBeenCalledOnce();
    expect(fireRestAlert).toHaveBeenCalledWith("Bench Press");

    await advance(10_000);
    expect(fireRestAlert).toHaveBeenCalledOnce();
  });

  it("stays quiet while there is still rest left", async () => {
    vi.useFakeTimers();
    render(<Harness initial={startRest(90, "Squat", "Set 2 of 5")} />);
    await advance(5_000);
    expect(fireRestAlert).not.toHaveBeenCalled();
  });

  it("arms again when +30 is pressed after it went off", async () => {
    vi.useFakeTimers();
    const { rerender } = render(
      <RestTimerBar timer={startRest(1, "Squat", "Set 2 of 5")} onAdjust={() => {}} onDismiss={() => {}} />
    );
    await advance(1_200);
    expect(fireRestAlert).toHaveBeenCalledOnce();

    rerender(<RestTimerBar timer={startRest(30, "Squat", "Set 2 of 5")} onAdjust={() => {}} onDismiss={() => {}} />);
    await advance(31_000);
    expect(fireRestAlert).toHaveBeenCalledTimes(2);
  });

  it("arms again for the next rest period", async () => {
    // One bar is rendered for the whole workout and its prop is swapped per
    // set, so the component never remounts.
    vi.useFakeTimers();
    const { rerender } = render(
      <RestTimerBar timer={startRest(1, "Row", "Set 2 of 4")} onAdjust={() => {}} onDismiss={() => {}} />
    );
    await advance(1_200);
    expect(fireRestAlert).toHaveBeenCalledOnce();

    rerender(<RestTimerBar timer={startRest(1, "Row", "Set 3 of 4")} onAdjust={() => {}} onDismiss={() => {}} />);
    await advance(1_200);
    expect(fireRestAlert).toHaveBeenCalledTimes(2);
  });
});

describe("adjustRest", () => {
  const t0 = 1_000_000;

  it("moves the deadline, and clamps at zero", () => {
    const timer = startRest(90, "Squat", "Set 2 of 5", t0);
    expect(adjustRest(timer, 30, t0).endsAt).toBe(t0 + 120_000);
    expect(adjustRest(timer, -120, t0).endsAt).toBe(t0);
  });

  it("returns the same timer when the clamp leaves nothing to change", () => {
    // A new object here re-anchored the deadline a fraction of a tick into
    // the future: "-30" at 0:00 flickered to 0:01 and the alert fired twice.
    // It would also reschedule the locked-screen push for nothing.
    const timer = startRest(1, "Squat", "Set 2 of 5", t0);
    expect(adjustRest(timer, -30, t0 + 5_000)).toBe(timer);
  });

  it("can extend a rest that is already longer than ten minutes", () => {
    // The old sheet clamped to 600s, so "+30" on a 15:00 rest cut it to 10:00.
    const timer = startRest(900, "Deadlift", "Set 2 of 3", t0);
    expect(adjustRest(timer, 30, t0).endsAt).toBe(t0 + 930_000);
  });
});
