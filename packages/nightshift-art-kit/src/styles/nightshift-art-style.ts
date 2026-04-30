import type { NightshiftPalette } from "../color/nightshift-palettes.js";
import type { NightshiftFontPair } from "../type/nightshift-font-pair.js";

export interface NightshiftArtStyle {
  description: string;
  name: string;
  palette: NightshiftPalette;
  typography: NightshiftFontPair;
}
