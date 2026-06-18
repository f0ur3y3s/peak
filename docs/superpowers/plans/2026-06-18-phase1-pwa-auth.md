# Phase 1: PWA + Supabase Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the gym app installable as a PWA and gate all screens behind Supabase email/password authentication.

**Architecture:** A Supabase client singleton (`src/lib/supabase.ts`) is imported wherever auth is needed. `App.tsx` reads the Supabase session on mount and subscribes to `onAuthStateChange` — rendering `AuthScreen` when no session exists, the normal router when authenticated. A runtime cache-first service worker (`public/sw.js`) caches all same-origin GET responses so the app shell loads offline after the first visit. SW is registered only in production to avoid breaking Vite HMR in development.

**Tech Stack:** React 18, TypeScript 5, Vite 6, `@supabase/supabase-js`, Web Service Worker API, `pwa-asset-generator` (icon generation, one-time dev tool)

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `package.json` | Modify | Add `@supabase/supabase-js` |
| `.gitignore` | Create | Ignore `.env.local`, `node_modules`, `dist` |
| `.env.local` | Create | Supabase URL + anon key (gitignored) |
| `src/lib/supabase.ts` | Create | Supabase client singleton |
| `src/screens/AuthScreen.tsx` | Create | Email/password login form |
| `src/App.tsx` | Modify | Session state, auth gate, sign-out handler |
| `src/components/TopBar.tsx` | No change | Already has `right: React.ReactNode` prop — sign-out button passed through that |
| `public/manifest.json` | Create | PWA identity, colours, icons |
| `public/icons/icon-192.png` | Create | PWA home screen icon |
| `public/icons/icon-512.png` | Create | PWA splash / store icon |
| `public/sw.js` | Create | Runtime cache-first service worker |
| `index.html` | Modify | Add `<link rel="manifest">` |
| `src/main.tsx` | Modify | Register service worker (prod only) |

---

## Task 1: Install Supabase + scaffold environment files

**Files:**
- Modify: `package.json`
- Create: `.gitignore`
- Create: `.env.local`

- [ ] **Step 1: Install the Supabase JS client**

```bash
npm install @supabase/supabase-js
```

Expected: `package.json` now lists `"@supabase/supabase-js"` under `dependencies`.

- [ ] **Step 2: Create `.gitignore`**

Create `/home/f0ur3y3s/repos/peak/.gitignore`:

```
node_modules/
dist/
.env.local
.env.*.local
.superpowers/
```

- [ ] **Step 3: Create `.env.local` with placeholder values**

Create `/home/f0ur3y3s/repos/peak/.env.local`:

```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

> **Note:** Replace these with real values from the Supabase dashboard → Project Settings → API. The anon key is safe to use client-side (RLS policies protect the data).

- [ ] **Step 4: Type-check to confirm install is clean**

```bash
npx tsc -b --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .gitignore
git commit -m "feat: install @supabase/supabase-js and scaffold .gitignore"
```

---

## Task 2: Create the Supabase client singleton

**Files:**
- Create: `src/lib/supabase.ts`

- [ ] **Step 1: Create the client**

Create `src/lib/supabase.ts`:

```ts
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

- [ ] **Step 2: Type-check**

```bash
npx tsc -b --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase.ts
git commit -m "feat: add Supabase client singleton"
```

---

## Task 3: Create AuthScreen

**Files:**
- Create: `src/screens/AuthScreen.tsx`

The form matches the existing design system: `#0f0f0f` background, electric-lime (`hsl(var(--primary))`) accents, DM Mono font. It calls `supabase.auth.signInWithPassword` and shows an inline error on failure. It does not navigate on success — `App.tsx` reacts to the session change automatically.

- [ ] **Step 1: Create the component**

Create `src/screens/AuthScreen.tsx`:

