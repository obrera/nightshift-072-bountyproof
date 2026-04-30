import { NightshiftPalettes } from "../color/nightshift-palettes.js";
import type { NightshiftArtStyle } from "./nightshift-art-style.js";

export const SignalNoirStyle: NightshiftArtStyle = {
  description: "Editorial dark ops surfaces with disciplined neon accents.",
  name: "signal-noir",
  palette: NightshiftPalettes.emberMint,
  typography: {
    body: "Inter, Arial, sans-serif",
    display: "Cormorant Garamond, Georgia, serif"
  }
};
