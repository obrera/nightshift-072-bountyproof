import type { NightshiftArtStyle } from "../styles/nightshift-art-style.js";

export interface NightshiftSocialCardOptions {
  description: string;
  eyebrow: string;
  style: NightshiftArtStyle;
  subtitle: string;
  title: string;
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function buildNightshiftSocialCard(options: NightshiftSocialCardOptions) {
  const { palette, typography } = options.style;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1600" height="900" viewBox="0 0 1600 900" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="cardGradient" x1="96" y1="80" x2="1440" y2="820" gradientUnits="userSpaceOnUse">
      <stop stop-color="${palette.accent}"/>
      <stop offset="1" stop-color="${palette.accentAlt}"/>
    </linearGradient>
  </defs>
  <rect width="1600" height="900" rx="48" fill="${palette.background}"/>
  <rect x="48" y="48" width="1504" height="804" rx="36" fill="${palette.surface}" stroke="url(#cardGradient)" stroke-opacity="0.25" stroke-width="3"/>
  <circle cx="1310" cy="214" r="164" fill="url(#cardGradient)" fill-opacity="0.16"/>
  <text x="118" y="154" fill="${palette.accent}" font-size="30" font-family="${typography.body}">${escapeXml(options.eyebrow)}</text>
  <text x="118" y="314" fill="${palette.ink}" font-size="108" font-family="${typography.display}">${escapeXml(options.title)}</text>
  <text x="118" y="400" fill="${palette.ink}" font-size="46" font-family="${typography.display}">${escapeXml(options.subtitle)}</text>
  <text x="118" y="518" fill="${palette.muted}" font-size="32" font-family="${typography.body}">${escapeXml(options.description)}</text>
  <rect x="118" y="686" width="628" height="2" fill="url(#cardGradient)" fill-opacity="0.42"/>
</svg>`;
}
