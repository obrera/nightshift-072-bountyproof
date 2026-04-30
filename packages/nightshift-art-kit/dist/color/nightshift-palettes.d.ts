export interface NightshiftPalette {
    accent: string;
    accentAlt: string;
    background: string;
    ink: string;
    muted: string;
    surface: string;
}
export declare const NightshiftPalettes: {
    emberMint: {
        accent: string;
        accentAlt: string;
        background: string;
        ink: string;
        muted: string;
        surface: string;
    };
    glassAurora: {
        accent: string;
        accentAlt: string;
        background: string;
        ink: string;
        muted: string;
        surface: string;
    };
    paperSignal: {
        accent: string;
        accentAlt: string;
        background: string;
        ink: string;
        muted: string;
        surface: string;
    };
};
export type NightshiftPaletteName = keyof typeof NightshiftPalettes;
