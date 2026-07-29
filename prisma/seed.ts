import { AngleStatus, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const starterAngles = [
  {
    angleName: "Local urgency drop",
    category: "promo",
    platformFit: ["instagram", "tiktok"],
    nicheFit: ["restaurant", "local_business", "food"],
    occasionFit: ["holiday_promo", "local_event"],
    goalFit: ["foot_traffic", "sales"],
    tone: ["direct", "funny"],
    hookFormula: "[City], this is only happening today...",
    ctaFormula: "Show this before [time].",
    scriptStructure: "Hook → offer → proof → urgency CTA",
    riskLevel: "low",
    example: "Austin, this lunch deal ends at 2pm.",
    whenToUse: "Same-day promos and local foot traffic pushes.",
    whenNotToUse: "Evergreen authority content with no deadline.",
    status: AngleStatus.ACTIVE,
    internalOnly: true,
  },
  {
    angleName: "Painful truth",
    category: "authority",
    platformFit: ["instagram"],
    nicheFit: ["coaching", "fitness", "beauty"],
    occasionFit: ["personal_brand_growth", "evergreen_content"],
    goalFit: ["authority", "comments", "followers"],
    tone: ["expert", "spicy"],
    hookFormula: "Nobody tells you this about [topic]...",
    ctaFormula: "Save this if you are serious about [goal].",
    scriptStructure: "Contrarian hook → why common advice fails → better frame → CTA",
    riskLevel: "medium",
    example: "Nobody tells you this about growing on Instagram in 2026...",
    whenToUse: "Authority building and comment-driving educational reels.",
    whenNotToUse: "Hard promo pushes where trust is already low.",
    status: AngleStatus.ACTIVE,
    internalOnly: true,
  },
];

async function main() {
  for (const angle of starterAngles) {
    const existing = await prisma.angleLibrary.findFirst({
      where: { angleName: angle.angleName },
    });

    if (existing) {
      continue;
    }

    await prisma.angleLibrary.create({ data: angle });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
