import { z } from "zod";

import { campaignBriefSchema } from "@/lib/campaign-brief/types";

export const requestedTierSchema = z.enum(["free", "paid"]);

export const createAuditSchema = z
  .object({
    url: z.string().trim().min(1),
    campaignBrief: campaignBriefSchema,
    requestedTier: requestedTierSchema.optional(),
  })
  .strict();

export type CreateAuditRequest = z.infer<typeof createAuditSchema>;
