export type UserRole = "contributor" | "reviewer" | "operator";

export interface UserRecord {
  id: string;
  walletAddress: string;
  displayName: string;
  role: UserRole;
  createdAt: string;
  lastAuthenticatedAt: string;
}

export interface UserSummary {
  id: string;
  walletAddress: string;
  displayName: string;
  role: UserRole;
  createdAt: string;
  lastAuthenticatedAt: string;
}

export interface SessionRecord {
  id: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
}

export interface AuthChallengeRecord {
  id: string;
  walletAddress: string;
  nonce: string;
  domain: string;
  uri: string;
  chainId: string;
  statement: string;
  issuedAt: string;
  expirationTime: string;
  createdAt: string;
  expiresAt: string;
}

export interface BountyProgramRecord {
  id: string;
  slug: string;
  title: string;
  sponsor: string;
  summary: string;
  status: "open" | "reviewing" | "closed";
  openedAt: string;
  closesAt: string;
  rubric: RubricCriterionDefinition[];
}

export interface RubricCriterionDefinition {
  id: string;
  label: string;
  description: string;
  weight: number;
}

export type SubmissionStatus = "draft" | "in_review" | "approved" | "rejected";

export interface SubmissionPacketRecord {
  id: string;
  programId: string;
  submitterUserId: string;
  title: string;
  summary: string;
  proofLinks: string[];
  tags: string[];
  note: string;
  status: SubmissionStatus;
  createdAt: string;
  updatedAt: string;
  finalizedAt?: string;
  assignedReviewerUserId?: string;
  assignedAt?: string;
  assignmentReason?: string;
}

export interface ReviewRubricScore {
  criterionId: string;
  score: number;
}

export type ReviewRecommendation = "approve" | "needs_revision" | "reject";
export type ReviewDecision = "pending" | "approved" | "rejected";

export interface ReviewRecord {
  id: string;
  submissionId: string;
  reviewerUserId: string;
  assignedAt: string;
  startedAt?: string;
  updatedAt: string;
  rubricScores: ReviewRubricScore[];
  weightedScore: number;
  recommendation: ReviewRecommendation;
  decision: ReviewDecision;
  decisionNotes: string;
  decisionAt?: string;
}

export type ProofMintStatus = "blocked" | "prepared" | "minted" | "failed";

export interface ProofMintRecord {
  id: string;
  submissionId: string;
  userId: string;
  walletAddress: string;
  status: ProofMintStatus;
  createdAt: string;
  updatedAt: string;
  attemptCount: number;
  blockerCode?: string;
  blockerMessage?: string;
  collectionAddress?: string;
  assetAddress?: string;
  signature?: string;
  explorerUrls?: {
    asset: string;
    collection: string;
    transaction: string;
  };
}

export interface AuditEventRecord {
  id: string;
  actorUserId?: string;
  actorDisplayName: string;
  kind:
    | "auth"
    | "submission_created"
    | "submission_updated"
    | "submission_finalized"
    | "assignment_balanced"
    | "review_scored"
    | "submission_approved"
    | "submission_rejected"
    | "proof_blocked"
    | "proof_minted"
    | "proof_failed"
    | "role_updated";
  subjectType: "submission" | "review" | "proof" | "user" | "session";
  subjectId: string;
  headline: string;
  detail: string;
  createdAt: string;
}

export interface AppState {
  version: 72;
  users: UserRecord[];
  sessions: SessionRecord[];
  authChallenges: AuthChallengeRecord[];
  programs: BountyProgramRecord[];
  submissions: SubmissionPacketRecord[];
  reviews: ReviewRecord[];
  proofMints: ProofMintRecord[];
  auditTrail: AuditEventRecord[];
}

export interface SolanaAuthNonceRequest {
  walletAddress: string;
}

export interface SolanaAuthNonceResponse {
  walletAddress: string;
  nonce: string;
  domain: string;
  uri: string;
  version: "1";
  issuedAt: string;
  expirationTime: string;
  chainId: string;
  statement: string;
}

export interface SolanaAuthVerifyRequest {
  walletAddress: string;
  signature: string;
  message: string;
}

export interface SubmissionDraftRequest {
  programId: string;
  title: string;
  summary: string;
  proofLinks: string[];
  tags: string[];
  note?: string;
}

