import type { NightshiftArtStyle } from "../styles/nightshift-art-style.js";
export interface NightshiftSocialCardOptions {
    description: string;
    eyebrow: string;
    style: NightshiftArtStyle;
    subtitle: string;
    title: string;
}
export declare function buildNightshiftSocialCard(options: NightshiftSocialCardOptions): string;
