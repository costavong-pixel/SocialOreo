const stringArrayFields = [
  "strengths",
  "weaknesses",
  "actionPlan",
  "readyToPostHooks",
  "readyToPostScripts",
  "ctaOptions",
  "captionPack",
  "hashtagPack",
] as const;

const preferredTextKeys = [
  "text",
  "content",
  "value",
  "hook",
  "script",
  "caption",
  "cta",
  "tag",
  "hashtag",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function coerceString(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  if (!isRecord(value)) {
    return undefined;
  }

  for (const key of preferredTextKeys) {
    const text = coerceString(value[key]);
    if (text) {
      return text;
    }
  }

  const nestedStrings = Object.values(value)
    .map((nestedValue) => coerceString(nestedValue))
    .filter((nestedValue): nestedValue is string => Boolean(nestedValue));

  return nestedStrings.length > 0 ? nestedStrings.join(" ") : undefined;
}

function flattenStringValues(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(flattenStringValues);
  }

  if (isRecord(value)) {
    const directString = coerceString(value);
    if (directString) {
      return [directString];
    }

    return Object.values(value).flatMap(flattenStringValues);
  }

  const stringValue = coerceString(value);
  return stringValue ? [stringValue] : [];
}

export function normalizeAuditAnalysisCandidate(candidate: unknown): unknown {
  if (!isRecord(candidate)) {
    return candidate;
  }

  return {
    ...candidate,
    ...Object.fromEntries(
      stringArrayFields.map((field) => {
        const normalized = flattenStringValues(candidate[field]);
        return [field, normalized.length > 0 ? normalized : candidate[field]];
      }),
    ),
  };
}
