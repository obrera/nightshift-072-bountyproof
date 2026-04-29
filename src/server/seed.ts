import type { AppState, AuditEventRecord, BountyProgramRecord } from "../shared/contracts.js";

function buildProgram(): BountyProgramRecord {
  return {
    id: "bp_072_main",
    slug: "bountyproof-build-072",
    title: "BountyProof Launch Review Program",
    sponsor: "Nightshift",
    summary:
      "Submit implementation evidence for build 072 programs, move packets through reviewer scoring, and mint durable proof assets after approval.",
    status: "open",
    openedAt: "2026-04-29T00:00:00.000Z",
    closesAt: "2026-05-13T00:00:00.000Z",
    rubric: [
      {
        id: "impact",
        label: "Impact",
        description: "How strongly the work advances the bounty objective.",
        weight: 0.4
      },
      {
        id: "quality",
        label: "Quality",
        description: "Technical quality, clarity, and completeness of the proof packet.",
        weight: 0.35
      },
      {
        id: "reproducibility",
        label: "Reproducibility",
        description: "How easily a reviewer can verify the claims from the attached evidence.",
        weight: 0.25
      }
    ]
  };
}

export function createSeedState(): AppState {
  return {
    version: 72,
    users: [],
    sessions: [],
    authChallenges: [],
    programs: [buildProgram()],
    submissions: [],
    reviews: [],
    proofMints: [],
    auditTrail: [] satisfies AuditEventRecord[]
  };
}
