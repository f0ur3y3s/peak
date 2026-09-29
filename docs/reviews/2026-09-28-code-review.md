# Code review — 2026-09-28

Whole-codebase review of Peak at `c43dfcc` (branch `claude/homelab-self-hosting-stack-7yy0su`):
`src/` (client), `supabase/` (migrations and Edge Functions), `public/push-sw.js`,
build/test config and docs. About 14k lines.

**How it was checked.** `tsc -b` and `vite build` pass. `vitest`: 434/434 pass,
but one suite never loads (T1). Each area was read in full. The
highest-severity claims were re-read against the code, and several were
reproduced with throwaway tests outside the repo: sync bugs S1–S4 and S7, the
stepper float noise, the lb/kg round-trip, Tailwind's generated keyframes, and
vite-plugin-pwa's `autoUpdate` behaviour. Nothing in the app was changed as
part of the review.

**Verdict.** The code is careful at the level of individual functions: race
guards, wall-clock timers, accessibility work, and comments that explain *why*.
The serious problems are **systemic**:

1. The sync protocol trusts client clocks and has no server-side conflict rule.
   It can lose data permanently and quietly across devices (S1–S3).
2. The push tables let a signed-in user write columns the server then acts on
   (P1, P2).
3. Two unauthenticated email paths have no rate limit (P3, P4).
4. Two UI paths throw away an in-progress workout or edit (W1, W2), and every
   deploy reloads the page mid-workout (W3).

Most other findings come from the same few structural issues: `db.ts`,
`ActiveWorkout`, `TemplateDetail` and `App` each do too much, and the same
state is kept in two places (the timer deadline, template vs exercises,
screen vs nav).

Severity: 🔴 data loss or security · 🟠 user-visible bug · 🟡 minor bug · 🔵 design (SOC / DRY / KISS) · ⚪ cleanup

---

## 🔴 Critical

### Sync (`src/lib/sync.ts`, migrations 001/009)

**S1. Rows that reach the server late are never pulled by devices that already synced past them.**
- Where: `sync.ts:113-124, 298`.
- Cause: the pull runs `updated_at > watermark`, but `updated_at` is set by the *writing client* when the edit happened, not when the row reached the server.
- Example: the phone logs a workout offline at 18:00. The laptop syncs at 19:00. When the phone uploads at 20:00, the laptop never receives that workout.
- Remote deletes and draft merges are missed in the same way, and a writer with a slow clock causes the same problem.
- Fix: have the server stamp every write, with a `bigint` sequence or `clock_timestamp()` set by a trigger. Pull on that stamp using keyset paging, and keep the client `updated_at` only for last-write-wins comparison.

**S2. A push always overwrites the server row, even when the server copy is newer.**
- Where: `sync.ts:150-213`.
- Deletes are conditional (`.lt("updated_at")`); upserts are not.
- The push runs before the pull, so an older offline edit replaces a newer one. The two devices then disagree permanently, because S1 stops the newer copy from coming back.
- `getPushedAt` resetting to 0 after a clock jump (`db.ts:826`) re-pushes every record and makes this worse.
- Fix: enforce last-write-wins on the server, with `ON CONFLICT … DO UPDATE … WHERE excluded.updated_at > t.updated_at` or a `BEFORE UPDATE` trigger.

**S3. Upserts never clear `deleted_at`, and the test fake hides it.**
- Where: `sync.ts:153-196`.
- Only the draft upsert sends `deleted_at: null`. PostgREST leaves columns it isn't sent unchanged, so a record edited after a remote delete stays deleted on the server.
- Example: re-seeding `ppl-v1-*` on a new device for an account that had deleted the program. The program then exists only on that device.
- `fakeSupabase.ts:189` adds `deleted_at: null` to every upsert, so the tests pass against behaviour the real server doesn't have.
- Fix: send `deleted_at: null` from a per-table mapper (see D2), and make the fake behave like PostgREST.

### Security

