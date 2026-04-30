import { Resvg } from "@resvg/resvg-js";
export function renderSvgToPng(svg, options) {
    const resvg = new Resvg(svg, {
        background: options.background,
        fitTo: {
            mode: "width",
            value: options.width
        },
        font: {
            loadSystemFonts: options.loadSystemFonts ?? true
        }
    });
    return resvg.render().asPng();
}
