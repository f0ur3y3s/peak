# Setup — spin up a new Claude Code session on this branch

Do this before touching anything in `HANDOFF.md` (that file is the *status*
doc — what's done, what's left; this file is just "how do I get a working
environment"). Run these from the repo root, branch `redesign/phased`.

## 1. Branch

```
git checkout redesign/phased
git log --oneline restart..HEAD   # sanity check — should show 13 commits, tree clean
git status                        # should say "nothing to commit, working tree clean"
```

If the tree isn't clean or the log looks different, stop and re-read
`HANDOFF.md`'s "known environment quirk" note before assuming anything —
another session may have touched this repo since.

## 2. Install dependencies

```
npm install
```

## 3. Local env file (gitignored — won't exist on a fresh checkout)

Create `.env` in the repo root from `.env.example`:

```
VITE_SUPABASE_URL=https://placeholder.supabase.co
VITE_SUPABASE_ANON_KEY=placeholder-anon-key
VITE_LOCAL_PREVIEW=1
```

This skips real Supabase auth in dev only (`LOCAL_PREVIEW` in `src/App.tsx`,
gated on `import.meta.env.DEV` — zero effect on a production build). All real
app data (templates, exercises, sessions, history) lives in IndexedDB via
`src/lib/db.ts`; only auth and cross-device sync need a real Supabase project,
and neither is needed to do UI work.

## 4. Run it

```
npm run dev
```

Open `http://localhost:5173`. **Vite only reads `.env` at server startup** — if
you create or edit it after the server is already running, restart `npm run
dev`, don't expect HMR to pick it up.

A fresh IndexedDB seeds itself automatically with a "Push Day A" template
(Bench Press / Incline DB Press / Tricep Pushdown) — see the `upgrade()`
migration in `lib/db.ts` if you need to know why.

## 5. Verify the build before and after any change

```
npx tsc -b
npx vite build   # then rm -rf dist — it's gitignored, not needed for dev
```

## 6. Skills — check what's actually available before relying on any of them

- **`code-review`** — used after every phase last session (`Skill(code-review,
  args: "medium")`, runs as a background fork). This should be a
  built-in/default skill; if it's not in your available-skills list, ask the
  user rather than assume.
- **`claude-in-chrome`** — browser automation, used to live-verify every UI
  change (this caught 3 real bugs last session that `tsc`/build alone
  wouldn't have — see `HANDOFF.md`'s "Verification pattern" section). **Not
  enabled by default.** Run `/chrome` or restart Claude Code for a one-time
  enable prompt. If you can't enable it, you can still do the remaining work
  in `HANDOFF.md` from code alone, just with less confidence — say so.
- **`impeccable`** (`/impeccable audit`, `/impeccable critique`) — used once,
  already done. Its output is persisted at
  `.impeccable/critique/2026-08-20T18-43-30Z__localhost.md` (already committed
  — read that instead of re-running it). It lives at
  `~/.claude/skills/impeccable` on the machine that ran it, which is a
  **user-level** install, not part of this repo — a different machine/account
  may not have it. **Nothing left in `HANDOFF.md`'s remaining-work list
  requires it.** It's only relevant if you want to redo the closing step
  `HANDOFF.md` suggests (re-run audit/critique at the very end to confirm
  scores improved) — if it's unavailable then, skip that step or ask the user.

## 7. Now read `HANDOFF.md`

That's where the actual status, remaining work, and recommended order live.