**P1. Signed-in users can write to the push tables freely: SSRF, and blocking every user's alerts.**
- Where: `010_rest_push.sql:25-78`, `send-rest-push/index.ts:78-127`.
- RLS only checks `user_id`, so a client can set `endpoint` (any URL, including `http://kong:8000` or `http://rest:3000` on the self-hosted network), `attempts` (e.g. −32768), `due_at` (1970), `delivered_at` and unlimited `title`/`body`, and can create any number of subscriptions.
- The function then sends a blind POST to that URL. The result leaks back through the attacker's own rows (delivered / attempts / deleted), which makes it a port scanner.
- Thousands of rows due in 1970 with retries that never run out fill every `order=due_at limit 50` batch, so no one else's rest alert is sent.
- Fix:
  - Accept only `https` endpoints on the known push-service hosts.
  - Add CHECK constraints: `attempts between 0 and 3`, text lengths, `due_at` within now…+15 min.
  - Take INSERT/UPDATE on `scheduled_pushes` away from clients and schedule through a `schedule_rest_push()` RPC.
  - Cap subscriptions per user.

**P2. A scheduled push can point at another user's subscription.**
- Where: `010_rest_push.sql:47,74-78`.
- Foreign keys skip RLS, and WITH CHECK only looks at `user_id`. User A can send A's text to user B's phone.
- It also happens by accident: sign-out (`App.tsx:320`) never clears `peak-push-subscription-id` from localStorage or deletes the row, so the next account on that device schedules against the previous account's subscription.
- Fix: a composite foreign key `(subscription_id, user_id)` → `push_subscriptions (id, user_id)`, and `disableRestPush()` on sign-out.

**P3. Anyone can send the admin unlimited email.**
- Where: `004:25-29` (the anon INSERT policy is `with check (true)`) plus the trigger (`011`) and `notify-account-request`.
- The function's shared secret protects the function, not the email. Every anon INSERT on `account_requests` sends one.
- Fields have no length limit, and `name` goes straight into the subject (`notify-account-request/index.ts:107`).
- Fix: CHECK length and format limits, a rate limit or digest in the trigger, and truncating the subject. Or move the form behind an Edge Function with a captcha or IP limit.

**P4. `request-signin-code` allows email bombing, blocks the victim's sign-in, and reveals who has an account.**
- Where: `request-signin-code/index.ts:107-160`.
- It is effectively unauthenticated, and it bypasses GoTrue's own send limit.
- A loop floods a user's inbox. Each call issues a new code, so the code the real user is typing keeps becoming invalid.
- Registered emails can be told apart by response time (generate + Resend only run for real accounts) and by status (500 only for real accounts).
- Fix: a per-email and per-IP cooldown and daily cap. Always return 200 straight after the lookup and send in `EdgeRuntime.waitUntil`.

### Workout data

**W1. Starting a workout from the Plan list silently overwrites the one in progress.**
- Where: `App.tsx:246-250`, `TemplatesScreen.tsx:275-286`.
- TemplateDetail refuses to start a second workout (`TemplateDetail.tsx:272-280`); this path doesn't check. The draft is a singleton (`db.ts:663`), and the first set logged on the new template replaces all the old one's sets.
- Fix: put the guard once in `App`'s `onStartTemplate` (a shared `startWorkout()`) and delete the per-screen copy.

**W2. Reordering exercises and then making any other edit puts the old order back.**
- Where: `TemplateDetail.tsx:176-202`.
- The reorder handler updates `exercises` but not `template`. Rename, notes, delete and config edits all build from the stale `template` and save its old `order`.
- Fix: `setTemplate(updated)`. Better: keep one `template` state and derive `exercises` from it (D5).

**W3. Every deploy reloads the page mid-workout, and the update banner never shows.**
- Where: `vite.config.ts:10`.
- With `registerType: "autoUpdate"`, vite-plugin-pwa calls `window.location.reload()` when the new worker activates and never calls `onNeedRefresh`. That makes `swUpdate.ts`, `UpdateBanner` and `updateSW(true)` dead code.
- The rest timer only lives in React state, so it is lost.
- Fix: `registerType: "prompt"`, which is the design the existing banner already expects.

**B1. Following `docs/rest-push.md` on hosted Supabase leaves push dead.**
- The sweep and the account-request trigger send a shared secret, not a JWT, and hosted functions check JWTs by default. There is no `supabase/config.toml` and no `--no-verify-jwt` in the docs.
- Fix: commit `supabase/config.toml` with `verify_jwt = false` for `send-rest-push` and `notify-account-request`.

---

## 🟠 User-visible bugs

