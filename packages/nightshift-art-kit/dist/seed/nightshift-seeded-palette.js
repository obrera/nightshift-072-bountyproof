import { NightshiftPalettes } from "../color/nightshift-palettes.js";
import { hashSeed } from "./hash-seed.js";
export function createNightshiftSeededPalette(seed, paletteNames) {
    const availablePalettes = paletteNames?.length
        ? paletteNames.map((paletteName) => NightshiftPalettes[paletteName])
        : Object.values(NightshiftPalettes);
    return availablePalettes[hashSeed(seed) % availablePalettes.length];
}
