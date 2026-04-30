import {
  address,
  assertIsAddress,
  getBase58Encoder,
  getPublicKeyFromAddress,
  signature,
  signatureBytes,
  verifySignature
} from "@solana/kit";
import express, { type NextFunction, type Request, type Response } from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  AppState,
  AuditEventRecord,
  AuditEventSummary,
  BootstrapResponse,
  BountyProgramRecord,
  BountyProgramSummary,
  ProofMintRecord,
  ProofShelfItem,
  ReviewDecision,
  ReviewDecisionRequest,
  ReviewQueueEntry,
  ReviewRecommendation,
  ReviewRecord,
  ReviewRubricScore,
  ReviewScoreRequest,
  ReviewSummary,
  RuntimeMintingStatus,
  SolanaAuthNonceRequest,
  SolanaAuthNonceResponse,
  SolanaAuthVerifyRequest,
  SubmissionDraftRequest,
  SubmissionPacketRecord,
  SubmissionPacketSummary,
  UpdateUserRoleRequest,
  UserRecord,
  UserRole,
  UserSummary
} from "../shared/contracts.js";
import { FileDatabase } from "./db.js";
import { getMintingStatus } from "./minting/config.js";
import { mintProofAsset } from "./minting/solana.js";
import {
  buildSiwsMessage,
  clearCookieHeader,
  createId,
  createNonce,
  getEnv,
  normalizeWalletAddress,
  nowUtc,
  parseCookies,
  sanitizeUser,
  setCookieHeader,
  shortWalletAddress
} from "./utils.js";

interface ParsedSiwsMessage {
  address: string;
  chainId?: string;
  domain: string;
  expirationTime?: string;
  issuedAt?: string;
  nonce?: string;
  statement?: string;
  uri?: string;
  version?: string;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..", "..");
const publicDir = path.resolve(rootDir, "dist", "public");
const cookieName = "bountyproof_session";
const sessionMaxAgeSeconds = 60 * 60 * 24 * 14;
const challengeMaxAgeMs = 15 * 60 * 1000;
const authStatement = "Sign in to BountyProof with your Solana wallet.";
const dataPath =
  getEnv("BOUNTYPROOF_DATA_PATH") ??
  path.resolve(rootDir, "data", "bountyproof-db.json");

const db = new FileDatabase(dataPath);
const app = express();

app.use(express.json({ limit: "1mb" }));

function asyncRoute(
  handler: (request: Request, response: Response, next: NextFunction) => Promise<void>
) {
  return (request: Request, response: Response, next: NextFunction) => {
    void handler(request, response, next).catch(next);
  };
}

function isFieldLine(value: string): boolean {
  return /^(URI|Version|Chain ID|Nonce|Issued At|Expiration Time|Not Before|Request ID|Resources): /.test(
    value
  ) || value === "Resources:";
}

function parseSiwsMessage(message: string): ParsedSiwsMessage {
  const normalized = message.replace(/\r/g, "");
  const lines = normalized.split("\n");
  const header = lines[0]?.match(/^(.*) wants you to sign in with your Solana account:$/);
  if (!header?.[1] || !lines[1]?.trim()) {
    throw new Error("Invalid SIWS message.");
  }

  const parsed: ParsedSiwsMessage = {
    domain: header[1],
    address: lines[1].trim()
  };

  let cursor = 2;
  if (lines[cursor] === "") {
    cursor += 1;
  }

  const fieldIndex = lines.findIndex((line, index) => index >= cursor && isFieldLine(line));
  if (fieldIndex === -1) {
    throw new Error("SIWS message is missing required fields.");
  }

  const statementLines = lines.slice(cursor, fieldIndex).filter((line) => line !== "");
  parsed.statement = statementLines.length > 0 ? statementLines.join("\n") : undefined;

  for (let index = fieldIndex; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line) {
      continue;
    }

    const separator = line.indexOf(": ");
    if (separator === -1) {
      throw new Error("SIWS message contains an invalid field.");
    }

    const key = line.slice(0, separator);
    const value = line.slice(separator + 2);
    switch (key) {
      case "URI":
        parsed.uri = value;
        break;
      case "Version":
        parsed.version = value;
        break;
      case "Chain ID":
        parsed.chainId = value;
        break;
      case "Nonce":
        parsed.nonce = value;
        break;
      case "Issued At":
        parsed.issuedAt = value;
        break;
      case "Expiration Time":
        parsed.expirationTime = value;
        break;
      case "Resources":
        index = lines.length;
        break;
      default:
        break;
    }
  }

  return parsed;
}

async function verifySolanaSignature(args: {
  message: string;
  signatureValue: string;
  walletAddress: string;
}): Promise<boolean> {
  const publicKey = await getPublicKeyFromAddress(address(args.walletAddress));
  return verifySignature(
    publicKey,
    signatureBytes(getBase58Encoder().encode(signature(args.signatureValue))),
    new TextEncoder().encode(args.message)
  );
}

function cleanupAuthState(state: AppState) {
  state.sessions = state.sessions.filter(
    (entry) => new Date(entry.expiresAt).getTime() > Date.now()
  );
  state.authChallenges = state.authChallenges.filter(
    (entry) => new Date(entry.expirationTime).getTime() > Date.now()
  );
}

function getOperatorWalletAllowlist(): Set<string> {
  return new Set(
    (getEnv("BOUNTYPROOF_OPERATOR_WALLETS") ?? "")
      .split(",")
      .map((entry) => normalizeWalletAddress(entry))
      .filter(Boolean)
  );
}

function resolveUserRole(user: UserRecord): UserRole {
  return getOperatorWalletAllowlist().has(normalizeWalletAddress(user.walletAddress))
    ? "operator"
    : user.role;
}

function getSessionUser(state: AppState, request: Request): UserRecord | null {
  cleanupAuthState(state);
  const sessionId = parseCookies(request)[cookieName];
  if (!sessionId) {
    return null;
  }

  const session = state.sessions.find((entry) => entry.id === sessionId);
  if (!session) {
    return null;
  }

  const user = state.users.find((entry) => entry.id === session.userId);
  if (!user) {
    return null;
  }

  return {
    ...user,
    role: resolveUserRole(user)
  };
}

