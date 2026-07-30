# Design — Guess the Player

A locked design system for the game. Landing, Game, Reveal, and Results share
one visual language and preserve the existing React state and API boundaries.

## Genre

Playful competition: warm and tactile, but precise enough for deliberate match reading.

## Macrostructure family

- App screens: **Workbench**, with match evidence occupying the primary column.
- Intro/results screens: **Split Diptych**, with an asymmetric score or rules panel.
- Components: N7 scoreboard header · F3 tabular evidence · C1 quiet secondary actions · Ft8 rules ticker.

## Theme

- `--color-paper`: `oklch(97% 0.012 95)`
- `--color-ink`: `oklch(20% 0.012 250)`
- Primary action: pear `oklch(86% 0.18 95)`
- Evidence/focus: cyan `oklch(72% 0.15 225)`
- Wrong/high-energy state: coral `oklch(64% 0.21 24)`
- Correct state: mint `oklch(75% 0.14 155)`

## Typography

- Display/body: Plus Jakarta Sans, weights 400–700, roman.
- Data/labels: JetBrains Mono, weights 400–600.
- Display tracking: `-0.035em`.

## Spacing and motion

Use the 4-point named scale in `tokens.css`. Motion is limited to tactile button
presses, choice hover response, and the landing rules ticker. Reduced motion
removes spatial movement and stops the ticker.

## CTA voice

- Primary: pear push-button, short verb labels, visible physical press.
- Secondary: quiet outlined or text action.
- Every target is at least 44 px and has an immediate focus ring.

## What screens must share

The slab wordmark, palette, type pairing, button physics, evidence-table rhythm,
and one consistent correct/wrong language.

## Exports

### tokens.css

The canonical values live in `tokens.css`.

### Tailwind v4

```css
@theme {
  --color-paper: oklch(97% 0.012 95);
  --color-paper-2: oklch(94% 0.016 95);
  --color-ink: oklch(20% 0.012 250);
  --color-accent: oklch(86% 0.18 95);
  --color-focus: oklch(35% 0.15 265);
  --font-display: "Plus Jakarta Sans", sans-serif;
  --font-body: "Plus Jakarta Sans", sans-serif;
  --font-outlier: "JetBrains Mono", monospace;
  --spacing-sm: 1rem;
  --spacing-md: 1.5rem;
  --spacing-lg: 2rem;
  --radius-card: 1.25rem;
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
}
```

### DTCG

```json
{
  "$schema": "https://design-tokens.github.io/community-group/format/",
  "color": {
    "paper": { "$value": "oklch(97% 0.012 95)", "$type": "color" },
    "ink": { "$value": "oklch(20% 0.012 250)", "$type": "color" },
    "accent": { "$value": "oklch(86% 0.18 95)", "$type": "color" },
    "focus": { "$value": "oklch(35% 0.15 265)", "$type": "color" }
  },
  "font": {
    "display": { "$value": "Plus Jakarta Sans", "$type": "fontFamily" },
    "outlier": { "$value": "JetBrains Mono", "$type": "fontFamily" }
  },
  "space": {
    "md": { "$value": "1.5rem", "$type": "dimension" }
  }
}
```

### shadcn/ui

```css
:root {
  --background: 97% 0.012 95;
  --foreground: 20% 0.012 250;
  --primary: 86% 0.18 95;
  --primary-foreground: 20% 0.012 250;
  --secondary: 94% 0.016 95;
  --secondary-foreground: 31% 0.018 250;
  --border: 80% 0.025 95;
  --ring: 45% 0.2 265;
  --radius: 1.25rem;
}
```
