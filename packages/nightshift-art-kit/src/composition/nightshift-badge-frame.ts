import type { NightshiftArtStyle } from "../styles/nightshift-art-style.js";

export interface NightshiftBadgeFrameOptions {
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

export function buildNightshiftBadgeFrame(options: NightshiftBadgeFrameOptions) {
  const { palette, typography } = options.style;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1024" height="1024" viewBox="0 0 1024 1024" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="badgeGradient" x1="112" y1="96" x2="880" y2="928" gradientUnits="userSpaceOnUse">
      <stop stop-color="${palette.accent}"/>
      <stop offset="1" stop-color="${palette.accentAlt}"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" rx="72" fill="${palette.background}"/>
  <rect x="40" y="40" width="944" height="944" rx="52" fill="${palette.surface}" stroke="url(#badgeGradient)" stroke-opacity="0.32" stroke-width="4"/>
  <circle cx="512" cy="348" r="188" fill="url(#badgeGradient)" fill-opacity="0.18"/>
  <circle cx="512" cy="348" r="132" fill="url(#badgeGradient)" fill-opacity="0.78"/>
  <text x="512" y="618" text-anchor="middle" fill="${palette.accent}" font-size="30" font-family="${typography.body}">${escapeXml(options.eyebrow)}</text>
  <text x="512" y="700" text-anchor="middle" fill="${palette.ink}" font-size="82" font-family="${typography.display}">${escapeXml(options.title)}</text>
  <text x="512" y="764" text-anchor="middle" fill="${palette.muted}" font-size="32" font-family="${typography.body}">${escapeXml(options.subtitle)}</text>
  <rect x="248" y="826" width="528" height="2" fill="url(#badgeGradient)" fill-opacity="0.42"/>
</svg>`;
}