async function requireUser(request: Request, response: Response) {
  const state = await db.read();
  const user = getSessionUser(state, request);
  if (!user) {
    response.status(401).json({ error: "Authentication required." });
    return null;
  }

  return { state, user };
}

function requireReviewer(user: UserRecord, response: Response): boolean {
  if (user.role === "reviewer" || user.role === "operator") {
    return true;
  }

  response.status(403).json({ error: "Reviewer access required." });
  return false;
}

function requireOperator(user: UserRecord, response: Response): boolean {
  if (user.role === "operator") {
    return true;
  }

  response.status(403).json({ error: "Operator access required." });
  return false;
}

function makeAuditEvent(args: {
  actor?: UserRecord;
  kind: AuditEventRecord["kind"];
  subjectType: AuditEventRecord["subjectType"];
  subjectId: string;
  headline: string;
  detail: string;
}): AuditEventRecord {
  return {
    id: createId("audit"),
    actorUserId: args.actor?.id,
    actorDisplayName: args.actor?.displayName ?? "system",
    kind: args.kind,
    subjectType: args.subjectType,
    subjectId: args.subjectId,
    headline: args.headline,
    detail: args.detail,
    createdAt: nowUtc()
  };
}

function sanitizeUrlList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean)
    .filter((entry) => /^https?:\/\//.test(entry))
    .slice(0, 8);
}

function sanitizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((entry) => (typeof entry === "string" ? entry.trim().toLowerCase() : ""))
        .filter(Boolean)
        .slice(0, 8)
    )
  );
}