| # | Where | Bug | Fix |
|---|---|---|---|
| 1 | `ActiveWorkout.tsx:87-110`, `TimerSheet.tsx:29,240` | The background rest push ignores ±30s. Each component computes its own deadline, so the push arrives 30s early or late. | Keep one `endsAt` in ActiveWorkout and pass it down with `onAdjust`. |
| 2 | `ActiveWorkout.tsx:164-166` | Resume always opens exercise 1. Line 166 overrides the `firstUnfinished` choice. | `setActiveId((firstUnfinished ?? hydrated[0])?.id)` |
| 3 | `App.tsx:77-152` | Bootstrap can cancel itself. The effect is keyed on the `session` object, but a ref guard skips the second run for the same user. The landing screen never resolves and the startup sync/seed is skipped. | Key on `session?.user.id` and drop the ref guard. Same for the sync effect at `:154-186`, which rebuilds its interval on every token refresh. |
| 4 | `App.tsx:146,163,223` | A seed-triggered `dataVersion` bump remounts the open screen mid-workout. The timer, `restEdited` and half-typed input are lost, and the Summary flips back to an empty workout. | Defer the bump while `screen === "workout"`, or have screens reload their own data on a change event. |
| 5 | `sync.ts:433-442` | Draft merge matches on `templateId` only, so yesterday's sets merge into today's workout of the same template. | Also match `startedAt`; otherwise the newer draft wins whole. |
| 6 | `sync.ts:289-306` | Offset paging while rows are changing skips rows, and the watermark then moves past them. | Keyset paging on `(stamp, id)`. |
| 7 | `ActiveWorkout.tsx:315-344` | Double-tapping Save when adding an exercise adds it twice (duplicate keys; logged sets land on both cards). The same pattern creates duplicates in `TemplatesScreen.handleCreate`, `ExercisesScreen.handleCreate` and `ExercisePicker`. | Guard in-flight, or close before awaiting. |
| 8 | `ExerciseCard.tsx:66-70` | A blank weight logs a 0 kg set (`Number("") === 0`). `SetEditor` already guards this. | One `parseWeightInput()` in lib, used by all three editors. |
| 9 | `SetEditor.tsx:83`, `ExerciseCard.tsx:392`, `ExerciseConfigEditor.tsx:158` | Comma decimals ("62,5") are rejected, and the steppers have no `inputMode`. | The same parser (accepting a comma), plus `inputMode`. |
| 10 | `TimerSheet.tsx:193-198` | The full sheet can only be dragged from a 4 px handle, and there is no `onPointerCancel`, so it can get stuck. | A ≥44 px drag region, treat cancel as up, and add a Minimise button (also fixes a11y). |
| 11 | `restPush.ts:183-217` | Schedule and cancel are separate unordered keepalive fetches, and cancel may go out with an expired token, so the push can arrive while you're watching the timer. | Sequenced schedule/cancel through an RPC; refresh the session before cancel. |
| 12 | `restPush.ts:106-150`, `push-sw.js` | A subscription that dies or rotates is never re-registered, and the 409 is swallowed, so pushes stop quietly. | Re-register on start/sign-in, handle `pushsubscriptionchange`, clear the stored id on 409. |
| 13 | `send-rest-push/index.ts:102-127` | The `delivered_at` claim never expires, sends are serial, and fetch has no timeout. If the function is killed, claimed pushes are lost. | A `claim_due_pushes()` RPC with `SKIP LOCKED` plus a lease, `allSettled`, `AbortSignal.timeout`. |
| 14 | `ProfileScreen.tsx:67-86` | Sound → Off while the permission prompt is open still registers push. The help text is wrong after a reload. | Re-check the mode after awaiting; initialise from the real state. |
| 15 | `HistoryScreen.tsx:55-70` | Editing or deleting a session doesn't recompute PR flags on later sessions. `getPR` and `recomputeSessionPRs` define "PR" differently. | Recompute everything after the edit; one PR definition in lib. |

## 🟡 Minor bugs

- **Stepper float noise.** 32.2 lb → `31.200000000000003` (`ExerciseCard.tsx:384-407`, `ExerciseConfigEditor.tsx:137`). Round inside one shared `step()`.
- **Saving without touching the weight rewrites the stored kg.**
  - `ExerciseConfigEditor.tsx:184,305` turns 20 kg into 20.003.
  - `SetEditor.tsx:39,98` has the same drift across units.
  - Fix: if the text is unchanged, save the original kg value.
