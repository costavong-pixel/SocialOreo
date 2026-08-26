/**
 * Provider payloads are untrusted. Only HTTPS URLs may cross into links,
 * images, CSS backgrounds, or persisted public-report fields.
 */
export function safeHttpsUrl(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || !url.hostname) return undefined;
    return value;
  } catch {
    return undefined;
  }
}