function sanitizeText(value: unknown, max = 280): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function getRouteParam(request: Request, key: string): string {
  const value = request.params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function getProgram(state: AppState, programId: string): BountyProgramRecord {
  const program = state.programs.find((entry) => entry.id === programId);
  if (!program) {
    throw new Error("Bounty program not found.");
  }
  return program;
}

function summarizeUser(user: UserRecord | undefined): UserSummary | undefined {
  return user ? sanitizeUser({ ...user, role: resolveUserRole(user) }) : undefined;
}

function summarizeReview(
  state: AppState,
  review: ReviewRecord | undefined
): ReviewSummary | undefined {
  if (!review) {
    return undefined;
  }

  const reviewer = state.users.find((entry) => entry.id === review.reviewerUserId);
  if (!reviewer) {
    return undefined;
  }

  return {
    id: review.id,
    reviewer: sanitizeUser({ ...reviewer, role: resolveUserRole(reviewer) }),
    assignedAt: review.assignedAt,
    updatedAt: review.updatedAt,
    weightedScore: review.weightedScore,
    recommendation: review.recommendation,
    decision: review.decision,
    decisionNotes: review.decisionNotes,
    decisionAt: review.decisionAt,
    rubricScores: review.rubricScores
  };
}

function summarizeProofMint(proofMint: ProofMintRecord | undefined) {
  if (!proofMint) {
    return undefined;
  }

  return {
    id: proofMint.id,
    status: proofMint.status,
    attemptCount: proofMint.attemptCount,
    updatedAt: proofMint.updatedAt,
    blockerCode: proofMint.blockerCode,
    blockerMessage: proofMint.blockerMessage,
    collectionAddress: proofMint.collectionAddress,
    assetAddress: proofMint.assetAddress,
    signature: proofMint.signature,
    explorerUrls: proofMint.explorerUrls
  };
}

function summarizeSubmission(
  state: AppState,
  submission: SubmissionPacketRecord
): SubmissionPacketSummary {
  const submitter = state.users.find((entry) => entry.id === submission.submitterUserId);
  if (!submitter) {
    throw new Error("Submission submitter is missing.");
  }

  const assignedReviewer = state.users.find(
    (entry) => entry.id === submission.assignedReviewerUserId
  );
  const review = state.reviews.find((entry) => entry.submissionId === submission.id);
  const proofMint = state.proofMints.find((entry) => entry.submissionId === submission.id);

  return {
    id: submission.id,
    programId: submission.programId,
    title: submission.title,
    summary: submission.summary,
    proofLinks: submission.proofLinks,
    tags: submission.tags,
    note: submission.note,
    status: submission.status,
    createdAt: submission.createdAt,
    updatedAt: submission.updatedAt,
    finalizedAt: submission.finalizedAt,
    submitter: sanitizeUser({ ...submitter, role: resolveUserRole(submitter) }),
    assignedReviewer: summarizeUser(assignedReviewer),
    assignmentReason: submission.assignmentReason,
    review: summarizeReview(state, review),
    proofMint: summarizeProofMint(proofMint)
  };
}

function scoreRubric(
  program: BountyProgramRecord,
  rubricScores: ReviewRubricScore[]
): { weightedScore: number; recommendation: ReviewRecommendation } {
  const byCriterion = new Map(rubricScores.map((entry) => [entry.criterionId, entry.score]));
  const weightedScore = Number(
    program.rubric
      .reduce((total, criterion) => {
        const score = byCriterion.get(criterion.id) ?? 0;
        const clamped = Math.min(5, Math.max(1, score));
        return total + clamped * criterion.weight;
      }, 0)
      .toFixed(2)
  );

  if (weightedScore >= 4.2) {
    return { weightedScore, recommendation: "approve" };
  }

  if (weightedScore >= 3) {
    return { weightedScore, recommendation: "needs_revision" };
  }

  return { weightedScore, recommendation: "reject" };
}

function buildReviewerCapacity(state: AppState) {
  return state.users
    .map((user) => {
      const openAssignments = state.submissions.filter(
        (entry) => entry.assignedReviewerUserId === user.id && entry.status === "in_review"
      ).length;
      const completedReviews = state.reviews.filter(
        (entry) => entry.reviewerUserId === user.id && entry.decision !== "pending"
      ).length;
      return {
        ...sanitizeUser({ ...user, role: resolveUserRole(user) }),
        openAssignments,
        completedReviews
      };
    })
    .filter((entry) => entry.role === "reviewer" || entry.role === "operator")
    .sort((left, right) => {
      if (left.openAssignments !== right.openAssignments) {
        return left.openAssignments - right.openAssignments;
      }
      if (left.completedReviews !== right.completedReviews) {
        return left.completedReviews - right.completedReviews;
      }
      return left.displayName.localeCompare(right.displayName);
    });
}

function buildUserDirectory(state: AppState) {
  return state.users
    .map((user) => {
      const openAssignments = state.submissions.filter(
        (entry) => entry.assignedReviewerUserId === user.id && entry.status === "in_review"
      ).length;
      const completedReviews = state.reviews.filter(
        (entry) => entry.reviewerUserId === user.id && entry.decision !== "pending"
      ).length;
      return {
        ...sanitizeUser({ ...user, role: resolveUserRole(user) }),
        openAssignments,
        completedReviews
      };
    })
    .sort((left, right) => right.lastAuthenticatedAt.localeCompare(left.lastAuthenticatedAt));
}

function assignReviewer(
  state: AppState,
  submission: SubmissionPacketRecord
): { reviewer?: UserRecord; reason: string } {
  const reviewerPool = buildReviewerCapacity(state)
    .filter((entry) => entry.id !== submission.submitterUserId)
    .map((entry) => state.users.find((user) => user.id === entry.id))
    .filter((entry): entry is UserRecord => Boolean(entry));

  if (reviewerPool.length === 0) {
    return {
      reason: "No reviewer or operator accounts are currently available for balancing."
    };
  }

  const rankedPool = reviewerPool.sort((left, right) => {
    const leftOpen = state.submissions.filter(
      (entry) => entry.assignedReviewerUserId === left.id && entry.status === "in_review"
    ).length;
    const rightOpen = state.submissions.filter(
      (entry) => entry.assignedReviewerUserId === right.id && entry.status === "in_review"
    ).length;
    if (leftOpen !== rightOpen) {
      return leftOpen - rightOpen;
    }

    const leftCompleted = state.reviews.filter(
      (entry) => entry.reviewerUserId === left.id && entry.decision !== "pending"
    ).length;
    const rightCompleted = state.reviews.filter(
      (entry) => entry.reviewerUserId === right.id && entry.decision !== "pending"
    ).length;
    if (leftCompleted !== rightCompleted) {
      return leftCompleted - rightCompleted;
    }

    return left.displayName.localeCompare(right.displayName);
  });

  const reviewer = rankedPool[0];
  const openAssignments = state.submissions.filter(
    (entry) => entry.assignedReviewerUserId === reviewer.id && entry.status === "in_review"
  ).length;

  return {
    reviewer,
    reason: `Balanced to ${reviewer.displayName} because they held the lowest in-review load (${openAssignments}).`
  };
}

function buildReviewQueue(state: AppState, user: UserRecord): ReviewQueueEntry[] {
  const submissions = state.submissions
    .filter((entry) => entry.status === "in_review")
    .filter(
      (entry) =>
        user.role === "operator" ||
        !entry.assignedReviewerUserId ||
        entry.assignedReviewerUserId === user.id
    )
    .map((entry) => ({
      submission: summarizeSubmission(state, entry),
      priority:
        entry.assignedReviewerUserId === user.id ? ("assigned" as const) : ("unassigned" as const)
    }))
    .sort((left, right) => {
      if (left.priority !== right.priority) {
        return left.priority === "assigned" ? -1 : 1;
      }
      return right.submission.updatedAt.localeCompare(left.submission.updatedAt);
    });

  return submissions;
}

function buildProofShelf(state: AppState, user: UserRecord): ProofShelfItem[] {
  return state.submissions
    .filter((entry) => entry.submitterUserId === user.id)
    .map((submission) => {
      const program = getProgram(state, submission.programId);
      const review = state.reviews.find((entry) => entry.submissionId === submission.id);
      const proofMint = state.proofMints.find((entry) => entry.submissionId === submission.id);
      return {
        submissionId: submission.id,
        submissionTitle: submission.title,
        programTitle: program.title,
        status: submission.status,
        decisionAt: review?.decisionAt,
        proofMint: summarizeProofMint(proofMint)
      };
    })
    .sort((left, right) =>
      (right.proofMint?.updatedAt ?? right.decisionAt ?? "").localeCompare(
        left.proofMint?.updatedAt ?? left.decisionAt ?? ""
      )
    );
}

function buildOperatorDashboard(state: AppState) {
  const reviewerCapacity = buildReviewerCapacity(state);
  const recentAudit: AuditEventSummary[] = state.auditTrail
    .slice()
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, 12)
    .map((entry) => ({
      id: entry.id,
      actorDisplayName: entry.actorDisplayName,
      kind: entry.kind,
      subjectType: entry.subjectType,
      subjectId: entry.subjectId,
      headline: entry.headline,
      detail: entry.detail,
      createdAt: entry.createdAt
    }));

  return {
    unassignedSubmissionCount: state.submissions.filter(
      (entry) => entry.status === "in_review" && !entry.assignedReviewerUserId
    ).length,
    inReviewCount: state.submissions.filter((entry) => entry.status === "in_review").length,
    approvedCount: state.submissions.filter((entry) => entry.status === "approved").length,
    rejectedCount: state.submissions.filter((entry) => entry.status === "rejected").length,
    blockedMintCount: state.proofMints.filter((entry) => entry.status === "blocked").length,
    reviewerCapacity,
    userDirectory: buildUserDirectory(state),
    recentAudit
  };
}

function buildBootstrapResponse(
  state: AppState,
  user: UserRecord | null,
  minting: RuntimeMintingStatus
): BootstrapResponse {
  const programs: BountyProgramSummary[] = state.programs.map((entry) => ({
    id: entry.id,
    slug: entry.slug,
    title: entry.title,
    sponsor: entry.sponsor,
    summary: entry.summary,
    status: entry.status,
    openedAt: entry.openedAt,
    closesAt: entry.closesAt,
    rubric: entry.rubric
  }));

  const mySubmissions = user
    ? state.submissions
        .filter((entry) => entry.submitterUserId === user.id)
        .map((entry) => summarizeSubmission(state, entry))
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    : [];

  return {
    session: {
      user: user ? sanitizeUser(user) : null
    },
    runtime: {
      productName: "BountyProof",
      buildNumber: "072",
      nowUtc: nowUtc(),
      minting
    },
    programs,
    mySubmissions,
    reviewQueue: user && (user.role === "reviewer" || user.role === "operator")
      ? buildReviewQueue(state, user)
      : [],
    proofShelf: user ? buildProofShelf(state, user) : [],
    operatorDashboard: user?.role === "operator" ? buildOperatorDashboard(state) : null
  };
}

