export interface ContentFactoryConfig {
  enabled: boolean;
  allowInMemoryStub: boolean;
  baseUrl: string | null;
  apiSecret: string | null;
  requestTimeoutMs: number;
}

export function contentFactoryConfig(): ContentFactoryConfig {
  return {
    enabled: process.env.CONTENT_FACTORY_ENABLED === "true",
    allowInMemoryStub: process.env.NODE_ENV === "test" && process.env.CONTENT_FACTORY_ALLOW_IN_MEMORY_STUB !== "false",
    baseUrl: process.env.CONTENT_FACTORY_API_URL || null,
    apiSecret: process.env.CONTENT_FACTORY_API_SECRET || null,
    requestTimeoutMs: 10_000,
  };
}
