export function buildNightshiftMetadataImage(options) {
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
