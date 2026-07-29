import { z } from "zod";

export const contactRequestSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(254),
  message: z.string().trim().min(10).max(2_000),
  website: z.string().max(0).optional(),
});
