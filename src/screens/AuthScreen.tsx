import { useState, FormEvent } from "react";
import { supabase } from "@/lib/supabase";

export function AuthScreen() {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (authError) setError(authError.message);
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
      <p
        style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: 32,
          fontWeight: 500,
          color: "hsl(var(--primary))",
          letterSpacing: "0.08em",
          marginBottom: 40,
        }}
      >
        PEAK
      </p>

      <form
        onSubmit={handleSubmit}
        style={{
          width: "100%",
          maxWidth: 360,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <input
          type="email"
          placeholder="Email"
          autoComplete="email"
          required
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
          }}
        />
        <input
          type="password"
          placeholder="Password"
          autoComplete="current-password"
          required
          value={password}
          onChange={e => { setPassword(e.target.value); setError(null); }}
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

        {error && (
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

        <button
          type="submit"
          disabled={loading}
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
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.6 : 1,
            width: "100%",
          }}
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