- **+30s can shorten a rest longer than 10 min** (`TimerSheet.tsx:242`, which clamps to 600).
- **Set IDs are `s${Date.now()}`** (`ActiveWorkout.tsx:192`), so two IDs can collide and a delete removes both sets. Use `crypto.randomUUID()`.
- **Rest push after Finish.** The timer isn't cleared (`ActiveWorkout.tsx:462`).
- **A load error followed by Add exercise overwrites the saved draft** (`ActiveWorkout.tsx:168,315`).
- **`handleNav` results can arrive out of order** (`App.tsx:196-214`). The previous account's rows can flash before the wipe (`:92-105`). The in-progress dot can stay lit (`:256`).
- **Failed saves still close the editor** (`TemplateDetail.tsx:254`). Uncontrolled rename/notes fields keep showing a value that failed to save (`:482-496`).
- **Unhandled rejections leave spinners or blank screens:**
  - `App.tsx:67,277,312`
  - `ActiveWorkout.tsx:170`
  - `TemplateDetail.tsx:100,111,274`
  - `TemplatesScreen.tsx:77,120,132`
  - `ExercisesScreen.tsx:36`
  - `ProfileScreen.tsx:45`
  - `HistoryAnalytics.tsx:335` ("Loading…" forever)
  - `ExercisePicker.tsx:31`
- **Chart tooltip stays open after changing metric/range** with the wrong unit (`HistoryAnalytics.tsx:324-330`).
- **Chart display:**
  - All-zero data draws a −8 to 8 axis (`:152`).
  - The trend value is rounded to an integer while the other stats show 0.1 (`:400`).
  - X-ticks are spaced by index, not time, so dates overlap (`:195`).
- **MuscleSelect:**
  - It filters by its own value, so a field holding "Other" or a custom name shows no options.
  - Partial queries get saved as the muscle.
  - The list stays open after Tab (`MuscleSelect.tsx:63,120,208`).
- **ExercisePicker:** if the name you type is already in this workout, it shows "No exercises found" and offers no create option (`:41-44`).
- **Weekly strip at a DST change** (`WorkoutHomeScreen.tsx:29-34`). The fixed `DAY_MS` arithmetic miscounts in a fall-back week.
- **`useWakeLock`** leaks a lock that resolves after cleanup (`useWakeLock.ts:24-46`).
- **Double notification on desktop/Android** from the in-page alert plus the push (`restAlert.ts:124`).
- **`.log-form` slide-in never runs** (`index.css:177`). Tailwind never generates the `slide-up` keyframes.
- **IndexedDB atomicity** (`db.ts`):
  - A write and its tombstone change are separate transactions (`:482-497, 552-560, 663-690`).
  - `reorderTemplates` clears tombstones for deleted IDs (`:474`).
  - A write in the same millisecond as the push start is skipped (`sync.ts:133`, `db.ts:852` uses `>`).
  - A timed-out blocked open leaks a connection (`db.ts:140,271`).
- **`request-signin-code`:**
  - `linkRes.json()` runs before the `ok` check, and an uncaught throw returns a 500 without CORS headers (`:107,130,141`).
  - The user lookup may only see the first 50 users. `?email=` isn't a GoTrue filter as far as I know; check against your GoTrue version (`:107-118`).
- **Rescheduling can race the claim, so a push goes out early with old text** (`send-rest-push/index.ts:102`).
- **`workout_sessions` is still keyed on `id` alone**; 007 only changed templates and library.
- **Migrations:**
  - Re-running `002` or `010`, both labelled "safe to re-run", restores the hardcoded hosted URL over 011.
  - `002` needs a table that `004` creates, so file order fails on a fresh database.
  - `001` isn't idempotent.

---

## 🔵 Design: separation of concerns, DRY, KISS

**D1. `db.ts` (931 lines) does five jobs:**
- connection and schema upgrades
- seeding
- CRUD
- domain calculations: PRs, volume, grouping, next-up template
- a raw API used only by sync

Split it into `db/connection`, per-store repositories, `domain/stats.ts` (pure and testable), and `sync/localStore.ts`. `getExercises` → `lastSetsFor` does a full index scan per exercise; that's fine now but O(n²) as history grows.

**D2. Sync is written out once per table.**
- `pushChanges` ×3, `pullChanges` ×3, `pushTombstones` ×4 branches, plus `get*UpdatedSince` ×3, `put*Raw` ×4 and `delete*Raw` ×4.
- A `SYNC_TABLES` descriptor (`{store, table, toRow, fromRow}`) with generic loops removes about 150 lines.
- It would also have prevented S3, where the `deleted_at: null` fix reached only one of four copies.
- Move the UI status store out of `sync.ts` too.