export interface ReviewScoreRequest {
  rubricScores: ReviewRubricScore[];
}

export interface ReviewDecisionRequest {
  rubricScores: ReviewRubricScore[];
  decision: "approved" | "rejected";
  notes: string;
}

export interface UpdateUserRoleRequest {
  role: "contributor" | "reviewer";
}

export interface RuntimeMintingStatus {
  enabled: boolean;
  status: "ready" | "missing_public_base_url" | "missing_collection" | "missing_signer";
  message: string;
  publicBaseUrlConfigured: boolean;
  collectionConfigured: boolean;
  collectionAddress?: string;
  signerConfigured: boolean;
  executionMode: "wallet-co-signed-mpl-core";
}

export interface PrepareProofMintPlan {
  submissionId: string;
  walletAddress: string;
  assetAddress: string;
  mintName: string;
  metadataUrl: string;
  collectionAddress: string;
  rpcUrl: string;
  transaction: string;
  transactionEncoding: "base64";
}

export interface PrepareProofMintResponse {
  proofMintId: string;
  proofMint: ProofMintSummary;
  plan: PrepareProofMintPlan;
}

export interface ConfirmProofMintRequest {
  assetAddress: string;
  signature: string;
  transaction: string;
}

export interface BountyProgramSummary {
  id: string;
  slug: string;
  title: string;
  sponsor: string;
  summary: string;
  status: "open" | "reviewing" | "closed";
  openedAt: string;
  closesAt: string;
  rubric: RubricCriterionDefinition[];
}

export interface SubmissionPacketSummary {
  id: string;
  programId: string;
  title: string;
  summary: string;
  proofLinks: string[];
  tags: string[];
  note: string;
  status: SubmissionStatus;
  createdAt: string;
  updatedAt: string;
  finalizedAt?: string;
  submitter: UserSummary;
  assignedReviewer?: UserSummary;
  assignmentReason?: string;
  review?: ReviewSummary;
  proofMint?: ProofMintSummary;
}

export interface ReviewSummary {
  id: string;
  reviewer: UserSummary;
  assignedAt: string;
  updatedAt: string;
  weightedScore: number;
  recommendation: ReviewRecommendation;
  decision: ReviewDecision;
  decisionNotes: string;
  decisionAt?: string;
  rubricScores: ReviewRubricScore[];
}

export interface ProofMintSummary {
  id: string;
  status: ProofMintStatus;
  attemptCount: number;
  updatedAt: string;
  blockerCode?: string;
  blockerMessage?: string;
  collectionAddress?: string;
  assetAddress?: string;
  signature?: string;
  explorerUrls?: {
    asset: string;
    collection: string;
    transaction: string;
  };
}

export interface ReviewQueueEntry {
  submission: SubmissionPacketSummary;
  priority: "assigned" | "unassigned";
}

export interface ProofShelfItem {
  submissionId: string;
  submissionTitle: string;
  programTitle: string;
  status: SubmissionStatus;
  decisionAt?: string;
  proofMint?: ProofMintSummary;
}

export interface AuditEventSummary {
  id: string;
  actorDisplayName: string;
  kind: AuditEventRecord["kind"];
  subjectType: AuditEventRecord["subjectType"];
  subjectId: string;
  headline: string;
  detail: string;
  createdAt: string;
}

export interface OperatorUserSummary extends UserSummary {
  openAssignments: number;
  completedReviews: number;
}

export interface OperatorDashboard {
  unassignedSubmissionCount: number;
  inReviewCount: number;
  approvedCount: number;
  rejectedCount: number;
  blockedMintCount: number;
  reviewerCapacity: OperatorUserSummary[];
  userDirectory: OperatorUserSummary[];
  recentAudit: AuditEventSummary[];
}

export interface BootstrapResponse {
  session: {
    user: UserSummary | null;
  };
  runtime: {
    productName: "BountyProof";
    buildNumber: "072";
    nowUtc: string;
    minting: RuntimeMintingStatus;
  };
  programs: BountyProgramSummary[];
  mySubmissions: SubmissionPacketSummary[];
  reviewQueue: ReviewQueueEntry[];
  proofShelf: ProofShelfItem[];
  operatorDashboard: OperatorDashboard | null;
}
