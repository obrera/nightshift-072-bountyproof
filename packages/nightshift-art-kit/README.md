# @obrera/nightshift-art-kit

Reusable visual primitives for Nightshift builds.

## Current modules

- `@obrera/nightshift-art-kit/render/render-svg-to-png`
- `@obrera/nightshift-art-kit/render/nightshift-metadata-image`
- `@obrera/nightshift-art-kit/seed/hash-seed`
- `@obrera/nightshift-art-kit/seed/nightshift-seeded-palette`
- `@obrera/nightshift-art-kit/seed/pick-seeded-value`
- `@obrera/nightshift-art-kit/color/nightshift-palettes`
- `@obrera/nightshift-art-kit/styles/nightshift-styles`
- `@obrera/nightshift-art-kit/styles/signal-noir-style`
- `@obrera/nightshift-art-kit/styles/glass-forge-style`
- `@obrera/nightshift-art-kit/styles/paper-sprint-style`
- `@obrera/nightshift-art-kit/composition/nightshift-badge-frame`
- `@obrera/nightshift-art-kit/composition/nightshift-social-card`

## Example

```ts
import { buildNightshiftBadgeFrame } from "@obrera/nightshift-art-kit/composition/nightshift-badge-frame";
import { renderSvgToPng } from "@obrera/nightshift-art-kit/render/render-svg-to-png";
import { SignalNoirStyle } from "@obrera/nightshift-art-kit/styles/signal-noir-style";

const svg = buildNightshiftBadgeFrame({
  eyebrow: "Nightshift 074",
  style: SignalNoirStyle,
  subtitle: "Proof of completion",
  title: "Ship It"
});

const png = renderSvgToPng(svg, { width: 1024 });
```
