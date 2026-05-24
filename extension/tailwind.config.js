/** @type {import('tailwindcss').Config}
 *
 * Project Wingman — Multi-Surface Token Bridge.
 * ===============================================
 *
 * Every color token below resolves to a CSS variable defined in
 * src/sidebar/tokens.css. That file scopes the variables per `data-skin`
 * attribute, so the *same Tailwind class* renders differently depending
 * on which surface a component lives inside:
 *
 *   <div data-skin="brand">…</div>   ← default sidebar (cream + white cards)
 *   <div data-skin="live">…</div>    ← live meeting copilot
 *   <div data-skin="insights">…</div>   ← post-call insights
 *   <div data-skin="linear">…</div>    ← popup
 *   <div data-skin="vercel">…</div>    ← transponder + landing body
 *   <div data-skin="spacex">…</div>    ← landing hero band
 *
 * Components don't change. Wrap a surface in the appropriate skin and
 * the palette swaps automatically.
 *
 * V1 brand-bridge remaps (slate-* → cream/ink, violet-* → orange, etc.)
 * are preserved so existing components keep working without touch-ups.
 */
export default {
  content: ["./src/**/*.{ts,tsx}", "./sidebar.html", "./popup.html"],
  theme: {
    // Sharp corners by default. Pill escape hatch retained.
    borderRadius: {
      none: "0",
      DEFAULT: "0",
      sm: "0",
      md: "0",
      lg: "0",
      xl: "0",
      "2xl": "0",
      "3xl": "0",
      full: "9999px",
      pill: "9999px",
    },
    extend: {
      fontFamily: {
        sans: ["'Inter'", "'Space Grotesk'", "system-ui", "-apple-system", "sans-serif"],
        mono: ["'JetBrains Mono'", "ui-monospace", "'SF Mono'", "Menlo", "monospace"],
        display: ["'Inter'", "'Space Grotesk'", "system-ui", "sans-serif"],
      },
      letterSpacing: {
        body: "-0.02em",
        heading: "-0.03em",
        display: "-0.05em",
        meta: "0.14em",
        eyebrow: "0.14em",
        spacex: "0.08em",
      },
      colors: {
        // ─────────────────────────────────────────────────────────────
        // CSS-variable backed tokens — these are the canonical names.
        // ─────────────────────────────────────────────────────────────

        // Brand mark — persists across every skin
        orange: "var(--brand-orange)",
        "orange-hover": "var(--brand-orange-hover)",
        "orange-press": "var(--brand-orange-press)",

        // Surfaces (lift ladder, 0 = deepest canvas)
        surface: {
          0: "var(--surface-0)",
          1: "var(--surface-1)",
          2: "var(--surface-2)",
          3: "var(--surface-3)",
          4: "var(--surface-4)",
        },

        // Text
        ink: {
          DEFAULT: "var(--ink)",
          2: "var(--ink-2)",
          3: "var(--ink-3)",
          4: "var(--ink-4)",
          5: "var(--ink-5)",
        },

        // Lines / borders
        line: {
          DEFAULT: "var(--line)",
          2: "var(--line-2)",
          3: "var(--line-3)",
        },

        // Skin-specific signal colors
        signal: {
          live: "var(--signal-live)",
          warn: "var(--signal-warn)",
          error: "var(--signal-error)",
          info: "var(--signal-info)",
        },

        // Accent banner family (PostHog callouts, Cursor timeline, etc.)
        accent: {
          blue: "var(--accent-blue)",
          "blue-soft": "var(--accent-blue-soft)",
          green: "var(--accent-green)",
          "green-soft": "var(--accent-green-soft)",
          red: "var(--accent-red)",
          "red-soft": "var(--accent-red-soft)",
          purple: "var(--accent-purple)",
          "purple-soft": "var(--accent-purple-soft)",
        },

        // Cursor timeline pastels — maps to Wingman's live agent stages
        timeline: {
          thinking: "var(--timeline-thinking, #DFA88F)",
          grep: "var(--timeline-grep, #9FC9A2)",
          read: "var(--timeline-read, #9FBBE0)",
          edit: "var(--timeline-edit, #C0A8DD)",
          done: "var(--timeline-done, #C08532)",
        },

        // Convenience aliases used across the existing codebase
        blue: "var(--accent-blue)",
        green: "var(--accent-green)",
        red: "var(--accent-red)",
        black: "#0A0A0A",
        cream: "var(--ink)",

        // ─────────────────────────────────────────────────────────────
        // V1 brand-bridge remaps — preserved so existing component
        // classes (bg-slate-800, text-slate-400 etc.) still resolve to
        // surface/ink tokens automatically.
        // ─────────────────────────────────────────────────────────────
        slate: {
          50: "var(--ink)",
          100: "var(--ink)",
          200: "var(--ink-2)",
          300: "var(--ink-3)",
          400: "var(--ink-4)",
          500: "var(--ink-4)",
          600: "var(--ink-5)",
          700: "var(--line-2)",
          800: "var(--line)",
          900: "var(--surface-1)",
          950: "var(--surface-0)",
        },
        violet: {
          50: "var(--brand-orange)",
          100: "var(--brand-orange)",
          200: "var(--brand-orange)",
          300: "var(--brand-orange)",
          400: "var(--brand-orange)",
          500: "var(--brand-orange)",
          600: "var(--brand-orange)",
          700: "var(--brand-orange-press)",
          800: "var(--brand-orange-press)",
          900: "var(--brand-orange-press)",
          950: "var(--brand-orange-press)",
        },
        indigo: {
          400: "var(--brand-orange)",
          500: "var(--brand-orange)",
          600: "var(--brand-orange)",
          700: "var(--brand-orange-press)",
        },
        emerald: {
          400: "var(--accent-green)",
          500: "var(--accent-green)",
          600: "var(--accent-green)",
          700: "var(--accent-green)",
        },
        amber: {
          300: "var(--signal-warn)",
          400: "var(--signal-warn)",
          500: "var(--signal-warn)",
          600: "var(--signal-warn)",
        },
        yellow: {
          400: "var(--signal-warn)",
          500: "var(--signal-warn)",
        },
      },
      boxShadow: {
        // Skin-aware elevation — each skin's tokens.css defines these.
        skin: "var(--shadow-1)",
        "skin-lifted": "var(--shadow-2)",
        card: "var(--shadow-card)",

        // Brutalist hard-offset shadows kept for legacy V1 components.
        "hover-orange": "0 8px 0 -4px var(--brand-orange)",
        "hover-blue": "0 8px 0 -4px var(--accent-blue)",
        "hover-green": "0 8px 0 -4px var(--accent-green)",
        "hover-ink": "0 4px 0 -2px var(--ink)",
        toast: "0 8px 0 -4px var(--brand-orange)",
      },
    },
  },
  plugins: [],
};
