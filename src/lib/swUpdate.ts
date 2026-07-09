// A new service worker installing in the background doesn't take over the
// already-running page — the JS already loaded in memory keeps executing
// until the next fresh load. Without surfacing that, users sit on stale
// (possibly broken) code until they happen to force-quit and reopen the
// PWA. This is a tiny pub-sub store so a banner component can react to
// "a new version is ready" without needing a React context provider.

type Listener = () => void;

let needRefresh = false;
let reload: (() => void) | null = null;
const listeners = new Set<Listener>();

export function setSWUpdateReady(reloadFn: () => void): void {
  needRefresh = true;
  reload = reloadFn;
  listeners.forEach((l) => l());
}

export function subscribeSWUpdate(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSWUpdateReady(): boolean {
  return needRefresh;
}

export function applySWUpdate(): void {
  reload?.();
}
