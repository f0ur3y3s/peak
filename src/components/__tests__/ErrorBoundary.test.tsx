// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";

function Boom({ throws }: { throws: boolean }) {
  if (throws) throw new Error("exercises is not iterable");
  return <p>the screen</p>;
}

// The boundary logs the error and its component stack on purpose; React also
// prints its own warning. Neither belongs in the test output.
const quiet = () => vi.spyOn(console, "error").mockImplementation(() => undefined);

beforeAll(() => {
  // React re-throws a caught error on window so devtools can see it; jsdom
  // then dumps the full stack to stderr for every one of these deliberate
  // crashes. preventDefault marks it handled and keeps the run readable.
  window.addEventListener("error", (e) => e.preventDefault());
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("ErrorBoundary", () => {
  it("renders its children when nothing throws", () => {
    render(
      <ErrorBoundary>
        <Boom throws={false} />
      </ErrorBoundary>
    );
    expect(screen.getByText("the screen")).toBeDefined();
  });

  it("shows the error instead of a blank page", () => {
    quiet();
    render(
      <ErrorBoundary>
        <Boom throws />
      </ErrorBoundary>
    );

    expect(screen.getByRole("alert")).toBeDefined();
    expect(screen.getByText("exercises is not iterable")).toBeDefined();
    // The one thing a user needs to be told before anything else.
    expect(screen.getByText(/workouts are safe/i)).toBeDefined();
  });

  it("uses the caller's title", () => {
    quiet();
    render(
      <ErrorBoundary title="This screen hit a problem">
        <Boom throws />
      </ErrorBoundary>
    );
    expect(screen.getByText("This screen hit a problem")).toBeDefined();
  });

  it("recovers when the child stops throwing and Try again is pressed", () => {
    quiet();
    function Harness() {
      const [throws, setThrows] = useState(true);
      return (
        <>
          <button onClick={() => setThrows(false)}>fix it</button>
          <ErrorBoundary>
            <Boom throws={throws} />
          </ErrorBoundary>
        </>
      );
    }
    render(<Harness />);

    fireEvent.click(screen.getByText("fix it"));
    fireEvent.click(screen.getByText("Try again"));

    expect(screen.getByText("the screen")).toBeDefined();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("clears the error when resetKey changes, so navigating away is a way out", () => {
    quiet();
    function Harness() {
      const [screenName, setScreenName] = useState("history");
      return (
        <>
          <button onClick={() => setScreenName("plan")}>navigate</button>
          <ErrorBoundary resetKey={screenName}>
            <Boom throws={screenName === "history"} />
          </ErrorBoundary>
        </>
      );
    }
    render(<Harness />);
    expect(screen.getByRole("alert")).toBeDefined();

    fireEvent.click(screen.getByText("navigate"));

    expect(screen.getByText("the screen")).toBeDefined();
  });

  it("only offers the cache reset at the app root", () => {
    quiet();
    const { unmount } = render(
      <ErrorBoundary>
        <Boom throws />
      </ErrorBoundary>
    );
    expect(screen.queryByText(/cached app files/i)).toBeNull();
    unmount();

    render(
      <ErrorBoundary root>
        <Boom throws />
      </ErrorBoundary>
    );
    expect(screen.getByText(/cached app files/i)).toBeDefined();
  });

  it("drops caches and service workers but never the local database", async () => {
    quiet();
    const deleteCache = vi.fn().mockResolvedValue(true);
    const unregister = vi.fn().mockResolvedValue(true);
    const reload = vi.fn();
    vi.stubGlobal("caches", {
      keys: vi.fn().mockResolvedValue(["workbox-precache"]),
      delete: deleteCache,
    });
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { getRegistrations: vi.fn().mockResolvedValue([{ unregister }]) },
    });
    Object.defineProperty(window, "location", { configurable: true, value: { reload } });
    const deleteDatabase = vi.fn();
    vi.stubGlobal("indexedDB", { deleteDatabase });

    render(
      <ErrorBoundary root>
        <Boom throws />
      </ErrorBoundary>
    );
    fireEvent.click(screen.getByText(/cached app files/i));
    await vi.waitFor(() => expect(reload).toHaveBeenCalled());

    expect(deleteCache).toHaveBeenCalledWith("workbox-precache");
    expect(unregister).toHaveBeenCalled();
    // The workouts are the one thing here that cannot be downloaded again.
    expect(deleteDatabase).not.toHaveBeenCalled();
  });
});
