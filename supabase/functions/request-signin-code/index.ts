// Supabase Edge Function: request-signin-code
//
// Generates a sign-in OTP code via the Supabase Admin API and emails it
// via Resend, using a template we fully control (guaranteed to actually
// show the code, unlike Supabase's own dashboard-configured auth emails).
//
// Only sends to emails that already have an approved Supabase Auth user —
// mirrors the app's existing access-control rule (no self-serve signup).
// A request for an unknown email returns the same generic success shape
// as a known one, without sending anything, to avoid leaking which
// emails are registered.
//
// The actual OTP verification still goes through Supabase's own
// supabase.auth.verifyOtp() client-side — this function only replaces
// how the code gets delivered, not how it's validated.

const RESEND_API_URL = "https://api.resend.com/emails";
const FROM_EMAIL = "noreply@peak.foursight.one";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

// Table-based layout with only inline styles — the safe subset that
// renders consistently across email clients (no flexbox/grid, no
// external fonts, no <style> blocks relied upon).
function buildEmailHtml(code: string): string {
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0f0f0f;padding:40px 16px;">
  <tr>
    <td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:420px;">
        <tr>
          <td align="center" style="padding-bottom:28px;">
            <span style="font-family:Arial,Helvetica,sans-serif;font-size:26px;font-weight:bold;letter-spacing:6px;color:#e8ff47;">PEAK</span>
          </td>
        </tr>
        <tr>
          <td style="background-color:#1a1a1a;border:1px solid #292929;border-radius:12px;padding:32px 28px;">
            <p style="margin:0 0 8px;font-family:Helvetica,Arial,sans-serif;font-size:13px;color:#8a8a8a;text-align:center;">
              Your sign-in code
            </p>
            <p style="margin:0 0 20px;font-family:'Courier New',Courier,monospace;font-size:36px;font-weight:bold;letter-spacing:10px;color:#ffffff;text-align:center;">
              ${code}
            </p>
            <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:13px;line-height:1.5;color:#8a8a8a;text-align:center;">
              Enter this code in the app to sign in. It expires shortly.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding-top:20px;">
            <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:#5c5c5c;text-align:center;">
              Didn't request this? You can safely ignore this email.
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendKey = Deno.env.get("RESEND_API_KEY");

  if (!supabaseUrl || !serviceRoleKey || !resendKey) {
    return jsonResponse({ success: false, error: "Server is missing required configuration." }, 500);
  }

  let email: string | undefined;
  try {
    const body = await req.json();
    email = body.email?.trim().toLowerCase();
  } catch {
    // fall through to the missing-email check below
  }

  if (!email) {
    return jsonResponse({ success: false, error: "email is required." }, 400);
  }

  const adminHeaders = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };

  // Look up the user by email first — never let generate_link silently
  // create a new account for an unapproved email.
  const lookupRes = await fetch(
    `${supabaseUrl}/auth/v1/admin/users?email=${encodeURIComponent(email)}`,
    { headers: adminHeaders },
  );
  if (!lookupRes.ok) {
    return jsonResponse({ success: false, error: "Couldn't verify account — try again." }, 500);
  }
  const lookupData = await lookupRes.json();
  const users = Array.isArray(lookupData) ? lookupData : lookupData.users ?? [];
  const matchedUser = users.find(
    (u: { email?: string }) => u.email?.toLowerCase() === email,
  );

  if (!matchedUser) {
    // Generic success — don't reveal whether this email has an account.
    return jsonResponse({ success: true });
  }

  const linkRes = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({ type: "magiclink", email }),
  });
  const linkData = await linkRes.json();

  if (!linkRes.ok) {
    return jsonResponse({ success: false, error: "Couldn't generate a sign-in code." }, 500);
  }

  const code = linkData.email_otp ?? linkData.properties?.email_otp;
  if (!code) {
    return jsonResponse({ success: false, error: "No OTP code in the generated link response." }, 500);
  }

  const resendResponse = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: email,
      subject: `${code} is your Peak sign-in code`,
      html: buildEmailHtml(code),
    }),
  });

  if (!resendResponse.ok) {
    return jsonResponse({ success: false, error: "Couldn't send the email." }, 500);
  }

  return jsonResponse({ success: true });
});
