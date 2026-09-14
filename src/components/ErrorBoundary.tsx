import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Changing this clears a caught error — used with the current screen, so
   *  navigating away from whatever crashed actually gets you out of it. */
  resetKey?: unknown;
  /** Shown instead of the default heading, to say what failed. */
  title?: string;
  /** Offers the cache reset, which only makes sense at the app root. */
  root?: boolean;
}

interface ErrorBoundaryState {
  error: Error | null;
  clearing: boolean;
}

/**
 * Nothing in this app caught render errors, so a single bad record — a
 * session whose exercises array came back undefined, a template pulled from a
 * future schema version — took the entire PWA to a white screen with no text,
 * no navigation and nothing in the UI to explain it. On a phone that is
 * indistinguishable from the app being gone, and the standard fix (reload)
 * re-runs the same code against the same data and white-screens again.
 *
 * The boundary keeps the app on screen and gives the error somewhere to be
 * read. Screen-level instances sit inside the chrome, so the nav bar survives
 * and the other tabs are still reachable; the root instance is the last
 * resort, and only it offers to drop the cached app files, which is the way
 * out of a genuinely broken deploy.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, clearing: false };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // No error reporting service to send this to, so the console is the only
    // record — worth keeping, since the component stack is what actually
    // names the screen at fault.
    console.error("Render error caught by boundary:", error, info.componentStack);
  }

  componentDidUpdate(prev: ErrorBoundaryProps): void {
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  private retry = (): void => this.setState({ error: null });

  /** Drops the service worker and its precache so a reload fetches the
   *  current build. Deliberately leaves IndexedDB alone: the workouts are the
   *  one thing here that cannot be downloaded again. */
  private clearAppCache = async (): Promise<void> => {
    this.setState({ clearing: true });
    try {
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
    } catch {
      // Falling through to the reload is still the best available outcome.
    }
    window.location.reload();
  };

  render(): ReactNode {
    const { error, clearing } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="px-5 py-10 flex flex-col gap-5" role="alert">
        <div className="flex flex-col gap-2">
          <p className="text-2xl font-bold tracking-tight">
            {this.props.title ?? "Something went wrong"}
          </p>
          <p className="text-subtext text-muted-foreground" style={{ lineHeight: 1.5 }}>
            Your workouts are safe — they are stored on this device and synced to your
            account. This screen just failed to draw.
          </p>
        </div>

        <pre
          className="font-mono text-caption"
          style={{
            background: "hsl(var(--surface-sunken))",
            border: "1px solid hsl(var(--border))",
            borderRadius: 10,
            padding: 12,
            margin: 0,
            color: "hsl(var(--muted-foreground))",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {error.message || String(error)}
        </pre>

        <div className="flex flex-col gap-2.5">
          <Button onClick={this.retry} style={{ height: 48 }}>
            Try again
          </Button>
          <Button variant="outline" style={{ height: 48 }} onClick={() => window.location.reload()}>
            Reload
          </Button>
          {this.props.root && (
            <Button
              variant="ghost"
              className="text-muted-foreground"
              style={{ height: 48 }}
              disabled={clearing}
              onClick={this.clearAppCache}
            >
              {clearing ? "Clearing…" : "Clear cached app files and reload"}
            </Button>
          )}
        </div>
      </div>
    );
  }
}