function validateSubmissionInput(
  body: SubmissionDraftRequest,
  state: AppState
): SubmissionDraftRequest {
  const program = getProgram(state, body.programId);
  if (program.status === "closed") {
    throw new Error("This bounty program is closed.");
  }

  const title = sanitizeText(body.title, 120);
  const summary = sanitizeText(body.summary, 600);
  const note = sanitizeText(body.note ?? "", 400);
  const proofLinks = sanitizeUrlList(body.proofLinks);
  const tags = sanitizeTags(body.tags);

  if (!title) {
    throw new Error("Title is required.");
  }
  if (!summary) {
    throw new Error("Summary is required.");
  }
  if (proofLinks.length === 0) {
    throw new Error("At least one proof link is required.");
  }

  return {
    programId: body.programId,
    title,
    summary,
    proofLinks,
    tags,
    note
  };
}

app.get(
  "/api/health",
  asyncRoute(async (_request, response) => {
    await db.init();
    response.json({
      ok: true,
      product: "BountyProof",
      build: "072",
      nowUtc: nowUtc(),
      persistence: {
        mode: "file",
        path: dataPath
      },
      minting: getMintingStatus()
    });
  })
);

app.get(
  "/api/bootstrap",
  asyncRoute(async (request, response) => {
    const state = await db.read();
    const user = getSessionUser(state, request);
    response.json(buildBootstrapResponse(state, user, getMintingStatus()));
  })
);

app.post(
  "/api/auth/solana-auth/nonce",
  asyncRoute(async (request, response) => {
    const body = request.body as SolanaAuthNonceRequest;
    const walletAddress = normalizeWalletAddress(body.walletAddress ?? "");
    assertIsAddress(walletAddress);

    const challenge = await db.update((state) => {
      cleanupAuthState(state);
      state.authChallenges = state.authChallenges.filter(
        (entry) => normalizeWalletAddress(entry.walletAddress) !== walletAddress
      );

      const issuedAt = nowUtc();
      const expirationTime = new Date(Date.now() + challengeMaxAgeMs).toISOString();
      const domain = request.headers.host ?? "localhost:3001";
      const protocol = request.headers["x-forwarded-proto"] ?? request.protocol;
      const uri = `${protocol}://${domain}/api/auth/solana-auth/verify`;
      const nonce = createNonce();

      const record = {
        id: createId("challenge"),
        walletAddress,
        nonce,
        domain,
        uri,
        chainId: "solana:devnet",
        statement: authStatement,
        issuedAt,
        expirationTime,
        createdAt: issuedAt,
        expiresAt: expirationTime
      };
      state.authChallenges.push(record);
      return record;
    });

    const payload: SolanaAuthNonceResponse = {
      walletAddress,
      nonce: challenge.nonce,
      domain: challenge.domain,
      uri: challenge.uri,
      version: "1",
      issuedAt: challenge.issuedAt,
      expirationTime: challenge.expirationTime,
      chainId: challenge.chainId,
      statement: challenge.statement
    };

    response.json(payload);
  })
);

app.post(
  "/api/auth/solana-auth/verify",
  asyncRoute(async (request, response) => {
    const body = request.body as SolanaAuthVerifyRequest;
    const walletAddress = normalizeWalletAddress(body.walletAddress ?? "");
    assertIsAddress(walletAddress);

    const parsed = parseSiwsMessage(body.message ?? "");
    if (normalizeWalletAddress(parsed.address) !== walletAddress) {
      throw new Error("Wallet address does not match the SIWS message.");
    }

    const signatureValid = await verifySolanaSignature({
      message: body.message,
      signatureValue: body.signature,
      walletAddress
    });

    if (!signatureValid) {
      response.status(400).json({ error: "Signature verification failed." });
      return;
    }

    const result = await db.update((state) => {
      cleanupAuthState(state);
      const challenge = state.authChallenges.find(
        (entry) =>
          normalizeWalletAddress(entry.walletAddress) === walletAddress &&
          entry.nonce === parsed.nonce
      );

      if (!challenge) {
        throw new Error("Authentication challenge has expired.");
      }

      const expectedMessage = buildSiwsMessage({
        address: walletAddress,
        chainId: challenge.chainId,
        domain: challenge.domain,
        expirationTime: challenge.expirationTime,
        issuedAt: challenge.issuedAt,
        nonce: challenge.nonce,
        statement: challenge.statement,
        uri: challenge.uri
      });

      if (expectedMessage !== body.message) {
        throw new Error("Signed message did not match the challenge.");
      }

      let user = state.users.find(
        (entry) => normalizeWalletAddress(entry.walletAddress) === walletAddress
      );
      const timestamp = nowUtc();
      const isNewUser = !user;

      if (!user) {
        user = {
          id: createId("user"),
          walletAddress,
          displayName: `Contributor ${shortWalletAddress(walletAddress)}`,
          role: "contributor",
          createdAt: timestamp,
          lastAuthenticatedAt: timestamp
        };
        state.users.push(user);
      } else {
        user.lastAuthenticatedAt = timestamp;
      }

      user.role = resolveUserRole(user);

      const session = {
        id: createId("session"),
        userId: user.id,
        createdAt: timestamp,
        expiresAt: new Date(Date.now() + sessionMaxAgeSeconds * 1000).toISOString()
      };

      state.sessions = state.sessions.filter((entry) => entry.userId !== user!.id);
      state.sessions.push(session);
      state.authChallenges = state.authChallenges.filter((entry) => entry.id !== challenge.id);
      state.auditTrail.push(
        makeAuditEvent({
          actor: user,
          kind: "auth",
          subjectType: "session",
          subjectId: session.id,
          headline: isNewUser ? "Wallet signed in and contributor profile created." : "Wallet session refreshed.",
          detail: `Authenticated ${shortWalletAddress(walletAddress)} for BountyProof build 072.`
        })
      );

      return {
        isNewUser,
        user: sanitizeUser(user),
        sessionId: session.id
      };
    });

    response.setHeader(
      "Set-Cookie",
      setCookieHeader(cookieName, result.sessionId, sessionMaxAgeSeconds)
    );
    response.json({
      isNewUser: result.isNewUser,
      user: result.user
    });
  })
);

