// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { createElement } from "react";
import { useWakeLock } from "@/lib/useWakeLock";

function Harness({ active }: { active: boolean }) {
  useWakeLock(active);
  return null;
}

function stubWakeLock(sentinel: { release: () => Promise<void> } | Error) {
  const request = vi.fn(() =>
    sentinel instanceof Error ? Promise.reject(sentinel) : Promise.resolve(sentinel)
  );
  Object.defineProperty(navigator, "wakeLock", { configurable: true, value: { request } });
  return request;
}

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, value: state });
  document.dispatchEvent(new Event("visibilitychange"));
}

afterEach(() => {
  cleanup();
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  vi.restoreAllMocks();
});

describe("useWakeLock", () => {
  it("holds the screen while active", async () => {
    const request = stubWakeLock({ release: vi.fn().mockResolvedValue(undefined) });

    await act(async () => {
      render(createElement(Harness, { active: true }));
    });

    expect(request).toHaveBeenCalledWith("screen");
  });

  it("asks for nothing when inactive", async () => {
    const request = stubWakeLock({ release: vi.fn().mockResolvedValue(undefined) });

    await act(async () => {
      render(createElement(Harness, { active: false }));
    });

    expect(request).not.toHaveBeenCalled();
  });

  it("re-acquires after the page comes back", async () => {
    // Browsers revoke the lock whenever the page is hidden and never restore
    // it, so one glance at a message would otherwise end it for the rest of
    // the workout.
    const request = stubWakeLock({ release: vi.fn().mockResolvedValue(undefined) });
    await act(async () => {
      render(createElement(Harness, { active: true }));
    });
    expect(request).toHaveBeenCalledTimes(1);

    await act(async () => setVisibility("hidden"));
    expect(request).toHaveBeenCalledTimes(1);

    await act(async () => setVisibility("visible"));
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("releases when the workout ends", async () => {
    const release = vi.fn().mockResolvedValue(undefined);
    stubWakeLock({ release });
    const { unmount } = render(createElement(Harness, { active: true }));
    await act(async () => undefined);

    unmount();
    await act(async () => undefined);

    expect(release).toHaveBeenCalled();
  });

  it("stops listening once released, so a later tab switch re-acquires nothing", async () => {
    const request = stubWakeLock({ release: vi.fn().mockResolvedValue(undefined) });
    const { unmount } = render(createElement(Harness, { active: true }));
    await act(async () => undefined);
    unmount();

    await act(async () => setVisibility("visible"));

    expect(request).toHaveBeenCalledTimes(1);
  });

  it("carries on when the browser refuses — a low battery is not an error", async () => {
    stubWakeLock(new Error("NotAllowedError"));

    await expect(
      act(async () => {
        render(createElement(Harness, { active: true }));
      })
    ).resolves.not.toThrow();
  });

  it("is a no-op where the API does not exist", async () => {
    Object.defineProperty(navigator, "wakeLock", { configurable: true, value: undefined });

    await expect(
      act(async () => {
        render(createElement(Harness, { active: true }));
      })
    ).resolves.not.toThrow();
  });
});
