export interface NightshiftMetadataImageOptions {
    externalUrl: string;
    imageMimeType?: string;
    imageUrl: string;
}
export declare function buildNightshiftMetadataImage(options: NightshiftMetadataImageOptions): {
    external_url: string;
    image: string;
    properties: {
        category: string;
        files: {
            type: string;
            uri: string;
        }[];
    };
};
