import { GlassForgeStyle } from "./glass-forge-style.js";
import { PaperSprintStyle } from "./paper-sprint-style.js";
import { SignalNoirStyle } from "./signal-noir-style.js";
export const NightshiftStyles = {
    glassForge: GlassForgeStyle,
    paperSprint: PaperSprintStyle,
    signalNoir: SignalNoirStyle
};
export function getNightshiftArtStyle(styleName) {
    return NightshiftStyles[styleName];
}
