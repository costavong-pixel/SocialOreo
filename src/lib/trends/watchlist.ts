import { TrendPlatform, TrendSourceType } from "@prisma/client";

export const trendPlatforms = [TrendPlatform.INSTAGRAM, TrendPlatform.TIKTOK, TrendPlatform.YOUTUBE] as const;
export const trendSourceTypes = [TrendSourceType.KEYWORD, TrendSourceType.HASHTAG, TrendSourceType.CREATOR] as const;

export type TrendWatchlistInput = {
  platform: TrendPlatform;
  sourceType: TrendSourceType;
  query: string;
};

function enumValue<T extends readonly string[]>(value: FormDataEntryValue | null, values: T): T[number] | null {
  return typeof value === "string" && values.includes(value) ? value : null;
}

export function normalizeTrendWatchlistInput(formData: FormData): TrendWatchlistInput | null {
  const platform = enumValue(formData.get("platform"), trendPlatforms);
  const sourceType = enumValue(formData.get("sourceType"), trendSourceTypes);
  const rawQuery = typeof formData.get("query") === "string" ? String(formData.get("query")) : "";
  const trimmed = rawQuery.trim().replace(/\s+/g, " ");

  if (!platform || !sourceType || !trimmed || trimmed.length > 160) return null;

  const query = sourceType === TrendSourceType.HASHTAG
    ? trimmed.replace(/^#/, "").replace(/\s+/g, "").toLowerCase()
    : sourceType === TrendSourceType.CREATOR
      ? trimmed.replace(/^@/, "").toLowerCase()
      : trimmed.toLowerCase();

  return query ? { platform, sourceType, query } : null;
}
