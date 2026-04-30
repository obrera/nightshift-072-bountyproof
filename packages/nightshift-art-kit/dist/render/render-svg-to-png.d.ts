export interface RenderSvgToPngOptions {
    background?: string;
    loadSystemFonts?: boolean;
    width: number;
}
export declare function renderSvgToPng(svg: string, options: RenderSvgToPngOptions): Buffer<ArrayBufferLike>;
