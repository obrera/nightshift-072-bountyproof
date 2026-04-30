import { Resvg } from "@resvg/resvg-js";

export interface RenderSvgToPngOptions {
  background?: string;
  loadSystemFonts?: boolean;
  width: number;
}

export function renderSvgToPng(svg: string, options: RenderSvgToPngOptions) {
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
