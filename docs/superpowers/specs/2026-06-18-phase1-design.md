# Phase 1 Design — PWA + Supabase Auth

**Date:** 2026-06-18
**Scope:** Make the gym app installable as a PWA and gate it behind email/password authentication using Supabase.

---

## Decisions

| Question | Decision |
|---|---|
| Auth method | Email + password with Supabase session auto-refresh |
| Auth gate | Hard gate — login required before any screen is shown |
| Sign-up | No — account created manually in Supabase dashboard |
| PWA caching | Cache-first app shell (HTML, JS, CSS bundles) |
| Approach | Option A — minimal custom auth UI, no auth-ui-react library |

---

## PWA

### Files

**`public/manifest.json`**
Standard Web App Manifest. Key fields:
- `name`: "Peak" / `short_name`: "Peak"
- `display`: `standalone`
- `start_url`: `/`
- `theme_color`: `#0f0f0f`
- `background_color`: `#0f0f0f`
- `icons`: at minimum a 192×192 and 512×512 PNG in `public/icons/`

**`public/sw.js`**
Runtime cache-first service worker (Vite bundles have content-hashed filenames that aren't known at SW write time, so pre-caching a static list isn't viable without a build plugin):
1. On `install` — pre-cache only `/` and `/index.html` (stable URLs).
2. On `fetch` — for same-origin GET requests, serve from cache if present; otherwise fetch from network and add to cache. Non-GET and cross-origin requests pass through.
3. On `activate` — take control immediately (`clients.claim()`); delete any old cache versions by key.

**`index.html` additions**
```html
<link rel="manifest" href="/manifest.json" />
<meta name="theme-color" content="#0f0f0f" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
```

### Registration

`src/main.tsx` registers the service worker after React mounts:
```ts
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js');
  });
}
```

---

## Auth

### Environment

`.env.local` (gitignored):
```
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
```

### `src/lib/supabase.ts`

Creates and exports a single Supabase client:
```ts
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);
```

### `src/screens/AuthScreen.tsx`

Login-only form. Styled to match the existing dark design system (electric-lime accent, DM Mono font, `#0f0f0f` background).

Fields: email, password. Button: "Sign in". Inline error on failure.

Calls `supabase.auth.signInWithPassword({ email, password })`. On success the `onAuthStateChange` listener in `App.tsx` triggers the transition automatically — `AuthScreen` does not navigate itself.

### `src/App.tsx` changes

1. On mount: call `supabase.auth.getSession()`. Store session in state.
2. Subscribe to `supabase.auth.onAuthStateChange` — update session state on every change.
3. Render `<AuthScreen />` if `session === null`, otherwise render the existing screen router.
4. Pass an `onSignOut` prop to `TopBar` (calls `supabase.auth.signOut()`). `TopBar` renders a small sign-out icon button when the prop is provided.

Session persistence is handled by Supabase's default `persistSession: true` (stores in `localStorage`). No additional code required.

---

## File Changeset

| File | Action |
|---|---|
| `public/manifest.json` | Create |
| `public/sw.js` | Create |
| `public/icons/icon-192.png` | Create (placeholder or real icon) |
| `public/icons/icon-512.png` | Create (placeholder or real icon) |
| `index.html` | Add PWA meta tags |
| `src/main.tsx` | Add service worker registration |
| `src/lib/supabase.ts` | Create |
| `src/screens/AuthScreen.tsx` | Create |
| `src/App.tsx` | Add session gate + sign-out |
| `src/components/TopBar.tsx` | Add optional sign-out button |
| `.env.local` | Create (gitignored) |
| `.gitignore` | Add `.env.local` |
| `package.json` | Add `@supabase/supabase-js` |

---

## Out of Scope

- Sign-up flow (account created in Supabase dashboard)
- Forgot password / email reset
- Multi-user support
- IndexedDB wiring (Phase 2)
- Sync engine (Phase 3)
