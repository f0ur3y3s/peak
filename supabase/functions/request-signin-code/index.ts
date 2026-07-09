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
    return jsonResponse(
      { success: false, error: linkData?.msg ?? "Couldn't generate a sign-in code." },
      500,
    );
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
      subject: "Your Peak sign-in code",
      html: `
        <p>Your Peak sign-in code is:</p>
        <p style="font-size: 28px; font-weight: bold; letter-spacing: 4px;">${code}</p>
        <p>This code expires shortly. If you didn't request this, you can ignore this email.</p>
      `,
    }),
  });

  if (!resendResponse.ok) {
    const resendData = await resendResponse.json();
    return jsonResponse({ success: false, error: "Couldn't send the email.", resend: resendData }, 500);
  }

  return jsonResponse({ success: true });
});