app.post(
  "/api/auth/logout",
  asyncRoute(async (request, response) => {
    const sessionId = parseCookies(request)[cookieName];
    if (sessionId) {
      await db.update((state) => {
        state.sessions = state.sessions.filter((entry) => entry.id !== sessionId);
      });
    }
    response.setHeader("Set-Cookie", clearCookieHeader(cookieName));
    response.json({ ok: true });
  })
);

app.post(
  "/api/demo/promote-reviewer",
  asyncRoute(async (request, response) => {
    const auth = await requireUser(request, response);
    if (!auth) {
      return;
    }

    const updated = await db.update((state) => {
      const target = state.users.find((entry) => entry.id === auth.user.id);
      if (!target) {
        throw new Error("User not found.");
      }

      const resolvedRole = resolveUserRole(target);
      if (resolvedRole === "operator" || resolvedRole === "reviewer") {
        return sanitizeUser({ ...target, role: resolvedRole });
      }

      target.role = "reviewer";
      state.auditTrail.push(
        makeAuditEvent({
          actor: auth.user,
          kind: "role_updated",
          subjectType: "user",
          subjectId: target.id,
          headline: `Enabled reviewer demo mode for ${target.displayName}.`,
          detail:
            "Demo helper promoted the active wallet so one account can complete the review and mint flow."
        })
      );

      return sanitizeUser({ ...target, role: resolveUserRole(target) });
    });

    response.json(updated);
  })
);

app.post(
  "/api/submissions",
  asyncRoute(async (request, response) => {
    const auth = await requireUser(request, response);
    if (!auth) {
      return;
    }

    const payload = request.body as SubmissionDraftRequest;
    const created = await db.update((state) => {
      const input = validateSubmissionInput(payload, state);
      const timestamp = nowUtc();
      const submission: SubmissionPacketRecord = {
        id: createId("submission"),
        programId: input.programId,
        submitterUserId: auth.user.id,
        title: input.title,
        summary: input.summary,
        proofLinks: input.proofLinks,
        tags: input.tags,
        note: input.note ?? "",
        status: "draft",
        createdAt: timestamp,
        updatedAt: timestamp
      };
      state.submissions.push(submission);
      state.auditTrail.push(
        makeAuditEvent({
          actor: auth.user,
          kind: "submission_created",
          subjectType: "submission",
          subjectId: submission.id,
          headline: `Created draft packet "${submission.title}".`,
          detail: `Contributor opened a new submission packet in ${getProgram(state, submission.programId).title}.`
        })
      );
      return summarizeSubmission(state, submission);
    });

    response.status(201).json(created);
  })
);

app.patch(
  "/api/submissions/:submissionId",
  asyncRoute(async (request, response) => {
    const auth = await requireUser(request, response);
    if (!auth) {
      return;
    }

    const submissionId = getRouteParam(request, "submissionId");
    const payload = request.body as SubmissionDraftRequest;
    const updated = await db.update((state) => {
      const submission = state.submissions.find((entry) => entry.id === submissionId);
      if (!submission) {
        throw new Error("Submission not found.");
      }
      if (submission.submitterUserId !== auth.user.id) {
        throw new Error("Only the submitter can edit this packet.");
      }
      if (submission.status !== "draft") {
        throw new Error("Only draft packets can be edited.");
      }

      const input = validateSubmissionInput(
        {
          ...payload,
          programId: submission.programId
        },
        state
      );

      submission.title = input.title;
      submission.summary = input.summary;
      submission.proofLinks = input.proofLinks;
      submission.tags = input.tags;
      submission.note = input.note ?? "";
      submission.updatedAt = nowUtc();
      state.auditTrail.push(
        makeAuditEvent({
          actor: auth.user,
          kind: "submission_updated",
          subjectType: "submission",
          subjectId: submission.id,
          headline: `Updated draft packet "${submission.title}".`,
          detail: "Contributor revised the submission packet before finalization."
        })
      );
      return summarizeSubmission(state, submission);
    });

    response.json(updated);
  })
);

app.post(
  "/api/submissions/:submissionId/finalize",
  asyncRoute(async (request, response) => {
    const auth = await requireUser(request, response);
    if (!auth) {
      return;
    }

    const submissionId = getRouteParam(request, "submissionId");
    const finalized = await db.update((state) => {
      const submission = state.submissions.find((entry) => entry.id === submissionId);
      if (!submission) {
        throw new Error("Submission not found.");
      }
      if (submission.submitterUserId !== auth.user.id) {
        throw new Error("Only the submitter can finalize this packet.");
      }
      if (submission.status !== "draft") {
        throw new Error("Only draft packets can be finalized.");
      }
      if (!submission.title || !submission.summary || submission.proofLinks.length === 0) {
        throw new Error("Submission packet is incomplete.");
      }

      const timestamp = nowUtc();
      submission.status = "in_review";
      submission.finalizedAt = timestamp;
      submission.updatedAt = timestamp;

      const assignment = assignReviewer(state, submission);
      if (assignment.reviewer) {
        submission.assignedReviewerUserId = assignment.reviewer.id;
        submission.assignedAt = timestamp;
        submission.assignmentReason = assignment.reason;
        state.reviews = state.reviews.filter((entry) => entry.submissionId !== submission.id);
        state.reviews.push({
          id: createId("review"),
          submissionId: submission.id,
          reviewerUserId: assignment.reviewer.id,
          assignedAt: timestamp,
          updatedAt: timestamp,
          rubricScores: [],
          weightedScore: 0,
          recommendation: "needs_revision",
          decision: "pending",
          decisionNotes: ""
        });
        state.auditTrail.push(
          makeAuditEvent({
            actor: auth.user,
            kind: "assignment_balanced",
            subjectType: "review",
            subjectId: submission.id,
            headline: `Balanced review assignment for "${submission.title}".`,
            detail: assignment.reason
          })
        );
      }

      state.auditTrail.push(
        makeAuditEvent({
          actor: auth.user,
          kind: "submission_finalized",
          subjectType: "submission",
          subjectId: submission.id,
          headline: `Finalized packet "${submission.title}" for review.`,
          detail:
            assignment.reviewer
              ? `Queued for ${assignment.reviewer.displayName}.`
              : "Queued without an assignee because no reviewer pool is available."
        })
      );

      return summarizeSubmission(state, submission);
    });

    response.json(finalized);
  })
);

