import { z } from "zod";
import {
  DEFAULT_LANGUAGE,
  DEFAULT_LOCALE,
  EXTERNAL_ID_PREFIX,
  IDEMPOTENCY_KEY_PATTERN,
  POST_STATUS,
} from "./constants";

const bcp47Locale = z
  .string()
  .regex(/^[a-z]{2}(-[A-Z]{2})?$/, "expected a BCP-47 locale like en-US or zh-CN");

export const languageTag = z
  .string()
  .regex(/^[a-z]{2,3}$/, "expected an ISO 639 language tag");

export const idempotencyKeySchema = z
  .string()
  .regex(IDEMPOTENCY_KEY_PATTERN, "idempotency key must be namespaced so:<workspaceId>:<key>");

export const externalIdSchema = (prefix: string) =>
  z
    .string()
    .regex(
      new RegExp(`^${prefix}[A-Za-z0-9_-]{6,128}$`),
      `expected an external id prefixed with ${prefix}`,
    );

export const workspaceIdSchema = externalIdSchema(EXTERNAL_ID_PREFIX.workspace);
export const destinationIdSchema = externalIdSchema(EXTERNAL_ID_PREFIX.destination);
export const profileIdSchema = externalIdSchema(EXTERNAL_ID_PREFIX.profile);
export const postRequestIdSchema = externalIdSchema(EXTERNAL_ID_PREFIX.postRequest);

export const userIdentitySchema = z.object({
  authUserId: z.string().min(1, "auth user id is required"),
  email: z.string().email(),
  emailVerified: z.boolean().default(false),
  role: z.enum(["USER", "ADMIN"]).default("USER"),
});

export const localeSchema = z.object({
  locale: bcp47Locale.default(DEFAULT_LOCALE),
  interfaceLanguage: languageTag.default(DEFAULT_LANGUAGE),
  assistantLanguage: languageTag.optional(),
  profileDefaultLanguage: languageTag.optional(),
  accountDefaultLanguage: languageTag.optional(),
  contentLanguage: languageTag.optional(),
  notificationLanguage: languageTag.optional(),
});

export const workspaceSchema = z.object({
  id: workspaceIdSchema,
  ownerAuthUserId: z.string().min(1),
  label: z.string().trim().min(1).max(120),
  defaultLocale: bcp47Locale.default(DEFAULT_LOCALE),
  createdAt: z.iso.datetime().optional(),
});

export const destinationSchema = z.object({
  id: destinationIdSchema,
  workspaceId: workspaceIdSchema,
  label: z.string().trim().min(1).max(80),
  platform: z.string().min(1),
  platformUserId: z.string().optional(),
  accountLabel: z.string().optional(),
  status: z.enum(["CONNECTED", "REAUTH_REQUIRED", "DISCONNECTED"]).default("DISCONNECTED"),
  providerDisabled: z.boolean().default(true),
});

export const profileSchema = z.object({
  id: profileIdSchema,
  workspaceId: workspaceIdSchema,
  handle: z.string().trim().min(1).max(80),
  name: z.string().trim().max(120).optional(),
  platform: z.string().min(1),
  locale: bcp47Locale.optional(),
  defaultLanguage: languageTag.optional(),
});

export const entitlementsSchema = z.object({
  maxWatchCompetitors: z.number().int().min(0).default(3),
  maxDestinations: z.number().int().min(0).default(1),
  includedMonthlyCredits: z.number().int().min(0).default(0),
  postCreditsPerRequest: z.number().int().min(0).default(1),
});

export const planVersionSchema = z.object({
  id: z.string().min(1),
  version: z.number().int().min(1),
  name: z.string().min(1),
  entitlements: entitlementsSchema,
});

export const entitlementSnapshotSchema = z.object({
  id: externalIdSchema(EXTERNAL_ID_PREFIX.entitlementSnapshot),
  workspaceId: workspaceIdSchema,
  planVersionId: z.string().min(1),
  validFrom: z.iso.datetime(),
  entitlements: entitlementsSchema,
});

export const creditBatchKindSchema = z.enum(["MONTHLY", "PURCHASED"]);

export const creditBatchSchema = z.object({
  id: externalIdSchema(EXTERNAL_ID_PREFIX.creditBatch),
  workspaceId: workspaceIdSchema,
  kind: creditBatchKindSchema,
  amount: z.number().int().positive(),
  remaining: z.number().int().nonnegative(),
  expiresAt: z.iso.datetime().nullable().default(null),
  createdAt: z.iso.datetime(),
});

export const creditTransactionKindSchema = z.enum(["HOLD", "FINALIZE", "REFUND", "ADJUSTMENT"]);

export const creditTransactionSchema = z.object({
  kind: creditTransactionKindSchema,
  batchId: externalIdSchema(EXTERNAL_ID_PREFIX.creditBatch),
  amount: z.number().int().positive(),
  reference: z.string().min(1),
  idempotencyKey: idempotencyKeySchema,
  createdAt: z.iso.datetime().optional(),
});

export const auditEventSchema = z.object({
  id: externalIdSchema(EXTERNAL_ID_PREFIX.auditEvent),
  workspaceId: workspaceIdSchema.optional(),
  actorAuthUserId: z.string().optional(),
  eventType: z.string().min(1),
  payload: z.record(z.string(), z.unknown()).default({}),
  occurredAt: z.iso.datetime(),
});

export const serviceIdentitySchema = z.object({
  service: z.enum(["socialoreo", "content-factory"]),
  workspaceExternalId: workspaceIdSchema,
  requestId: z.string().min(1),
  idempotencyKey: idempotencyKeySchema.optional(),
  issuedAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
});

export const postStatusSchema = z.enum(POST_STATUS);

export const postRequestContractSchema = z.object({
  id: postRequestIdSchema,
  workspaceId: workspaceIdSchema,
  destinationRef: destinationIdSchema,
  profileRef: profileIdSchema.optional(),
  locale: localeSchema,
  language: languageTag,
  requestedCount: z.number().int().min(1).max(100).default(10),
  status: postStatusSchema,
  evidence: z.array(z.unknown()).default([]),
  createdAt: z.iso.datetime(),
});

export const postRequestCreateSchema = postRequestContractSchema
  .pick({
    workspaceId: true,
    destinationRef: true,
    profileRef: true,
    locale: true,
    language: true,
    requestedCount: true,
  })
  .extend({
    idempotencyKey: idempotencyKeySchema,
  });

export type UserIdentity = z.infer<typeof userIdentitySchema>;
export type Locale = z.infer<typeof localeSchema>;
export type Workspace = z.infer<typeof workspaceSchema>;
export type Destination = z.infer<typeof destinationSchema>;
export type Profile = z.infer<typeof profileSchema>;
export type PlanVersion = z.infer<typeof planVersionSchema>;
export type EntitlementSnapshot = z.infer<typeof entitlementSnapshotSchema>;
export type CreditBatch = z.infer<typeof creditBatchSchema>;
export type CreditTransaction = z.infer<typeof creditTransactionSchema>;
export type AuditEvent = z.infer<typeof auditEventSchema>;
export type ServiceIdentity = z.infer<typeof serviceIdentitySchema>;
export type PostStatus = z.infer<typeof postStatusSchema>;
export type PostRequestContract = z.infer<typeof postRequestContractSchema>;
export type PostRequestCreate = z.infer<typeof postRequestCreateSchema>;
