export type AngleRecommendation = {
  angleName: string;
  reason: string;
  hook: string;
};

export type ReelStructure = AngleRecommendation;

type ReelStructureInput = {
  angleRecommendations?: AngleRecommendation[];
  readyToPostHooks?: string[];
};

const fallbackStructures = [
  {
    angleName: "Problem to payoff",
    reason: "Name the audience's problem, show one useful fix, then give one clear next step.",
  },
  {
    angleName: "Proof before pitch",
    reason: "Lead with a visible result or example before explaining the offer behind it.",
  },
  {
    angleName: "Contrarian take",
    reason: "Challenge a common assumption, explain why it fails, then offer the better approach.",
  },
  {
    angleName: "Quick practical win",
    reason: "Teach one specific tip the viewer can use today, then invite them to save or share it.",
  },
  {
    angleName: "Story to action",
    reason: "Tell a short before-and-after story, connect it to the audience's goal, then make the CTA direct.",
  },
];

export function buildReelStructures(input: ReelStructureInput): ReelStructure[] {
  if (input.angleRecommendations?.length) {
    return input.angleRecommendations.slice(0, 5);
  }

  return (input.readyToPostHooks ?? []).slice(0, 5).map((hook, index) => ({
    ...fallbackStructures[index],
    hook,
  }));
}
