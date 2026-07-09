// Supabase Edge Function: send-test-email
//
// Sends a one-off test email via the Resend API. This runs server-side in
// Supabase's Deno runtime, so the Resend API key stays out of the client
// bundle (it is read from a Supabase secret, never hardcoded or accepted
// from the request body).
//
// Once deployed, this can be invoked from client code via:
//   supabase.functions.invoke("send-test-email")
// (not wired up yet — this task only builds the function itself).

const RESEND_API_URL = "https://api.resend.com/emails";

Deno.serve(async (_req: Request) => {
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

  try {
    const resendResponse = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "noreply@peak.foursight.one",
        to: "dchung0812@gmail.com",
        subject: "Hello World",
        html: "<p>Congrats on sending your <strong>first email</strong>!</p>",
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
