// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TimerSheet } from "@/components/TimerSheet";

const fireRestAlert = vi.fn();
vi.mock("@/lib/restAlert", () => ({ fireRestAlert: (name: string) => fireRestAlert(name) }));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  fireRestAlert.mockClear();
});

describe("the rest alert", () => {
  it("fires once as the countdown reaches zero, not on every tick", async () => {
    // The sheet ticks four times a second and can sit finished on screen for
    // minutes. Keying the alert on `remaining === 0` alone would vibrate and
    // beep continuously for as long as it stayed open.
    vi.useFakeTimers();
    render(
      <TimerSheet timer={{ seconds: 1, exerciseName: "Bench Press", nextSet: "Set 2 of 4" }} onClose={() => {}} />
    );

    await act(async () => {
      vi.advanceTimersByTime(1_200);
    });
    expect(fireRestAlert).toHaveBeenCalledOnce();
    expect(fireRestAlert).toHaveBeenCalledWith("Bench Press");

    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });
    expect(fireRestAlert).toHaveBeenCalledOnce();
  });

  it("stays quiet while there is still rest left", async () => {
    vi.useFakeTimers();
    render(
      <TimerSheet timer={{ seconds: 90, exerciseName: "Squat", nextSet: "Set 2 of 5" }} onClose={() => {}} />
    );

    await act(async () => {
      vi.advanceTimersByTime(5_000);
    });

    expect(fireRestAlert).not.toHaveBeenCalled();
  });

  it("does not re-fire when the stepper is pressed at zero", async () => {
    // The stepper re-anchored the deadline to Date.now() even when the clamp
    // had already pinned it, which pushed it a fraction of a tick into the
    // future: 0:00 flickered back to 0:01 and the alert went off twice.
    vi.useFakeTimers();
    render(
      <TimerSheet timer={{ seconds: 1, exerciseName: "Squat", nextSet: "Set 2 of 5" }} onClose={() => {}} />
    );
    await act(async () => {
      vi.advanceTimersByTime(1_200);
    });
    expect(fireRestAlert).toHaveBeenCalledOnce();

    // The two steppers both read "30s"; the first is the minus.
    const steppers = screen.getAllByRole("button").filter((b) => b.textContent?.includes("30s"));
    expect(steppers).toHaveLength(2);
    fireEvent.click(steppers[0]);
    await act(async () => {
      vi.advanceTimersByTime(2_000);
    });

    expect(fireRestAlert).toHaveBeenCalledOnce();
  });

  it("arms again for the next rest period", async () => {
    // One TimerSheet is rendered for the whole workout and its prop is
    // swapped per set, so the component never remounts.
    vi.useFakeTimers();
    const { rerender } = render(
      <TimerSheet timer={{ seconds: 1, exerciseName: "Row", nextSet: "Set 2 of 4" }} onClose={() => {}} />
    );
    await act(async () => {
      vi.advanceTimersByTime(1_200);
    });
    expect(fireRestAlert).toHaveBeenCalledOnce();

    rerender(
      <TimerSheet timer={{ seconds: 1, exerciseName: "Row", nextSet: "Set 3 of 4" }} onClose={() => {}} />
    );
    await act(async () => {
      vi.advanceTimersByTime(1_200);
    });

    expect(fireRestAlert).toHaveBeenCalledTimes(2);
  });
});