```tsx
import { useState, FormEvent } from "react";
import { supabase } from "@/lib/supabase";

export function AuthScreen() {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (authError) setError(authError.message);
  }

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "hsl(var(--background))",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 24px",
      }}
    >
      {/* Wordmark */}
      <p
        style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: 32,
          fontWeight: 500,
          color: "hsl(var(--primary))",
          letterSpacing: "0.08em",
          marginBottom: 40,
        }}
      >
        PEAK
      </p>

      <form
        onSubmit={handleSubmit}
        style={{
          width: "100%",
          maxWidth: 360,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <input
          type="email"
          placeholder="Email"
          autoComplete="email"
          required
          value={email}
          onChange={e => setEmail(e.target.value)}
          style={{
            background: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: 10,
            padding: "12px 14px",
            color: "hsl(var(--foreground))",
            fontFamily: "'DM Mono', monospace",
            fontSize: 14,
            outline: "none",
            width: "100%",
            boxSizing: "border-box",
          }}
        />
        <input
          type="password"
          placeholder="Password"
          autoComplete="current-password"
          required
          value={password}
          onChange={e => setPassword(e.target.value)}
          style={{
            background: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: 10,
            padding: "12px 14px",
            color: "hsl(var(--foreground))",
            fontFamily: "'DM Mono', monospace",
            fontSize: 14,
            outline: "none",
            width: "100%",
            boxSizing: "border-box",
          }}
        />

        {error && (
          <p
            style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: 12,
              color: "#ff4d4d",
              margin: 0,
            }}
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            marginTop: 4,
            background: "hsl(var(--primary))",
            color: "#000",
            border: "none",
            borderRadius: 10,
            padding: "13px 0",
            fontFamily: "'DM Mono', monospace",
            fontSize: 13,
            fontWeight: 500,
            letterSpacing: "0.06em",
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.6 : 1,
            width: "100%",
          }}
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc -b --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/screens/AuthScreen.tsx
git commit -m "feat: add AuthScreen login form"
```

---

## Task 4: Gate App.tsx with session state

**Files:**
- Modify: `src/App.tsx`

`getSession()` is called on mount; `onAuthStateChange` keeps session state live. Both the initial load path and the subscription are cleaned up correctly. The app renders `<AuthScreen />` when `session` is `null`, and the existing router when authenticated.

- [ ] **Step 1: Update App.tsx**

Replace the full contents of `src/App.tsx` with:

```tsx
import { useState, useEffect } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { NavBar, type Screen } from "@/components/NavBar";
import { TopBar } from "@/components/TopBar";
import { TemplateDetail } from "@/screens/TemplateDetail";
import { ActiveWorkout } from "@/screens/ActiveWorkout";
import { HistoryScreen } from "@/screens/HistoryScreen";
import { AuthScreen } from "@/screens/AuthScreen";

type AppScreen = "template" | "workout" | "history";

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [screen, setScreen]   = useState<AppScreen>("template");
  const [nav, setNav]         = useState<Screen>("workout");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => subscription.unsubscribe();
  }, []);

  // undefined = still loading initial session from localStorage
  if (session === undefined) return null;

  if (session === null) return <AuthScreen />;

  const handleNav = (tab: Screen) => {
    setNav(tab);
    if (tab === "history") setScreen("history");
    else setScreen("template");
  };

  return (
    <div
      className="bg-background min-h-screen relative"
      style={{ maxWidth: 430, margin: "0 auto" }}
    >
      <div className="scroll-area" style={{ paddingBottom: 60 }}>
        {screen === "template" && (
          <TemplateDetail
            onStart={() => setScreen("workout")}
            onBack={() => {}}
          />
        )}
        {screen === "workout" && (
          <ActiveWorkout
            onBack={() => setScreen("template")}
          />
        )}
        {screen === "history" && (
          <HistoryScreen
            onBack={() => {
              setScreen("template");
              setNav("workout");
            }}
          />
        )}
      </div>
      <NavBar active={nav} onNav={handleNav} />
    </div>
  );
}
```

> **Note:** Sign-out wiring happens in Task 5. `App.tsx` only handles the session gate here.

- [ ] **Step 2: Type-check**

```bash
npx tsc -b --noEmit
```

Expected: no errors.

