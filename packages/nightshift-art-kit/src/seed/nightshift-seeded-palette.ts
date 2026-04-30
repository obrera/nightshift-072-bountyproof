import {
  NightshiftPalettes,
  type NightshiftPalette,
  type NightshiftPaletteName
} from "../color/nightshift-palettes.js";
import { hashSeed } from "./hash-seed.js";

export function createNightshiftSeededPalette(seed: string, paletteNames?: NightshiftPaletteName[]) {
  const availablePalettes = paletteNames?.length
    ? paletteNames.map((paletteName) => NightshiftPalettes[paletteName])
    : Object.values(NightshiftPalettes);

  return availablePalettes[hashSeed(seed) % availablePalettes.length] as NightshiftPalette;
}
