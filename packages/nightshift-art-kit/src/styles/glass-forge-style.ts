import { NightshiftPalettes } from "../color/nightshift-palettes.js";
import type { NightshiftArtStyle } from "./nightshift-art-style.js";

export const GlassForgeStyle: NightshiftArtStyle = {
  description: "Rich dark backdrop, premium gradients, and polished highlight surfaces.",
  name: "glass-forge",
  palette: NightshiftPalettes.glassAurora,
  typography: {
    body: "Inter, Arial, sans-serif",
    display: "Space Grotesk, Inter, Arial, sans-serif"
  }
};
