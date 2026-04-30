import type { NightshiftArtStyle } from "./nightshift-art-style.js";
export declare const NightshiftStyles: {
    glassForge: NightshiftArtStyle;
    paperSprint: NightshiftArtStyle;
    signalNoir: NightshiftArtStyle;
};
export type NightshiftStyleName = keyof typeof NightshiftStyles;
export declare function getNightshiftArtStyle(styleName: NightshiftStyleName): NightshiftArtStyle;
