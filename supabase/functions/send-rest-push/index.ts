// Supabase Edge Function: send-rest-push
//
// Delivers the rest-timer alert to devices whose app is suspended.
//
// The in-app alert only fires while the page's JavaScript is running, and iOS
// freezes a backgrounded PWA's JS — so the one moment a rest timer matters
// most, phone in a pocket between sets, was the one moment it could not reach
// you. Web Push does wake a suspended installed PWA (iOS 16.4+), but only if
// something awake sends it at the right second. That something is the pg_cron
// sweep in migration 010, which calls this.
//
// This function sends what is already due and nothing else; it holds no
// schedule of its own. Each run is idempotent — rows are claimed by stamping
// delivered_at — so a sweep that overlaps the previous one cannot double-send.
//
// Secrets (supabase secrets set …):
//   REST_PUSH_SECRET   shared with the Vault secret rest_push_trigger_secret
//   VAPID_PUBLIC_KEY   base64url, uncompressed P-256 point
//   VAPID_PRIVATE_KEY  base64url raw scalar
//   VAPID_SUBJECT      mailto: or https: contact, per RFC 8292
import { sendWebPush, type VapidKeys } from "./webpush.ts";

// A sweep runs every few seconds; anything beyond this is either a backlog
// worth spreading over several runs or a bug worth not amplifying.
const BATCH_SIZE = 50;
const MAX_ATTEMPTS = 3;

interface DueRow {
  id: string;
  title: string;
  body: string;
  attempts: number;
  push_subscriptions: { id: string; endpoint: string; p256dh: string; auth: string } | null;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  // Same reasoning as notify-account-request: Supabase's default JWT gate
  // only requires *a* valid project JWT, and the anon key ships in the client
  // bundle — so without a dedicated secret anyone could invoke this and push
  // notifications to other people's phones.
  const secret = Deno.env.get("REST_PUSH_SECRET");
  if (!secret || req.headers.get("Authorization") !== `Bearer ${secret}`) {
    return json({ success: false, error: "Unauthorized." }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const vapid: VapidKeys = {
    publicKey: Deno.env.get("VAPID_PUBLIC_KEY") ?? "",
    privateKey: Deno.env.get("VAPID_PRIVATE_KEY") ?? "",
    subject: Deno.env.get("VAPID_SUBJECT") ?? "",
  };
  if (!supabaseUrl || !serviceKey) {
    return json({ success: false, error: "Supabase credentials are not configured." }, 500);
  }
  if (!vapid.publicKey || !vapid.privateKey || !vapid.subject) {
    return json({ success: false, error: "VAPID keys are not configured." }, 500);
  }

  const rest = (path: string, init: RequestInit = {}) =>
    fetch(`${supabaseUrl}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
    });

  const dueResponse = await rest(
    "scheduled_pushes?select=id,title,body,attempts,push_subscriptions(id,endpoint,p256dh,auth)" +
      `&delivered_at=is.null&attempts=lt.${MAX_ATTEMPTS}&due_at=lte.${new Date().toISOString()}` +
      `&order=due_at.asc&limit=${BATCH_SIZE}`
  );
  if (!dueResponse.ok) {
    return json({ success: false, error: `Could not read due pushes: ${await dueResponse.text()}` }, 500);
  }
  const due = (await dueResponse.json()) as DueRow[];

  let sent = 0;
  let dropped = 0;
  let failed = 0;

  for (const row of due) {
    const subscription = row.push_subscriptions;
    if (!subscription) {
      // The device unsubscribed between scheduling and now; nothing to send.
      await rest(`scheduled_pushes?id=eq.${row.id}`, { method: "DELETE" });
      continue;
    }

    // Claimed before sending, not after: a sweep that overlaps the previous
    // one would otherwise find the same row still pending and buzz twice.
    const claim = await rest(`scheduled_pushes?id=eq.${row.id}&delivered_at=is.null`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ delivered_at: new Date().toISOString(), attempts: row.attempts + 1 }),
    });
    if (!claim.ok || ((await claim.json()) as unknown[]).length === 0) continue;

    try {
      const result = await sendWebPush(subscription, JSON.stringify({ title: row.title, body: row.body }), vapid);
      if (result.ok) {
        sent++;
      } else if (result.gone) {
        // The push service says this device is gone for good. Deleting the
        // subscription cascades to anything still scheduled for it.
        await rest(`push_subscriptions?id=eq.${subscription.id}`, { method: "DELETE" });
        dropped++;
      } else {
        // Un-claim so a later sweep can try again, up to MAX_ATTEMPTS.
        await rest(`scheduled_pushes?id=eq.${row.id}`, {
          method: "PATCH",
          body: JSON.stringify({ delivered_at: null }),
        });
        failed++;
      }
    } catch (_err) {
      await rest(`scheduled_pushes?id=eq.${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({ delivered_at: null }),
      });
      failed++;
    }
  }

  return json({ success: true, sent, dropped, failed, considered: due.length });
});
