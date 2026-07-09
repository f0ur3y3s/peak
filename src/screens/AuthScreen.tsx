import { useState, FormEvent } from "react";
import { supabase } from "@/lib/supabase";

type AuthMode = "login" | "request";

export function AuthScreen() {
  const [mode, setMode]             = useState<AuthMode>("login");
  const [email, setEmail]       = useState("");
  const [error, setError]       = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode]         = useState("");
  const [verifying, setVerifying] = useState(false);
  const [requestName, setRequestName]       = useState("");
  const [requestEmail, setRequestEmail]     = useState("");
  const [requestMessage, setRequestMessage] = useState("");
  const [requestError, setRequestError]     = useState<string | null>(null);
  const [requestSent, setRequestSent]       = useState(false);
  const [requestLoading, setRequestLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    // Delivered via our own Edge Function + Resend, not Supabase's own
    // auth email, so the code is guaranteed to actually be visible in the
    // email (Supabase's dashboard-configured templates only worked for
    // rendering the magic-link, not the code). Verification below still
    // goes through Supabase's own verifyOtp — this only changes delivery.
    const { data, error: fnError } = await supabase.functions.invoke("request-signin-code", {
      body: { email },
    });
    setLoading(false);
    if (fnError || data?.success !== true) {
      setError(fnError?.message ?? data?.error ?? "Couldn't send the code — try again.");
      return;
    }
    setCodeSent(true);
  }

  async function handleVerifyCode(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setVerifying(true);
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: code.trim(),
      type: "email",
    });
    setVerifying(false);
    if (verifyError) {
      setError(verifyError.message);
    }
    // On success, App.tsx's onAuthStateChange listener picks up the new
    // session and navigates away from this screen automatically.
  }

  async function handleRequest(e: FormEvent) {
    e.preventDefault();
    setRequestError(null);
    setRequestSent(false);
    setRequestLoading(true);

    const { error: insertError } = await supabase.from("account_requests").insert({
      name: requestName.trim() || null,
      email: requestEmail.trim(),
      message: requestMessage.trim() || null,
    });

    setRequestLoading(false);

    if (insertError) {
      setRequestError("Couldn't submit request. Try again.");
      return;
    }

    setRequestName("");
    setRequestEmail("");
    setRequestMessage("");
    setRequestSent(true);
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
      <div style={{ textAlign: "center", marginBottom: 40 }}>
        <p
          className="font-title"
          style={{
            fontSize: 42,
            fontWeight: 400,
            color: "hsl(var(--primary))",
            letterSpacing: "0.2em",
            lineHeight: 1,
            margin: 0,
          }}
        >
          PEAK
        </p>
        <p
          style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: 11,
            color: "hsl(var(--muted-foreground))",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            margin: "10px 0 0",
          }}
        >
          ready to work?
        </p>
      </div>

      <form
        onSubmit={mode === "login" ? (codeSent ? handleVerifyCode : handleSubmit) : handleRequest}
        style={{
          width: "100%",
          maxWidth: 360,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {mode === "login" ? (
          <>
            <input
              type="email"
              placeholder="Email"
              autoComplete="email"
              required
              disabled={codeSent}
              value={email}
              onChange={e => { setEmail(e.target.value); setError(null); }}
              className="auth-input"
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
                opacity: codeSent ? 0.6 : 1,
              }}
            />
            {codeSent && (
              <>
                <p
                  style={{
                    fontFamily: "'DM Mono', monospace",
                    fontSize: 12,
                    color: "hsl(var(--muted-foreground))",
                    margin: 0,
                  }}
                >
                  Enter the OTP sent to your email.
                </p>
                <input
                  type="text"
                  autoComplete="one-time-code"
                  placeholder="OTP"
                  required
                  autoFocus
                  value={code}
                  onChange={e => { setCode(e.target.value); setError(null); }}
                  className="auth-input"
                  style={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 10,
                    padding: "12px 14px",
                    color: "hsl(var(--foreground))",
                    fontFamily: "'DM Mono', monospace",
                    fontSize: 18,
                    letterSpacing: "0.3em",
                    textAlign: "center",
                    outline: "none",
                    width: "100%",
                    boxSizing: "border-box",
                  }}
                />
              </>
            )}
          </>
        ) : (
          <>
            <input
              type="text"
              placeholder="Name"
              autoComplete="name"
              required
              value={requestName}
              onChange={e => { setRequestName(e.target.value); setRequestError(null); setRequestSent(false); }}
              className="auth-input"
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
              type="email"
              placeholder="Email"
              autoComplete="email"
              required
              value={requestEmail}
              onChange={e => { setRequestEmail(e.target.value); setRequestError(null); setRequestSent(false); }}
              className="auth-input"
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
            <textarea
              placeholder="Why do you want access?"
              value={requestMessage}
              onChange={e => { setRequestMessage(e.target.value); setRequestError(null); setRequestSent(false); }}
              className="auth-input"
              rows={4}
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
                resize: "vertical",
              }}
            />
          </>
        )}

        {mode === "login" && error && (
          <p
            style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: 12,
              color: "hsl(var(--destructive))",
              margin: 0,
            }}
          >
            {error}
          </p>
        )}

        {mode === "request" && requestError && (
          <p
            style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: 12,
              color: "hsl(var(--destructive))",
              margin: 0,
            }}
          >
            {requestError}
          </p>
        )}

        {mode === "request" && requestSent && (
          <p
            style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: 12,
              color: "hsl(var(--primary))",
              margin: 0,
            }}
          >
            Thanks — we'll be in touch.
          </p>
        )}

        <button
          type="submit"
          disabled={mode === "login" ? (codeSent ? verifying : loading) : requestLoading}
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
            cursor: (mode === "login" ? (codeSent ? verifying : loading) : requestLoading) ? "not-allowed" : "pointer",
            opacity: (mode === "login" ? (codeSent ? verifying : loading) : requestLoading) ? 0.6 : 1,
            width: "100%",
          }}
        >
          {mode === "login"
            ? codeSent
              ? verifying ? "Verifying..." : "Verify code"
              : loading ? "Sending code..." : "Send code"
            : requestLoading ? "Submitting..." : "Request account"}
        </button>

        {mode === "login" && codeSent && (
          <button
            type="button"
            onClick={() => {
              setCodeSent(false);
              setCode("");
              setError(null);
            }}
            style={{
              background: "none",
              border: "none",
              color: "hsl(var(--muted-foreground))",
              cursor: "pointer",
              fontFamily: "'DM Mono', monospace",
              fontSize: 12,
              letterSpacing: "0.04em",
              padding: "6px 0 0",
              textDecoration: "underline",
              textUnderlineOffset: 4,
            }}
          >
            Use a different email
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            setMode((current) => (current === "login" ? "request" : "login"));
            setError(null);
            setCodeSent(false);
            setCode("");
            setRequestError(null);
            setRequestSent(false);
          }}
          style={{
            background: "none",
            border: "none",
            color: "hsl(var(--muted-foreground))",
            cursor: "pointer",
            fontFamily: "'DM Mono', monospace",
            fontSize: 12,
            letterSpacing: "0.04em",
            padding: "6px 0 0",
            textDecoration: "underline",
            textUnderlineOffset: 4,
          }}
        >
          {mode === "login" ? "Request account" : "Back to sign in"}
        </button>
      </form>
    </div>
  );
}
