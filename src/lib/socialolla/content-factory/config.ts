const CONTENT_FACTORY_ENABLED = process.env.CONTENT_FACTORY_ENABLED === "true";

export interface ContentFactoryConfig {
  enabled: boolean;
  baseUrl: string | null;
  apiSecret: string | null;
  requestTimeoutMs: number;
}

export function contentFactoryConfig(): ContentFactoryConfig {
  return {
    enabled: CONTENT_FACTORY_ENABLED,
    baseUrl: process.env.CONTENT_FACTORY_API_URL || null,
    apiSecret: process.env.CONTENT_FACTORY_API_SECRET || null,
    requestTimeoutMs: 10_000,
  };
}