**D3. One source of truth for each piece of state.** Four bugs above come from state kept in two places:
- the timer deadline (ActiveWorkout vs TimerSheet)
- `template` vs `exercises` (TemplateDetail)
- `screen` vs `nav` (App starts as `plan`/`workout`, already out of step)
- `dataVersion` remounts vs screen state

**D4. `ActiveWorkout` (635 lines).**
- `handleFinish` (`:346-468`) mixes PR detection, building the session and merging progression into the template with UI state.
- Extract pure functions to lib, with tests: `detectPRs`, `buildSession`, `mergeWorkoutIntoTemplate`, `hydrateFromDraft`.
- Extract hooks: `useWorkoutDraft(templateId)` and `useRestPush(endsAt)`.
- Replace the five hand-written `persistDraft({...})` calls with one `commitExercises()`.

**D5. `TemplateDetail` (658 lines)** splits into:
- a `useTemplateEditor(id)` hook holding a single `template` state (fixes W2)
- `TemplateExerciseCard`
- `TemplateStats`
- the edit header

**D6. `App.tsx`** handles auth, bootstrap, background sync and routing in one component.
- Extract `useAuthUserId()`, `useBootstrap(userId)` and `useBackgroundSync(userId)`.
- Replace the paired `setScreen`/`setNav` calls (about 10 sites) with a reducer.
- Add the `startWorkout()` guard from W1.

**D7. Duplicated UI code worth extracting:**
- An `<ErrorText>` for the ~12 copy-pasted `role="alert"` paragraphs.
- A `<Stepper>` plus `parseWeightInput`/`step` helpers. It's currently written three times, and a comment in `ExerciseConfigEditor` says it copies `ExerciseCard`.
- A `<FormDialog>` for the Modal + title + Cancel/Save layout (×5).
- A `<SegmentedControl>` (PlanScreen ≈ HistoryScreen).
- `<ReorderControls>` (TemplatesScreen ≈ TemplateDetail).
- A `<PRBadge>` (×3).
- `fmtVolume` (×3).
- `templateStats()` (×3).
- "Last performed" matching (×4, `TemplateDetail:111`, `TemplatesScreen:67`, `db.ts` ×2).

**D8. Components doing data or domain work:**
- `HistoryAnalytics` loads data itself and holds untested regression, tick and trend math. Move the math to lib and test it.
- `ExercisePicker` saves library rows itself. Pass an `onCreate` callback instead.
- `normalizeMuscle` lives in `inputStyles.ts`; move it to `muscles.ts`.

**D9. The Edge Functions repeat the same helpers.**
- JSON response (×3 styles), bearer check (×2, not constant-time), Resend call (×2), environment checks.
- Admin email and sender address are hardcoded.
- Create `supabase/functions/_shared/{http,auth,resend}.ts`, and move `ADMIN_EMAIL` and `MAIL_FROM` into env.
- `MAX_ATTEMPTS = 3` is duplicated as a literal in SQL.

**D10. The seed program is written twice** (`seedProgram.ts` and migration 008), with nothing checking they match. Add a test that parses 008 and compares it with `SEED_PROGRAM`, or generate 008 from the TypeScript.

**D11. `WeightUnitProvider`** rebuilds its context value on every render, so every consumer re-renders. Wrap it in `useMemo`/`useCallback`.

---

## Accessibility

- `<Card onClick>` is a plain `div` on History rows, template rows, template exercises, Last session and library rows.
  - Result: editing or deleting a workout **can't be done by keyboard at all**.
  - Fix: use real `<button>`s, plus `aria-expanded`.
- The timer pill and the full sheet can't be expanded or collapsed by keyboard.
- The drag handles announce "press Space to pick up", but only `PointerSensor` is registered.
  - Fix: add `KeyboardSensor`, or hide the handles from assistive tech and rely on the arrow buttons.
