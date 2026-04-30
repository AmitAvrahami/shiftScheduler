/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      "colors": {
              // ── Bezeq brand tokens ──────────────────────────────────────
              "primary-blue":    "#010636",   // Primary Dark Navy (logo, heavy headings)
              "action-blue":     "#056AE5",   // Electric Blue (CTAs, active nav)
              "bezeq-blue":      "#2B358F",   // Primary Dark Blue (body headings, text)
              "text-primary":    "#16254F",   // Deep Navy (on-surface body text)
              "neutral-gray":    "#F4F7FA",   // Page background surface
              "hover-tint":      "#F1F8FF",   // Hover / focus tint for links/buttons
              // ── Semantic MD3 tokens (remapped to Bezeq palette) ─────────
              "primary":                  "#010636",
              "on-primary":               "#ffffff",
              "primary-container":        "#2B358F",
              "on-primary-container":     "#ffffff",
              "primary-fixed":            "#dbe1ff",
              "primary-fixed-dim":        "#b4c5ff",
              "on-primary-fixed":         "#00174b",
              "on-primary-fixed-variant": "#003ea8",
              "secondary":                "#056AE5",
              "on-secondary":             "#ffffff",
              "secondary-container":      "#d0e1fb",
              "on-secondary-container":   "#0b1c30",
              "secondary-fixed":          "#d3e4fe",
              "secondary-fixed-dim":      "#b7c8e1",
              "on-secondary-fixed":       "#0b1c30",
              "on-secondary-fixed-variant":"#38485d",
              "tertiary":                 "#3E34D3",
              "on-tertiary":              "#ffffff",
              "tertiary-container":       "#bc4800",
              "on-tertiary-container":    "#ffede6",
              "tertiary-fixed":           "#ffdbcd",
              "tertiary-fixed-dim":       "#ffb596",
              "on-tertiary-fixed":        "#360f00",
              "on-tertiary-fixed-variant":"#7d2d00",
              "error":                    "#ba1a1a",
              "on-error":                 "#ffffff",
              "error-container":          "#ffdad6",
              "on-error-container":       "#93000a",
              "background":               "#F4F7FA",
              "on-background":            "#16254F",
              "surface":                  "#ffffff",
              "surface-bright":           "#f7f9fb",
              "surface-dim":              "#d8dadc",
              "surface-variant":          "#e0e3e5",
              "surface-container-lowest": "#ffffff",
              "surface-container-low":    "#f2f4f6",
              "surface-container":        "#F4F7FA",
              "surface-container-high":   "#e6e8ea",
              "surface-container-highest":"#e0e3e5",
              "on-surface":               "#16254F",
              "on-surface-variant":       "#484C50",
              "outline":                  "#737686",
              "outline-variant":          "#e2e8f0",
              "inverse-surface":          "#2d3133",
              "inverse-on-surface":       "#eff1f3",
              "inverse-primary":          "#b4c5ff",
              "surface-tint":             "#056AE5",
      },
      "boxShadow": {
              "bezeq-card":  "rgba(61, 83, 222, 0.16) 0px 4px 16px 0px",
              "bezeq-float": "rgba(0, 0, 0, 0.05) 0px 9px 8px 0px",
              "bezeq-focus": "0 0 0 3px rgba(43, 53, 143, 0.1)",
      },
      "borderRadius": {
              "DEFAULT": "0.25rem",
              "sm":  "4px",
              "md":  "8px",
              "lg":  "12px",
              "xl":  "16px",
              "cta": "48px",
              "full": "9999px"
      },
      "spacing": {
              "gutter":            "20px",
              "xs":                "4px",
              "xl":                "48px",
              "lg":                "24px",
              "container-margin":  "32px",
              "sm":                "8px",
              "md":                "16px",
              "unit":              "4px"
      },
      "fontFamily": {
              "sans":       ["Heebo", "system-ui", "sans-serif"],
              "label-caps": ["Heebo", "system-ui", "sans-serif"],
              "h3":         ["Heebo", "system-ui", "sans-serif"],
              "body-sm":    ["Heebo", "system-ui", "sans-serif"],
              "h2":         ["Heebo", "system-ui", "sans-serif"],
              "h1":         ["Heebo", "system-ui", "sans-serif"],
              "button":     ["Heebo", "system-ui", "sans-serif"],
              "body-base":  ["Heebo", "system-ui", "sans-serif"]
      },
      "fontSize": {
              "label-caps": ["12px", { "lineHeight": "1",   "letterSpacing": "0.05em", "fontWeight": "600" }],
              "h3":         ["20px", { "lineHeight": "1.4", "letterSpacing": "0",      "fontWeight": "600" }],
              "body-sm":    ["14px", { "lineHeight": "1.5", "letterSpacing": "0",      "fontWeight": "400" }],
              "h2":         ["24px", { "lineHeight": "1.3", "letterSpacing": "-0.01em","fontWeight": "600" }],
              "h1":         ["36px", { "lineHeight": "1.2", "letterSpacing": "-0.02em","fontWeight": "700" }],
              "button":     ["14px", { "lineHeight": "1",   "letterSpacing": "0",      "fontWeight": "500" }],
              "body-base":  ["16px", { "lineHeight": "1.6", "letterSpacing": "0",      "fontWeight": "400" }]
      }
    }
  },
  plugins: [],
};
