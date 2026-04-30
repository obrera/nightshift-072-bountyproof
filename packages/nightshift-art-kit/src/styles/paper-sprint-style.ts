import { NightshiftPalettes } from "../color/nightshift-palettes.js";
import type { NightshiftArtStyle } from "./nightshift-art-style.js";

export const PaperSprintStyle: NightshiftArtStyle = {
  description: "Off-white editorial surfaces with calm rhythm and document-first structure.",
  name: "paper-sprint",
  palette: NightshiftPalettes.paperSignal,
  typography: {
    body: "Inter, Arial, sans-serif",
    display: "Fraunces, Georgia, serif"
  }
};
