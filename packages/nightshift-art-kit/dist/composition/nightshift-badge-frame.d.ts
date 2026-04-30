import type { NightshiftArtStyle } from "../styles/nightshift-art-style.js";
export interface NightshiftBadgeFrameOptions {
    eyebrow: string;
    style: NightshiftArtStyle;
    subtitle: string;
    title: string;
}
export declare function buildNightshiftBadgeFrame(options: NightshiftBadgeFrameOptions): string;