- There is no `prefers-reduced-motion` handling anywhere.
- Toggle groups (Profile, the chart's range/metric) show the selected option by colour only. They need `aria-pressed`.
- Segmented tabs have no `tabpanel`/`aria-controls` and no arrow-key handling.
- Touch targets are under 24 px: the range pills (~23 px) and "Add set" (~16 px).
- The chart has no `role="img"` and no text alternative.
- `SyncStatusBar` mounts its `role="status"` region together with its text, so screen readers don't announce it.
- The reps validation alert in `ExerciseConfigEditor.tsx:257` fires on a blank field.
- The delete button in SetEditor has no confirmation.

## Tooling and docs

- **T1.** `http_ece` is missing from `devDependencies`, so `webpush.test.ts` (the crypto test `docs/rest-push.md` cites as evidence) never runs after `npm ci`.
- **T2.** There is **no CI**: no `.github/workflows`. Typecheck, tests and build only run when someone remembers to run them.
- **T3.** There is no linter. `eslint-plugin-react-hooks` would have flagged several of the effect-dependency problems above.
- **T4.** Nothing typechecks `supabase/functions/**`. `tsconfig.app.json` includes only `src`, and there's no `deno check`.
- **T5.** The docs are out of date:
  - `README.md` says there is no test suite, no cross-device sync, and uses `public/manifest.json` + `public/sw.js`. It links a spec that doesn't exist.
  - `SETUP.md` and `HANDOFF.md` describe the `redesign/phased` branch.
  - Comments still name `ensureProgramSeed()` (`db.ts:217`, `data.ts:36`, 008).
  - Migration 009 mentions a partial index that doesn't exist.
- **T6.** `.gitignore` excludes `**/superpowers/` while the plans in it are tracked.
- **T7.** Allerta Stencil is loaded twice: from the local `@font-face` and from Google Fonts. The other two fonts come only from Google, which is a third-party request on every cold start and matters if you self-host for privacy. `package.json` is still named `gymapp`.
- **T8.** Dead code:
  - `getLastUsedTemplateId`
  - the non-`embedded` branches of TemplatesScreen and ExercisesScreen
  - `onCreateTemplate` (identical to `onSelectTemplate`)
  - the unreachable `!subscription` branch in send-rest-push
  - unused Tailwind `darkMode` and the `accordion`/`pulse-border` keyframes
  - unused exports (`CardTitle`, `badgeVariants`, `buttonVariants`, unused Badge/Button variants)
  - the Modal comment about ExercisePicker, which is no longer true

## Test gaps

- **Sync:**
  - a late write from another device below the watermark (S1)
  - a conflicting edit before push (S2)
  - `startedAt` mismatch in draft merge
  - rows changing during paging
  - `applyProgramSeed`
  - `renameInSessions`
  - v1→v5 upgrade
- **The fake itself.** It adds `deleted_at` and never lets the server set `updated_at`. A fake that behaves unlike the real server is worse than no fake.
- **Edge Function handlers:** no tests at all (claim/unclaim/410 handling, enumeration parity, the auth check).
- **Database security:** no RLS or pgTAP tests, e.g. cross-user `subscription_id`, the anon INSERT-only policy on `account_requests`, the 011 revokes.
- **Pure logic:** PR detection, volume, progression merge and chart math have no tests (they would be easy once D4/D8 extract them).

## Done well

- The Web Push crypto uses WebCrypto only and follows RFC 8291/8292. It's tested against an independent implementation (once T1 is fixed).
- Race awareness: draft saves are sequenced, handlers read an `exercisesRef`, overlapping syncs are coalesced, and the draft merge runs before push. The comments explain the failure each guard prevents.
- The timer counts down to a wall-clock deadline, and the rest alert fires exactly once.
- Weights are stored to 0.001 kg, with property tests.
- Accessibility work already done: the Modal focus trap and stack-aware Escape, the ARIA 1.2 combobox, per-screen error boundaries, and reorder buttons as the WCAG 2.5.7 alternative to dragging.
- Degrades gracefully: push is inert until configured, and tombstones tolerate an unapplied 009.

---

## Suggested order of work

1. **Stop the data loss.** Fix S3 and W1–W2, which are small changes, then S1+S2+S6 together as one sync-protocol migration: a server stamp, conditional upsert and keyset pull. Rewrite the fake to behave like PostgREST first, so the tests can catch these.
2. **Lock down the backend.** Fix P1–P2: a scheduling RPC, CHECK constraints, a composite FK, and clearing push on sign-out. Then P3–P4 (rate limits), and add B1's `config.toml`.
3. **Stop mid-workout disruption.** W3 (`registerType: "prompt"`), the ±30s deadline (#1), bootstrap (#3) and remounts (#4).
4. **Add a safety net.** T1 (add `http_ece`), T2 (CI running `tsc -b`, `vitest`, `vite build`), T3 (ESLint with react-hooks).
5. **Refactor in passing.** Do D2 alongside step 1, D4/D5 when touching those screens, and D7 helpers as the bugs they're tied to are fixed (the parser and Stepper fix #8/#9 and the float noise).
