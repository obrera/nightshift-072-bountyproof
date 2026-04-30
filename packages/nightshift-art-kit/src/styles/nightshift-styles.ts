import { GlassForgeStyle } from "./glass-forge-style.js";
import type { NightshiftArtStyle } from "./nightshift-art-style.js";
import { PaperSprintStyle } from "./paper-sprint-style.js";
import { SignalNoirStyle } from "./signal-noir-style.js";

export const NightshiftStyles = {
  glassForge: GlassForgeStyle,
  paperSprint: PaperSprintStyle,
  signalNoir: SignalNoirStyle
} satisfies Record<string, NightshiftArtStyle>;

export type NightshiftStyleName = keyof typeof NightshiftStyles;

export function getNightshiftArtStyle(styleName: NightshiftStyleName) {
  return NightshiftStyles[styleName];
}
