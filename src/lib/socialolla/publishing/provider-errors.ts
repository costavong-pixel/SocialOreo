export class PublishingProviderDisabledError extends Error {
  constructor(platform: string) {
    super(`Live publishing is disabled for ${platform}; no provider request was made.`);
    this.name = "PublishingProviderDisabledError";
  }
}

export class PublishingProviderClaimLostError extends Error {
  constructor() {
    super("Publish job ownership was lost before the provider request.");
    this.name = "PublishingProviderClaimLostError";
  }
}
