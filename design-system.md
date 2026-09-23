# HIDShield-X Design System: Clean Infrastructure, Zero AI Slop

*Inspired by BrainGrid's "Design Systems for AI Coding: Stop Getting Purple Gradients" & Linear/Stripe design standards.*

## Core Philosophy
1. **Zero AI Slop**: No generic purple-to-blue gradients. No zero-offset chromatic glow halos. No overused AI fonts (`Inter`, `Plus Jakarta Sans`). No `border-left` side-tab accents.
2. **Three-Tier Token Architecture**: Raw primitives $\rightarrow$ Purpose-driven semantic tokens $\rightarrow$ Component-level tokens.
3. **Hardware-Grade Authority**: Built for USB/HID peripheral trust management. Typography uses `IBM Plex Sans` for UI copy and `IBM Plex Mono` for hardware VID:PID, serial numbers, and hex descriptors.
4. **Full WCAG AA Accessibility**: All text tokens guarantee $\ge 5.5:1$ contrast ratio against their respective surface backgrounds.

---

## 1. Three-Tier Token Architecture

### Tier 1: Primitives (Raw Values)
Raw values that establish the physical palette and spacing scale. Never used directly in UI components.

```css
/* Surface & Neutral Scale */
--slate-950: #050811;  /* Deepest canvas */
--slate-900: #0a0f1e;  /* Base surface */
--slate-850: #0d1424;  /* Muted inset surface */
--slate-800: #10182c;  /* Elevated card surface */
--slate-700: #152038;  /* Hover state */
--slate-400: #94a3b8;  /* Muted text (contrast > 7.2:1) */
--slate-300: #cbd5e1;  /* Secondary text (contrast > 12:1) */
--slate-50:  #f8fafc;  /* Primary text (contrast > 17:1) */

/* Functional Accents */
--blue-600:    #2563eb;
--blue-500:    #3b82f6;
--blue-400:    #60a5fa;
--emerald-500: #10b981;
--amber-500:   #f59e0b;
--rose-500:    #ef4444;
--purple-500:  #a855f7;

/* Spacing Scale (4px increments) */
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 20px;
--space-6: 24px;
--space-8: 32px;

/* Concentric Radii */
--radius-card:   14px;
--radius-inner:  8px;
--radius-pill:   9999px;
```

### Tier 2: Semantic Tokens (Purpose-Driven)
Tokens assigned semantic purpose. The UI consumes these tokens to ensure consistent theming.

```css
/* Surfaces */
--canvas:          var(--slate-950);
--surface:         var(--slate-900);
--surface-raised:  var(--slate-800);
--surface-muted:   var(--slate-850);
--surface-hover:   var(--slate-700);

/* Typography */
--text-primary:    var(--slate-50);
--text-secondary:  var(--slate-300);
--text-muted:      var(--slate-400);
--text-faint:      #8da0b6;

/* Borders & Hairlines */
--border-subtle:   rgba(255, 255, 255, 0.07);
--border-active:   rgba(255, 255, 255, 0.14);
--border-focus:    var(--blue-500);

/* Status Intent */
--color-authorized: var(--emerald-500);
--color-review:     var(--amber-500);
--color-declined:   var(--rose-500);
--color-revoked:    var(--purple-500);
```

### Tier 3: Component Tokens (Context-Specific)
```css
/* Button Primitives */
--btn-primary-bg:     var(--blue-600);
--btn-primary-hover:  #1d4ed8;
--btn-primary-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.15), 0 1px 2px rgba(0, 0, 0, 0.3);

--btn-danger-bg:      rgba(239, 68, 68, 0.08);
--btn-danger-border:  rgba(239, 68, 68, 0.25);
--btn-danger-text:    #f87171;

/* Elevation & Depth */
--shadow-card:        inset 0 1px 0 0 rgba(255, 255, 255, 0.05), 0 2px 8px -2px rgba(0, 0, 0, 0.5);
--shadow-card-hover:  inset 0 1px 0 0 rgba(255, 255, 255, 0.08), 0 8px 24px -4px rgba(0, 0, 0, 0.6);
--shadow-modal:       0 20px 48px -8px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(255, 255, 255, 0.1);
```

---

## 2. Interaction & Micro-Animation Standards
- **Tactile Button Press**: `active: transform: scale(0.97)` with `cubic-bezier(0.32, 0.72, 0, 1)` easing for authentic physical feel.
- **Card Hover Elevation**: Lift card by `-2px`, elevate shadow to `--shadow-card-hover`, and brighten hairline border to `--border-active`.
- **Optical Inset Alignment**: All bordered containers must maintain at least 12px internal padding (`--space-3`) so nested children never land flush against container boundaries.
- **Zero Halo Glows**: Colored shadows (`0 0 20px rgba(59, 130, 246, 0.4)`) are banned. Neutral elevation shadows (`rgba(0, 0, 0, 0.5)`) provide genuine optical depth.

---

## 3. Prompt Pattern for Future AI Features
When generating new UI components for this application, provide the following context:

```markdown
## Context
- Design System: /design-system.md
- Tokens: /hidauthenticator/static/css/style.css
- Fonts: IBM Plex Sans (UI) & IBM Plex Mono (IDs/Hex)

## Constraints
- Never use raw hex codes in components; reference CSS variables (`var(--text-muted)`).
- Never use purple gradients or colored box-shadow halos.
- Heading hierarchy must strictly follow h1 -> h2 -> h3 without skipping levels.
- Table headers and microcopy must maintain >= 4.5:1 contrast against dark backgrounds.
- All interactive controls must implement active:scale(0.97) tactile feedback.
```