app.post(
  "/api/reviews/rebalance",
  asyncRoute(async (request, response) => {
    const auth = await requireUser(request, response);
    if (!auth || !requireOperator(auth.user, response)) {
      return;
    }

    const result = await db.update((state) => {
      let rebalanced = 0;
      for (const submission of state.submissions.filter(
        (entry) => entry.status === "in_review" && !entry.assignedReviewerUserId
      )) {
        const assignment = assignReviewer(state, submission);
        if (!assignment.reviewer) {
          continue;
        }
        const timestamp = nowUtc();
        submission.assignedReviewerUserId = assignment.reviewer.id;
        submission.assignedAt = timestamp;
        submission.assignmentReason = assignment.reason;
        state.reviews = state.reviews.filter((entry) => entry.submissionId !== submission.id);
        state.reviews.push({
          id: createId("review"),
          submissionId: submission.id,
          reviewerUserId: assignment.reviewer.id,
          assignedAt: timestamp,
          updatedAt: timestamp,
          rubricScores: [],
          weightedScore: 0,
          recommendation: "needs_revision",
          decision: "pending",
          decisionNotes: ""
        });
        state.auditTrail.push(
          makeAuditEvent({
            actor: auth.user,
            kind: "assignment_balanced",
            subjectType: "review",
            subjectId: submission.id,
            headline: `Rebalanced "${submission.title}" into the review queue.`,
            detail: assignment.reason
          })
        );
        rebalanced += 1;
      }
      return { rebalanced };
    });

    response.json(result);
  })
);

app.post(
  "/api/reviews/:submissionId/score",
  asyncRoute(async (request, response) => {
    const auth = await requireUser(request, response);
    if (!auth || !requireReviewer(auth.user, response)) {
      return;
    }

    const submissionId = getRouteParam(request, "submissionId");
    const payload = request.body as ReviewScoreRequest;
    const scored = await db.update((state) => {
      const submission = state.submissions.find((entry) => entry.id === submissionId);
      if (!submission || submission.status !== "in_review") {
        throw new Error("Submission is not available for review.");
      }
      if (
        auth.user.role !== "operator" &&
        submission.assignedReviewerUserId &&
        submission.assignedReviewerUserId !== auth.user.id
      ) {
        throw new Error("This submission is assigned to a different reviewer.");
      }

      const program = getProgram(state, submission.programId);
      const rubricScores = payload.rubricScores ?? [];
      const review: ReviewRecord =
        state.reviews.find((entry) => entry.submissionId === submissionId) ??
        {
          id: createId("review"),
          submissionId,
          reviewerUserId: auth.user.id,
          assignedAt: nowUtc(),
          updatedAt: nowUtc(),
          rubricScores: [],
          weightedScore: 0,
          recommendation: "needs_revision",
          decision: "pending",
          decisionNotes: ""
        };

      const scoredReview = scoreRubric(program, rubricScores);
      review.reviewerUserId = auth.user.id;
      review.startedAt = review.startedAt ?? nowUtc();
      review.updatedAt = nowUtc();
      review.rubricScores = rubricScores;
      review.weightedScore = scoredReview.weightedScore;
      review.recommendation = scoredReview.recommendation;

      state.reviews = state.reviews.filter((entry) => entry.submissionId !== submissionId);
      state.reviews.push(review);

      if (!submission.assignedReviewerUserId) {
        submission.assignedReviewerUserId = auth.user.id;
        submission.assignedAt = nowUtc();
        submission.assignmentReason = `Claimed by ${auth.user.displayName} during review scoring.`;
      }

      state.auditTrail.push(
        makeAuditEvent({
          actor: auth.user,
          kind: "review_scored",
          subjectType: "review",
          subjectId: review.id,
          headline: `Scored "${submission.title}" at ${review.weightedScore.toFixed(2)}.`,
          detail: `Recommendation is ${review.recommendation}.`
        })
      );

      return summarizeSubmission(state, submission);
    });

    response.json(scored);
  })
);

app.post(
  "/api/reviews/:submissionId/decision",
  asyncRoute(async (request, response) => {
    const auth = await requireUser(request, response);
    if (!auth || !requireReviewer(auth.user, response)) {
      return;
    }

    const submissionId = getRouteParam(request, "submissionId");
    const payload = request.body as ReviewDecisionRequest;
    const decided = await db.update((state) => {
      const submission = state.submissions.find((entry) => entry.id === submissionId);
      if (!submission || submission.status !== "in_review") {
        throw new Error("Submission is not available for decision.");
      }
      if (
        auth.user.role !== "operator" &&
        submission.assignedReviewerUserId &&
        submission.assignedReviewerUserId !== auth.user.id
      ) {
        throw new Error("This submission is assigned to a different reviewer.");
      }

      const decision: ReviewDecision = payload.decision;
      if (decision !== "approved" && decision !== "rejected") {
        throw new Error("Decision must be approved or rejected.");
      }

      const program = getProgram(state, submission.programId);
      const review: ReviewRecord =
        state.reviews.find((entry) => entry.submissionId === submissionId) ??
        {
          id: createId("review"),
          submissionId,
          reviewerUserId: auth.user.id,
          assignedAt: nowUtc(),
          updatedAt: nowUtc(),
          rubricScores: [],
          weightedScore: 0,
          recommendation: "needs_revision",
          decision: "pending",
          decisionNotes: ""
        };

      const scored = scoreRubric(program, payload.rubricScores ?? []);
      review.reviewerUserId = auth.user.id;
      review.startedAt = review.startedAt ?? nowUtc();
      review.updatedAt = nowUtc();
      review.rubricScores = payload.rubricScores ?? [];
      review.weightedScore = scored.weightedScore;
      review.recommendation = scored.recommendation;
      review.decision = decision;
      review.decisionNotes = sanitizeText(payload.notes, 400);
      review.decisionAt = nowUtc();

      submission.status = decision === "approved" ? "approved" : "rejected";
      submission.assignedReviewerUserId = auth.user.id;
      submission.assignedAt = submission.assignedAt ?? nowUtc();
      submission.updatedAt = nowUtc();

      state.reviews = state.reviews.filter((entry) => entry.submissionId !== submissionId);
      state.reviews.push(review);
      state.auditTrail.push(
        makeAuditEvent({
          actor: auth.user,
          kind: decision === "approved" ? "submission_approved" : "submission_rejected",
          subjectType: "submission",
          subjectId: submission.id,
          headline: `${decision === "approved" ? "Approved" : "Rejected"} "${submission.title}".`,
          detail: review.decisionNotes || `Recommendation was ${review.recommendation}.`
        })
      );

      return summarizeSubmission(state, submission);
    });

    response.json(decided);
  })
);

