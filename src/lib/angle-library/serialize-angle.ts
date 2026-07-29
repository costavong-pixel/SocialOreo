import type { AngleLibrary } from "@prisma/client";

import type { AngleLibraryRecord } from "./types";

export function serializeAngle(angle: AngleLibrary): AngleLibraryRecord {
  return {
    id: angle.id,
    angleName: angle.angleName,
    category: angle.category,
    platformFit: angle.platformFit,
    nicheFit: angle.nicheFit,
    occasionFit: angle.occasionFit,
    goalFit: angle.goalFit,
    tone: angle.tone,
    hookFormula: angle.hookFormula,
    ctaFormula: angle.ctaFormula,
    scriptStructure: angle.scriptStructure,
    shotListPattern: angle.shotListPattern,
    captionPattern: angle.captionPattern,
    riskLevel: angle.riskLevel,
    example: angle.example,
    whenToUse: angle.whenToUse,
    whenNotToUse: angle.whenNotToUse,
    status: angle.status,
    internalOnly: angle.internalOnly,
    createdAt: angle.createdAt.toISOString(),
    updatedAt: angle.updatedAt.toISOString(),
  };
}
