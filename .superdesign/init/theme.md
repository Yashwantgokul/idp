# HIDShield-X — Design System & Theme Tokens

## Part 1 — Three-Tier Token Architecture & Specifications

### Tier 1: Primitives (Raw Values)
```css
/* Color Primitives (Slate Neutral Base) */
--primitive-slate-950: #050811;
--primitive-slate-900: #0a0f1e;
--primitive-slate-850: #0d1424;
--primitive-slate-800: #10182c;
--primitive-slate-700: #152038;
--primitive-slate-400: #94a3b8;
--primitive-slate-300: #cbd5e1;
--primitive-slate-100: #f1f5f9;
--primitive-slate-50:  #f8fafc;

/* Accent & Semantic Primitives */
--primitive-blue-600:    #2563eb;
--primitive-blue-500:    #3b82f6;
--primitive-blue-400:    #60a5fa;
--primitive-emerald-500: #10b981;
--primitive-amber-500:   #f59e0b;
--primitive-rose-500:    #ef4444;
--primitive-purple-500:  #a855f7;

/* Spacing Scale (4px base) */
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 20px;
--space-6: 24px;
--space-8: 32px;
--space-12: 48px;

/* Typography Scale */
--font-sans: 'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
--font-mono: 'IBM Plex Mono', 'SF Mono', Consolas, monospace;

/* Radii Scale (Concentric) */
--radius-pill: 9999px;
--radius-card: 14px;
--radius-inner: 8px;
--radius-button: 8px;
```

### Tier 2: Semantic Tokens (Purpose-Driven)
```css
/* Surfaces */
--canvas:          var(--primitive-slate-950);
--surface:         var(--primitive-slate-900);
--surface-raised:  var(--primitive-slate-800);
--surface-muted:   var(--primitive-slate-850);
--surface-hover:   var(--primitive-slate-700);

/* Typography (Full WCAG AA Compliance: >= 5.5:1 on all dark surfaces) */
--text-primary:    var(--primitive-slate-50);   /* Headings, device titles (>17:1) */
--text-secondary:  var(--primitive-slate-300);  /* Controls, subtitles (>12:1) */
--text-muted:      var(--primitive-slate-400);  /* Table th, labels, metadata (>7.2:1) */
--text-faint:      #8da0b6;                     /* Micro-hints, timestamps (>5.7:1) */

/* Borders & Hairlines */
--border-subtle:   rgba(255, 255, 255, 0.07);
--border-active:   rgba(255, 255, 255, 0.14);
--border-focus:    var(--primitive-blue-500);

/* Brand & Status Tokens */
--brand-blue:      var(--primitive-blue-500);
--brand-blue-hover:var(--primitive-blue-600);
--emerald:         var(--primitive-emerald-500);
--amber:           var(--primitive-amber-500);
--rose:            var(--primitive-rose-500);
--purple:          var(--primitive-purple-500);
```

### Tier 3: Component Tokens (Context-Specific)
```css
/* Buttons */
--btn-primary-bg:        var(--primitive-blue-600);
--btn-primary-text:      #ffffff;
--btn-primary-shadow:    inset 0 1px 0 rgba(255, 255, 255, 0.15), 0 1px 2px rgba(0, 0, 0, 0.3);
--btn-danger-bg:         rgba(239, 68, 68, 0.08);
--btn-danger-border:     rgba(239, 68, 68, 0.25);
--btn-danger-text:       #f87171;

/* Cards & Modals */
--card-shadow:           inset 0 1px 0 0 rgba(255, 255, 255, 0.05), 0 2px 8px -2px rgba(0, 0, 0, 0.5);
--card-shadow-hover:     inset 0 1px 0 0 rgba(255, 255, 255, 0.08), 0 8px 24px -4px rgba(0, 0, 0, 0.6);
--modal-shadow:          0 20px 48px -8px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(255, 255, 255, 0.1);
```

---

## Part 2 — Raw Source Content

### `hidauthenticator/static/css/style.css`
See `hidauthenticator/static/css/style.css` for the complete stylesheet.
- Strict 0-slop rule: zero purple gradients, zero chromatic glow halos.
- Concentric radii: card = 14px, nested box = 8px.
- Tactile feedback: `active: transform scale(0.97)`.
