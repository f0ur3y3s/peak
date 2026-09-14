// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fireRestAlert,
  getRestAlertMode,
  requestRestNotifications,
  setRestAlertMode,
} from "@/lib/restAlert";

function hide(): void {
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
}
function show(): void {
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
}

beforeEach(() => {
  window.localStorage.clear();
  show();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the stored setting", () => {
  it("defaults to sound — a timer nobody can hear is not a timer", () => {
    expect(getRestAlertMode()).toBe("sound");
  });

  it("round-trips a choice", () => {
    setRestAlertMode("vibrate");
    expect(getRestAlertMode()).toBe("vibrate");
  });

  it("ignores a value it did not write", () => {
    window.localStorage.setItem("peak-rest-alert", "airhorn");
    expect(getRestAlertMode()).toBe("sound");
  });

  it("survives storage that throws rather than returning null", () => {
    // Safari with site data blocked. This is read during render.
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });

    expect(getRestAlertMode()).toBe("sound");
    expect(() => setRestAlertMode("off")).not.toThrow();
  });
});

describe("firing the alert", () => {
  it("vibrates", () => {
    const vibrate = vi.fn();
    vi.stubGlobal("navigator", { vibrate });

    fireRestAlert("Bench Press");

    expect(vibrate).toHaveBeenCalled();
  });

  it("stays silent when the setting is off", () => {
    const vibrate = vi.fn();
    vi.stubGlobal("navigator", { vibrate });
    setRestAlertMode("off");

    fireRestAlert("Bench Press");

    expect(vibrate).not.toHaveBeenCalled();
  });

  it("does not throw where vibration is unimplemented", () => {
    // Every iPhone.
    vi.stubGlobal("navigator", {});
    expect(() => fireRestAlert()).not.toThrow();
  });

  it("does not throw when the browser rejects the vibration outright", () => {
    vi.stubGlobal("navigator", {
      vibrate: () => {
        throw new Error("blocked without a user gesture");
      },
    });
    expect(() => fireRestAlert()).not.toThrow();
  });

  it("notifies only when the countdown is out of sight", () => {
    const Notif = vi.fn() as unknown as typeof Notification;
    (Notif as unknown as { permission: string }).permission = "granted";
    vi.stubGlobal("Notification", Notif);
    vi.stubGlobal("navigator", { vibrate: vi.fn() });

    fireRestAlert("Bench Press");
    expect(Notif).not.toHaveBeenCalled();

    hide();
    fireRestAlert("Bench Press");
    expect(Notif).toHaveBeenCalledOnce();
    expect(vi.mocked(Notif).mock.calls[0][1]).toMatchObject({ body: "Next set — Bench Press" });
  });

  it("does not notify without permission", () => {
    const Notif = vi.fn() as unknown as typeof Notification;
    (Notif as unknown as { permission: string }).permission = "default";
    vi.stubGlobal("Notification", Notif);
    vi.stubGlobal("navigator", { vibrate: vi.fn() });
    hide();

    fireRestAlert("Bench Press");

    expect(Notif).not.toHaveBeenCalled();
  });

  it("falls back to the in-app channels when constructing a notification throws", () => {
    // Chrome on Android requires notifications to come from the service worker.
    const vibrate = vi.fn();
    const Notif = vi.fn(() => {
      throw new Error("Illegal constructor");
    }) as unknown as typeof Notification;
    (Notif as unknown as { permission: string }).permission = "granted";
    vi.stubGlobal("Notification", Notif);
    vi.stubGlobal("navigator", { vibrate });
    hide();

    expect(() => fireRestAlert("Bench Press")).not.toThrow();
    expect(vibrate).toHaveBeenCalled();
  });
});

describe("requesting notification permission", () => {
  it("does not re-prompt once the user has answered", async () => {
    const requestPermission = vi.fn();
    const Notif = vi.fn() as unknown as typeof Notification;
    Object.assign(Notif, { permission: "denied", requestPermission });
    vi.stubGlobal("Notification", Notif);

    expect(await requestRestNotifications()).toBe("denied");
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("asks when they have not", async () => {
    const requestPermission = vi.fn().mockResolvedValue("granted");
    const Notif = vi.fn() as unknown as typeof Notification;
    Object.assign(Notif, { permission: "default", requestPermission });
    vi.stubGlobal("Notification", Notif);

    expect(await requestRestNotifications()).toBe("granted");
  });

  it("reports denied where the API does not exist", async () => {
    vi.stubGlobal("Notification", undefined);
    expect(await requestRestNotifications()).toBe("denied");
  });
});
