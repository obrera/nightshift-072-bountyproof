export interface NightshiftMetadataImageOptions {
  externalUrl: string;
  imageMimeType?: string;
  imageUrl: string;
}

export function buildNightshiftMetadataImage(options: NightshiftMetadataImageOptions) {
  return {
    external_url: options.externalUrl,
    image: options.imageUrl,
    properties: {
      category: "image",
      files: [
        {
          type: options.imageMimeType ?? "image/png",
          uri: options.imageUrl
        }
      ]
    }
  };
}
