import { AngleStatus } from "@prisma/client";
import { z } from "zod";

export const angleStatusOptions = [
  { value: AngleStatus.DRAFT, label: "Draft" },
  { value: AngleStatus.ACTIVE, label: "Active" },
  { value: AngleStatus.ARCHIVED, label: "Archived" },
] as const;

export const angleLibraryInputSchema = z.object({
  angleName: z.string().trim().min(1, "Angle name is required.").max(200),
  category: z.string().trim().min(1, "Category is required."),
  platformFit: z.array(z.string().trim().min(1)).min(1, "Add at least one platform."),
  nicheFit: z.array(z.string().trim().min(1)).min(1, "Add at least one niche."),
  occasionFit: z.array(z.string().trim().min(1)).min(1, "Add at least one occasion."),
  goalFit: z.array(z.string().trim().min(1)).min(1, "Add at least one goal."),
  tone: z.array(z.string().trim().min(1)).min(1, "Add at least one tone."),
  hookFormula: z.string().trim().min(1, "Hook formula is required."),
  ctaFormula: z.string().trim().optional(),
  scriptStructure: z.string().trim().optional(),
  shotListPattern: z.string().trim().optional(),
  captionPattern: z.string().trim().optional(),
  riskLevel: z.string().trim().optional(),
  example: z.string().trim().optional(),
  whenToUse: z.string().trim().optional(),
  whenNotToUse: z.string().trim().optional(),
  status: z.nativeEnum(AngleStatus).optional(),
  internalOnly: z.boolean().optional(),
});

export const angleLibraryUpdateSchema = angleLibraryInputSchema.partial();

export type AngleLibraryInput = z.infer<typeof angleLibraryInputSchema>;

export type AngleLibraryRecord = {
  id: string;
  angleName: string;
  category: string;
  platformFit: string[];
  nicheFit: string[];
  occasionFit: string[];
  goalFit: string[];
  tone: string[];
  hookFormula: string;
  ctaFormula: string | null;
  scriptStructure: string | null;
  shotListPattern: string | null;
  captionPattern: string | null;
  riskLevel: string | null;
  example: string | null;
  whenToUse: string | null;
  whenNotToUse: string | null;
  status: AngleStatus;
  internalOnly: boolean;
  createdAt: string;
  updatedAt: string;
};

export function parseTagList(input: string): string[] {
  return [...new Set(input.split(",").map((value) => value.trim()).filter(Boolean))];
}

export function formatTagList(values: string[]): string {
  return values.join(", ");
}