- [ ] **Step 3: Verify in browser — auth gate works**

Run `npm run dev`, open `http://localhost:5173`. The app should show the `AuthScreen` (PEAK wordmark + sign-in form) because `.env.local` still has placeholder values.

Expected: sign-in form visible, no crash, no blank screen.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat: gate app with Supabase session — renders AuthScreen when logged out"
```

---

## Task 5: Add sign-out to screens that show a TopBar

**Files:**
- Modify: `src/screens/TemplateDetail.tsx`
- Modify: `src/screens/ActiveWorkout.tsx`
- Modify: `src/screens/HistoryScreen.tsx`

`TopBar` already accepts a `right` prop (`React.ReactNode`). No changes to `TopBar.tsx` are needed. The sign-out button is passed as `right` on the `TemplateDetail` screen only (the default landing screen after login). Active workout and history screens don't need it — the user can return to template detail first.

- [ ] **Step 1: Read TemplateDetail.tsx to find the TopBar usage**

Open `src/screens/TemplateDetail.tsx` and locate the `<TopBar ... />` line.

- [ ] **Step 2: Add onSignOut prop + pass sign-out button to TopBar**

In `src/screens/TemplateDetail.tsx`:

Add `onSignOut: () => void` to the props interface and pass it as the `right` slot on `TopBar`:

```tsx
// Add to TemplateDetailProps interface:
onSignOut: () => void;

// Update the TopBar usage to add right prop:
<TopBar
  title={TEMPLATE.name}
  sub={`Last performed ${TEMPLATE.lastPerformed}`}
  right={
    <button
      onClick={onSignOut}
      style={{
        background: "none",
        border: "none",
        cursor: "pointer",
        color: "hsl(var(--muted-foreground))",
        fontFamily: "'DM Mono', monospace",
        fontSize: 11,
        letterSpacing: "0.05em",
        padding: "4px 8px",
      }}
    >
      sign out
    </button>
  }
/>
```

- [ ] **Step 3: Update App.tsx to pass onSignOut to TemplateDetail**

In `src/App.tsx`, update the `TemplateDetail` usage:

```tsx
{screen === "template" && (
  <TemplateDetail
    onStart={() => setScreen("workout")}
    onBack={() => {}}
    onSignOut={() => supabase.auth.signOut()}
  />
)}
```


- [ ] **Step 4: Type-check**

```bash
npx tsc -b --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/screens/TemplateDetail.tsx src/App.tsx
git commit -m "feat: add sign-out button to TemplateDetail TopBar"
```

---

## Task 6: Create PWA manifest and icons

**Files:**
- Create: `public/manifest.json`
- Create: `public/icons/icon.svg`
- Create: `public/icons/icon-192.png`
- Create: `public/icons/icon-512.png`

- [ ] **Step 1: Create the source SVG icon**

Create `public/icons/icon.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#0f0f0f"/>
  <text
    x="256" y="340"
    text-anchor="middle"
    font-family="system-ui, sans-serif"
    font-weight="700"
    font-size="280"
    fill="#e8ff47"
  >P</text>
