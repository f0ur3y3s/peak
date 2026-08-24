/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        title: ["Allerta Stencil", "Inter", "system-ui", "sans-serif"],
        mono: ["DM Mono", "monospace"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      // Named, rem-based type roles — replaces the app's former text-[Npx]
      // arbitrary values. Named for the job each size does (not the pixel
      // value it happens to be), and deliberately does not touch Tailwind's
      // own xs/sm/base/lg/xl/2xl keys, which shadcn primitives (Badge,
      // Button) and a handful of screens already rely on unmodified.
      // `heading` (modal/dialog titles, and — via the built-in `lg` key —
      // TopBar's page h1) intentionally has no entry here: it reuses
      // Tailwind's existing 1.125rem `lg` instead of adding a near-duplicate.
      fontSize: {
        // Micro uppercase section/eyebrow labels, and small tag/badge text
        // (achievement pills, muscle-group chips) — same size, distinguished
        // from each other by weight/tracking/case, not by size.
        label: ["0.625rem", { lineHeight: "1.2" }],
        // Metadata, timestamps, and status/error captions.
        caption: ["0.6875rem", { lineHeight: "1.4" }],
        // Secondary/supporting prose, field-group labels, button labels.
        subtext: ["0.8125rem", { lineHeight: "1.4" }],
        // Interactive list-row text and form input text.
        body: ["0.875rem", { lineHeight: "1.4" }],
        // Row/card titles (paired with font-semibold at call sites).
        title: ["0.9375rem", { lineHeight: "1.3" }],
        // Compact big numerals — active-set counter, collapsed rest timer.
        stat: ["1.375rem", { lineHeight: "1.1" }],
        // Brand hero wordmark (AuthScreen) — single use by design.
        wordmark: ["2.625rem", { lineHeight: "1" }],
        // Full-screen rest-timer countdown — single use by design.
        countdown: ["5.5rem", { lineHeight: "1" }],
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "pulse-border": {
          "0%, 100%": { borderColor: "hsl(var(--primary) / 0.4)" },
          "50%": { borderColor: "hsl(var(--primary) / 0.8)" },
        },
        "slide-up": {
          from: { transform: "translateY(12px)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "pulse-border": "pulse-border 2s ease-in-out infinite",
        "slide-up": "slide-up 0.18s ease",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
