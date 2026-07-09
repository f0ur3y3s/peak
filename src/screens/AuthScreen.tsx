import { useState, FormEvent } from "react";
import { supabase } from "@/lib/supabase";

type AuthMode = "login" | "request";

export function AuthScreen() {
  const [mode, setMode]             = useState<AuthMode>("login");
  const [email, setEmail]       = useState("");
  const [error, setError]       = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [requestName, setRequestName]       = useState("");
  const [requestEmail, setRequestEmail]     = useState("");
  const [requestMessage, setRequestMessage] = useState("");
  const [requestError, setRequestError]     = useState<string | null>(null);
  const [requestSent, setRequestSent]       = useState(false);
  const [requestLoading, setRequestLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMagicLinkSent(false);
    setLoading(true);
    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin,
        // Only approved accounts (created by an admin in the Supabase
        // dashboard) can sign in — a magic-link request must never
        // silently create a new account for an unapproved email.
        shouldCreateUser: false,
      },
    });
    setLoading(false);
    if (authError) {
      setError(authError.message);
      return;
    }
    setMagicLinkSent(true);
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
        onSubmit={mode === "login" ? handleSubmit : handleRequest}
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
              value={email}
              onChange={e => { setEmail(e.target.value); setError(null); setMagicLinkSent(false); }}
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

        {mode === "login" && magicLinkSent && (
          <p
            style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: 12,
              color: "hsl(var(--primary))",
              margin: 0,
            }}
          >
            Check your email for a sign-in link.
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
          disabled={mode === "login" ? loading : requestLoading}
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
            cursor: (mode === "login" ? loading : requestLoading) ? "not-allowed" : "pointer",
            opacity: (mode === "login" ? loading : requestLoading) ? 0.6 : 1,
            width: "100%",
          }}
        >
          {mode === "login"
            ? loading ? "Sending link..." : "Send magic link"
            : requestLoading ? "Submitting..." : "Request account"}
        </button>

        <button
          type="button"
          onClick={() => {
            setMode((current) => (current === "login" ? "request" : "login"));
            setError(null);
            setMagicLinkSent(false);
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
