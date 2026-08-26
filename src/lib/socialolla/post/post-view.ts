export type PostListView = {
  id: string;
  externalId: string;
  destinationRef: string;
  language: string;
  status: string;
  variants: Array<{
    id: string;
    platform: string;
    title: string;
    caption: string | null;
    hashtags: string[];
    cta: string | null;
    isFinal: boolean;
    variantLocale: string;
    mediaAssetIds: string[];
  }>;
  occurrences: Array<{
    id: string;
    status: string;
    scheduleAt: Date | null;
    timezone: string;
    destinationRef: string;
  }>;
  destinations: Array<{
    externalId: string;
    platform: string;
    status: string;
    publishJobs: Array<{
      id: string;
      status: string;
      receipt: { providerObjectId: string | null } | null;
    }>;
  }>;
};

/** Explicit customer-safe projection; provider credentials and job internals stay server-side. */
export function toPostListView(post: PostListView): PostListView {
  return {
    id: post.id,
    externalId: post.externalId,
    destinationRef: post.destinationRef,
    language: post.language,
    status: post.status,
    variants: post.variants.map((variant) => ({
      id: variant.id,
      platform: variant.platform,
      title: variant.title,
      caption: variant.caption,
      hashtags: [...variant.hashtags],
      cta: variant.cta,
      isFinal: variant.isFinal,
      variantLocale: variant.variantLocale,
      mediaAssetIds: [...variant.mediaAssetIds],
    })),
    occurrences: post.occurrences.map((occurrence) => ({ ...occurrence })),
    destinations: post.destinations.map((destination) => ({
      externalId: destination.externalId,
      platform: destination.platform,
      status: destination.status,
      publishJobs: destination.publishJobs.map((job) => ({
        id: job.id,
        status: job.status,
        receipt: job.receipt ? { providerObjectId: job.receipt.providerObjectId } : null,
      })),
    })),
  };
}
