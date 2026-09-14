# Rest-timer push — deployment

What this turns on: the rest alert reaching a phone that is locked, pocketed
or has the app closed. Without it the alert only fires while the page's
JavaScript is running, which iOS stops the moment a PWA is backgrounded —
so the one situation a rest timer exists for was the one it could not serve.

Nothing here is required for the app to work. With no VAPID key configured
the whole path stays inert and the in-app alert behaves exactly as before.

## What the pieces are

| Piece | Where | Job |
| --- | --- | --- |
| `public/push-sw.js` | client | Shows the notification when a push arrives. |
| `src/lib/restPush.ts` | client | Registers the device; schedules a push when backgrounded mid-rest, cancels it on return. |
| `supabase/migrations/010_rest_push.sql` | database | `push_subscriptions`, `scheduled_pushes`, and the pg_cron sweep. |
| `supabase/functions/send-rest-push/` | server | Signs and encrypts the push, and sends it. |

A push only ever exists while the app is *not* watching — scheduled on
backgrounding, cancelled on return. That is also what stops it arriving on
top of the in-app alert.

## 1. Generate a VAPID key pair

```
npx web-push generate-vapid-keys
```

Two base64url strings. The public half ships in the client bundle (by
design — it is public). The private half is a secret and goes only into the
Edge Function's environment.

## 2. Client

In Vercel's environment variables (and your local `.env`):

```
VITE_VAPID_PUBLIC_KEY=<the public half>
```

Redeploy. Until this is set, `isRestPushConfigured()` is false everywhere and
no push code runs.

## 3. Database

Run `supabase/migrations/010_rest_push.sql`, then seed the shared secret the
sweep uses to authorize its call — the same pattern migration 002 uses, so
the value never passes through a committed file:

```sql
select vault.create_secret(
  '<a long random string>',
  'rest_push_trigger_secret',
  'shared secret authorizing the rest-push sweep to call send-rest-push'
);
```

The migration schedules `sweep-rest-pushes` every five seconds. It costs one
indexed lookup per run and calls the Edge Function only when something is
actually due, so an idle account costs nothing. If your pg_cron predates 1.5
(no interval schedules), change `'5 seconds'` to `'* * * * *'` and accept
up-to-a-minute lateness — which for a rest timer is close to useless, so
check the version first:

```sql
select extversion from pg_extension where extname = 'pg_cron';
```

## 4. Edge Function

```
supabase secrets set \
  REST_PUSH_SECRET='<the same random string as the vault secret above>' \
  VAPID_PUBLIC_KEY='<public half>' \
  VAPID_PRIVATE_KEY='<private half>' \
  VAPID_SUBJECT='mailto:you@example.com'

supabase functions deploy send-rest-push
```

`VAPID_SUBJECT` must be a `mailto:` or `https:` URL — RFC 8292 requires it,
and push services reject tokens without one.

## 5. Check it

On the phone, with Peak installed to the Home Screen (iOS will not deliver
Web Push to a PWA opened in a Safari tab — it must be installed):

1. Profile → Rest alert → Sound. Accept the notification prompt. The copy
   under the control changes to "…even with the app closed and the screen
   off" once the device is registered.
2. Start a workout, log a set, then lock the phone.
3. The buzz should arrive within a few seconds of the countdown reaching
   zero.

If nothing arrives, in order: is the app installed to the Home Screen; did
the subscription row appear in `push_subscriptions`; did a row appear in
`scheduled_pushes` when you locked the phone; is `delivered_at` being stamped
(the sweep ran) or `attempts` climbing (the send failed). The function
returns `{sent, dropped, failed, considered}` and its logs are in the
Supabase dashboard.

## What is verified and what is not

The Web Push crypto — RFC 8291 payload encryption and RFC 8292 VAPID — is
covered by tests that decrypt our own ciphertext with `http_ece`, the
independent library the Node ecosystem's `web-push` is built on, and verify
the VAPID JWT signature against its public key. The client's scheduling,
cancellation and registration are covered too.

End-to-end delivery is not, and cannot be from this repo: it needs a real
push service, a real device and real keys. Step 5 is that test.