app.post(
  "/api/submissions/:submissionId/mint",
  asyncRoute(async (request, response) => {
    const auth = await requireUser(request, response);
    if (!auth) {
      return;
    }

    const submissionId = getRouteParam(request, "submissionId");
    const mintingStatus = getMintingStatus();
    const result = await db.update(async (state) => {
      const submission = state.submissions.find((entry) => entry.id === submissionId);
      if (!submission) {
        throw new Error("Submission not found.");
      }
      if (submission.submitterUserId !== auth.user.id) {
        throw new Error("Only the submitting wallet can mint this proof.");
      }
      if (submission.status !== "approved") {
        throw new Error("Only approved submissions can mint proof assets.");
      }

      const existing: ProofMintRecord =
        state.proofMints.find((entry) => entry.submissionId === submissionId) ??
        {
          id: createId("proof"),
          submissionId,
          userId: auth.user.id,
          walletAddress: auth.user.walletAddress,
          status: "blocked",
          createdAt: nowUtc(),
          updatedAt: nowUtc(),
          attemptCount: 0
        };

      existing.attemptCount += 1;
      existing.updatedAt = nowUtc();
      existing.walletAddress = auth.user.walletAddress;

      if (!mintingStatus.enabled) {
        existing.status = "blocked";
        existing.blockerCode = mintingStatus.status;
        existing.blockerMessage = mintingStatus.message;
        existing.collectionAddress = mintingStatus.collectionAddress;
        state.proofMints = state.proofMints.filter((entry) => entry.submissionId !== submissionId);
        state.proofMints.push(existing);
        state.auditTrail.push(
          makeAuditEvent({
            actor: auth.user,
            kind: "proof_blocked",
            subjectType: "proof",
            subjectId: existing.id,
            headline: `Proof mint blocked for "${submission.title}".`,
            detail: mintingStatus.message
          })
        );
        return summarizeSubmission(state, submission);
      }

      existing.status = "submitted";
      existing.blockerCode = undefined;
      existing.blockerMessage = undefined;
      existing.collectionAddress = mintingStatus.collectionAddress;
      state.proofMints = state.proofMints.filter((entry) => entry.submissionId !== submissionId);
      state.proofMints.push(existing);

      try {
        const baseUrl = getEnv("BOUNTYPROOF_PUBLIC_BASE_URL")!;
        const metadataUrl = `${baseUrl}/api/proofs/${submission.id}/metadata.json`;
        const mintResult = await mintProofAsset({
          name: `BountyProof 072 - ${submission.title.slice(0, 24)}`,
          metadataUrl,
          walletAddress: auth.user.walletAddress
        });

        existing.status = "minted";
        existing.updatedAt = nowUtc();
        existing.assetAddress = mintResult.assetAddress;
        existing.signature = mintResult.signature;
        existing.collectionAddress = mintResult.collectionAddress;
        existing.explorerUrls = mintResult.explorerUrls;
        state.auditTrail.push(
          makeAuditEvent({
            actor: auth.user,
            kind: "proof_minted",
            subjectType: "proof",
            subjectId: existing.id,
            headline: `Minted proof asset for "${submission.title}".`,
            detail: `Asset ${mintResult.assetAddress} was minted to the authenticated session wallet.`
          })
        );
      } catch (error) {
        existing.status = "failed";
        existing.updatedAt = nowUtc();
        existing.blockerCode = "mint_failed";
        existing.blockerMessage =
          error instanceof Error ? error.message : "Minting failed unexpectedly.";
        state.auditTrail.push(
          makeAuditEvent({
            actor: auth.user,
            kind: "proof_failed",
            subjectType: "proof",
            subjectId: existing.id,
            headline: `Minting failed for "${submission.title}".`,
            detail: existing.blockerMessage
          })
        );
      }

      return summarizeSubmission(state, submission);
    });

    response.json(result);
  })
);

app.post(
  "/api/admin/users/:userId/role",
  asyncRoute(async (request, response) => {
    const auth = await requireUser(request, response);
    if (!auth || !requireOperator(auth.user, response)) {
      return;
    }

    const { role } = request.body as UpdateUserRoleRequest;
    if (role !== "contributor" && role !== "reviewer") {
      throw new Error("Role must be contributor or reviewer.");
    }

    const userId = getRouteParam(request, "userId");
    const updated = await db.update((state) => {
      const target = state.users.find((entry) => entry.id === userId);
      if (!target) {
        throw new Error("User not found.");
      }
      target.role = role;
      state.auditTrail.push(
        makeAuditEvent({
          actor: auth.user,
          kind: "role_updated",
          subjectType: "user",
          subjectId: target.id,
          headline: `Updated ${target.displayName} to ${role}.`,
          detail: "Operator changed reviewer capacity."
        })
      );
      return sanitizeUser({ ...target, role: resolveUserRole(target) });
    });

    response.json(updated);
  })
);