</svg>
```

- [ ] **Step 2: Generate PNG icons from the SVG**

```bash
npx pwa-asset-generator public/icons/icon.svg public/icons --icon-only --favicon false --type png --background "#0f0f0f" --padding "10%"
```

This creates multiple sizes. We only need 192 and 512. After running, verify these exist:
```bash
ls public/icons/*.png
```

If `pwa-asset-generator` creates files with different names (e.g. `manifest-icon-192.maskable.png`), rename the 192 and 512 variants:

```bash
# Rename to the exact names referenced in manifest.json
# Adjust the source filename if pwa-asset-generator used a different name
mv public/icons/manifest-icon-192.maskable.png public/icons/icon-192.png 2>/dev/null || true
mv public/icons/manifest-icon-512.maskable.png public/icons/icon-512.png 2>/dev/null || true
```

- [ ] **Step 3: Create manifest.json**

Create `public/manifest.json`:

```json
{
  "name": "Peak",
  "short_name": "Peak",
  "description": "Offline-first workout tracker",
  "start_url": "/",
  "display": "standalone",
  "orientation": "portrait",
  "theme_color": "#0f0f0f",
  "background_color": "#0f0f0f",
  "icons": [
    {
      "src": "/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "/icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ]
}
```

- [ ] **Step 4: Commit**

```bash
git add public/manifest.json public/icons/
git commit -m "feat: add PWA manifest and app icons"
```

---

## Task 7: Create the service worker

**Files:**
- Create: `public/sw.js`

Runtime cache-first: caches same-origin GET responses as they are fetched. Pre-caches `/` and `/index.html` on install. Cleans old cache versions on activate.

- [ ] **Step 1: Create `public/sw.js`**

```js
const CACHE = "peak-v1";
const PRECACHE = ["/", "/index.html"];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE).then(async cache => {
      const cached = await cache.match(event.request);
      if (cached) return cached;
      const response = await fetch(event.request);
      if (response.ok) cache.put(event.request, response.clone());
      return response;
    })
  );
});
```

- [ ] **Step 2: Commit**

```bash
git add public/sw.js
git commit -m "feat: add cache-first service worker"
```

---

## Task 8: Wire manifest link + SW registration

**Files:**
- Modify: `index.html`
- Modify: `src/main.tsx`

`index.html` already has `theme-color` and Apple meta tags. Only the manifest `<link>` is missing.

- [ ] **Step 1: Add manifest link to index.html**

In `index.html`, add after `<link rel="icon" ...>`:

```html
<link rel="manifest" href="/manifest.json" />
```

The full `<head>` block should look like:

```html
<head>
  <meta charset="UTF-8" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <link rel="manifest" href="/manifest.json" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <meta name="theme-color" content="#0f0f0f" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <title>GymApp</title>
</head>
```

- [ ] **Step 2: Register service worker in main.tsx (production only)**

Replace `src/main.tsx` with:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js");
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

- [ ] **Step 3: Type-check**

```bash
npx tsc -b --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add index.html src/main.tsx
git commit -m "feat: wire manifest link and production-only SW registration"
```

---

## Task 9: Full build verification + browser smoke test

**Files:** none (verification only)

- [ ] **Step 1: Run a production build**

```bash
npm run build
```

Expected: exits 0, `dist/` directory created with bundled JS/CSS.

- [ ] **Step 2: Preview the production build**

```bash
npm run preview
```

Open `http://localhost:4173` in Chrome.

- [ ] **Step 3: Verify PWA installability in Chrome DevTools**

Open DevTools → Application → Manifest. Confirm:
- App name shows "Peak"
- Icons appear (192 and 512)
- No manifest errors

Open DevTools → Application → Service Workers. Confirm:
- `sw.js` is registered and shows "activated and running"

- [ ] **Step 4: Verify auth gate**

With placeholder `.env.local` values, the PEAK login screen should appear. Attempting sign-in should show an error message (invalid URL/key), not a blank screen or crash.

- [ ] **Step 5: Replace .env.local with real Supabase credentials**

In the Supabase dashboard:
1. Create a new project (or use existing)
2. Go to Project Settings → API
3. Copy "Project URL" → `VITE_SUPABASE_URL`
4. Copy "anon public" key → `VITE_SUPABASE_ANON_KEY`
5. Create a user: Authentication → Users → Add user

Update `.env.local` with real values, restart dev server (`npm run dev`), and sign in.

Expected: login succeeds, app transitions to the workout template screen, "sign out" button visible in TopBar.

- [ ] **Step 6: Verify session persists across reload**

After signing in, hard-reload the page (`Cmd+Shift+R` / `Ctrl+Shift+R`).

Expected: app loads directly to the workout screen (no login screen), proving session is stored in `localStorage` and auto-loaded.

- [ ] **Step 7: Final commit**

```bash
git add -A
git status  # confirm only expected files are staged
git commit -m "feat: Phase 1 complete — PWA installable, Supabase auth gate working"
```
