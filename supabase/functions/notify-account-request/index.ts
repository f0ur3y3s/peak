// Supabase Edge Function: notify-account-request
//
// Called by a Postgres trigger (see supabase/migrations/002_account_request_notify.sql)
// whenever a new row is inserted into public.account_requests. Sends an email
// to the admin via Resend so they know to go create the requester's Supabase
// Auth account.
//
// The trigger POSTs the standard Supabase "webhook-shaped" payload:
//   { type: "INSERT", table: "account_requests", schema: "public", record: {...}, old_record: null }
// via pg_net's net.http_post, authenticated with a dedicated shared secret
// pulled from Vault (never hardcoded in SQL) — see NOTIFY_TRIGGER_SECRET
// below. This is intentionally its own random secret rather than the
// project's actual service_role key: Supabase has both a legacy JWT-format
// service_role key and a newer sb_secret_... key, and Deno.env.get in an
// Edge Function doesn't reliably resolve to whichever one happens to be
// stored in Vault — a dedicated secret sidesteps that entirely.

const RESEND_API_URL = "https://api.resend.com/emails";
const ADMIN_EMAIL = "dchung0812@gmail.com";

interface AccountRequestRecord {
  id?: string;
  name?: string | null;
  email?: string | null;
  message?: string | null;
  created_at?: string;
}

interface WebhookPayload {
  type?: string;
  table?: string;
  record?: AccountRequestRecord;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

Deno.serve(async (req: Request) => {
  // Only the Postgres trigger should ever be able to make this function fire
  // an admin email — it authenticates with a dedicated shared secret (see
  // header comment). Supabase's default JWT gate only requires *a* valid
  // project JWT, and the anon key is public (it ships in the client
  // bundle), so without this check anyone holding the anon key could invoke
  // this function directly and spam the admin inbox / burn the Resend quota.
  const triggerSecret = Deno.env.get("NOTIFY_TRIGGER_SECRET");
  const authHeader = req.headers.get("Authorization");
  if (!triggerSecret || authHeader !== `Bearer ${triggerSecret}`) {
    return new Response(
      JSON.stringify({ success: false, error: "Unauthorized." }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const apiKey = Deno.env.get("RESEND_API_KEY");

  if (!apiKey) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "RESEND_API_KEY secret is not configured for this function.",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  let payload: WebhookPayload;
  try {
    payload = await req.json();
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: `Invalid JSON payload: ${error instanceof Error ? error.message : String(error)}`,
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const record = payload.record;
  if (!record) {
    return new Response(
      JSON.stringify({ success: false, error: "Payload is missing a 'record' field." }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const name = record.name?.trim() || "(no name given)";
  const email = record.email?.trim() || "(no email given)";
  const message = record.message?.trim() || "(no message)";

  try {
    const resendResponse = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "noreply@peak.foursight.one",
        to: ADMIN_EMAIL,
        subject: `New Peak access request from ${name}`,
        html: `
          <p>Someone requested access to Peak:</p>
          <ul>
            <li><strong>Name:</strong> ${escapeHtml(name)}</li>
            <li><strong>Email:</strong> ${escapeHtml(email)}</li>
            <li><strong>Message:</strong> ${escapeHtml(message)}</li>
          </ul>
          <p>Go create their Supabase Auth account to grant access.</p>
        `,
      }),
    });

    const resendData = await resendResponse.json();

    return new Response(
      JSON.stringify({
        success: resendResponse.ok,
        status: resendResponse.status,
        resend: resendData,
      }),
      {
        status: resendResponse.ok ? 200 : resendResponse.status,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