function createDiceBearGlassPngUrl(seed: string) {
  const url = new URL(`https://api.dicebear.com/9.x/glass/png`);
  url.searchParams.set("seed", seed);
  url.searchParams.set("size", "512");
  url.searchParams.set("scale", "90");
  url.searchParams.set("backgroundType", "solid,gradientLinear");
  return url.toString();
}

app.get(
  "/api/proofs/:submissionId/metadata.json",
  asyncRoute(async (request, response) => {
    const state = await db.read();
    const submissionId = getRouteParam(request, "submissionId");
    const submission = state.submissions.find((entry) => entry.id === submissionId);
    if (!submission) {
      response.status(404).json({ error: "Submission not found." });
      return;
    }
    const program = getProgram(state, submission.programId);
    const review = state.reviews.find((entry) => entry.submissionId === submission.id);
    const minting = getMintingStatus();
    const baseUrl = getEnv("BOUNTYPROOF_PUBLIC_BASE_URL") ?? `http://localhost:${port}`;
    const imageUrl = createDiceBearGlassPngUrl(`bountyproof-${submission.id}-${submission.submitterUserId}`);
    response.json({
      name: `BountyProof 072: ${submission.title}`,
      symbol: "BP072",
      description: `Collection-backed proof asset for the approved BountyProof submission "${submission.title}".`,
      image: imageUrl,
      external_url: `${baseUrl}/proofs`,
      attributes: [
        { trait_type: "Program", value: program.title },
        { trait_type: "Status", value: submission.status },
        { trait_type: "Recommendation", value: review?.recommendation ?? "pending" },
        { trait_type: "Weighted Score", value: review?.weightedScore?.toFixed(2) ?? "0.00" },
        { trait_type: "Build", value: "072" }
      ],
      properties: {
        category: "image",
        files: [
          {
            uri: imageUrl,
            type: "image/png"
          }
        ]
      },
      collection: {
        name: "BountyProof",
        family: "Nightshift",
        key: minting.collectionAddress ?? "unconfigured"
      }
    });
  })
);

app.get(
  "/api/proofs/:submissionId/image.svg",
  asyncRoute(async (request, response) => {
    const state = await db.read();
    const submissionId = getRouteParam(request, "submissionId");
    const submission = state.submissions.find((entry) => entry.id === submissionId);
    if (!submission) {
      response.status(404).type("text/plain").send("Not found");
      return;
    }
    const program = getProgram(state, submission.programId);
    const review = state.reviews.find((entry) => entry.submissionId === submission.id);
    const submitter = state.users.find((entry) => entry.id === submission.submitterUserId);
    const tags = submission.tags.slice(0, 3).join(" • ") || "untagged";
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1200" height="1200" viewBox="0 0 1200 1200" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1200" y2="1200" gradientUnits="userSpaceOnUse">
      <stop stop-color="#060B12"/>
      <stop offset="0.55" stop-color="#111D2D"/>
      <stop offset="1" stop-color="#091119"/>
    </linearGradient>
    <linearGradient id="line" x1="160" y1="180" x2="980" y2="980" gradientUnits="userSpaceOnUse">
      <stop stop-color="#67E8C8"/>
      <stop offset="1" stop-color="#F0B862"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="1200" rx="72" fill="url(#bg)"/>
  <circle cx="190" cy="180" r="120" fill="#67E8C8" fill-opacity="0.12"/>
  <circle cx="1020" cy="1020" r="170" fill="#F0B862" fill-opacity="0.10"/>
  <rect x="88" y="88" width="1024" height="1024" rx="52" fill="#0A121C" stroke="url(#line)" stroke-opacity="0.32"/>
  <text x="140" y="180" fill="#67E8C8" font-size="34" font-family="Georgia, serif" letter-spacing="8">BOUNTYPROOF</text>
  <text x="140" y="248" fill="#F5F7FB" font-size="88" font-family="Georgia, serif">${submission.title
    .slice(0, 32)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")}</text>
  <text x="140" y="320" fill="#90A4B9" font-size="30" font-family="Arial, sans-serif">${program.title
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")}</text>
  <rect x="140" y="396" width="920" height="2" fill="url(#line)" fill-opacity="0.35"/>
  <text x="140" y="478" fill="#90A4B9" font-size="28" font-family="Arial, sans-serif">STATUS</text>
  <text x="140" y="540" fill="#F5F7FB" font-size="52" font-family="Georgia, serif">${submission.status.toUpperCase()}</text>
  <text x="140" y="640" fill="#90A4B9" font-size="28" font-family="Arial, sans-serif">RECOMMENDATION</text>
  <text x="140" y="702" fill="#F5F7FB" font-size="52" font-family="Georgia, serif">${(
    review?.recommendation ?? "pending"
  ).toUpperCase()}</text>
  <text x="140" y="802" fill="#90A4B9" font-size="28" font-family="Arial, sans-serif">SUBMITTER</text>
  <text x="140" y="864" fill="#F5F7FB" font-size="44" font-family="Arial, sans-serif">${shortWalletAddress(
    submitter?.walletAddress ?? ""
  )}</text>
  <text x="140" y="960" fill="#90A4B9" font-size="28" font-family="Arial, sans-serif">TAGS</text>
  <text x="140" y="1022" fill="#F5F7FB" font-size="40" font-family="Arial, sans-serif">${tags
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")}</text>
  <text x="140" y="1080" fill="#90A4B9" font-size="24" font-family="Arial, sans-serif">Nightshift build 072 • MPL Core proof asset</text>
</svg>`;
    response.type("image/svg+xml").send(svg);
  })
);

if (existsSync(publicDir)) {
  app.use(express.static(publicDir));
  app.get(/.*/, (_request, response) => {
    response.sendFile(path.join(publicDir, "index.html"));
  });
}

app.use(
  (
    error: unknown,
    _request: Request,
    response: Response,
    _next: NextFunction
  ) => {
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    response.status(400).json({ error: message });
  }
);

const port = Number(getEnv("PORT") ?? "3001");
app.listen(port, () => {
  console.log(`BountyProof build 072 listening on http://localhost:${port}`);
});
