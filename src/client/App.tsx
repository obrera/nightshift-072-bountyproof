import {
  SolanaSignIn,
  type UiWallet,
  WalletUiIcon,
  useSignIn,
  useSignMessage,
  useWalletUi,
  useWalletUiWallet
} from "@wallet-ui/react";
import { startTransition, useEffect, useMemo, useState } from "react";
import type {
  BootstrapResponse,
  ProofShelfItem,
  ReviewQueueEntry,
  ReviewRubricScore,
  SubmissionDraftRequest,
  SubmissionPacketSummary
} from "../shared/contracts";
import {
  handleSiwsAuth,
  handleSiwsAuthWithSignMessage
} from "./handle-siws-auth";

type RouteId = "/" | "/queue" | "/proofs" | "/operator";

interface PacketFormState {
  title: string;
  summary: string;
  proofLinks: string;
  tags: string;
  note: string;
}

const emptyForm: PacketFormState = {
  title: "",
  summary: "",
  proofLinks: "",
  tags: "",
  note: ""
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    },
    ...init
  });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(data.error ?? "Request failed.");
  }
  return data;
}

function formatUtc(value?: string): string {
  if (!value) {
    return "n/a";
  }

  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function shortAddress(value: string): string {
  return value.length <= 12 ? value : `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function routeLabel(route: RouteId): string {
  switch (route) {
    case "/":
      return "Submissions";
    case "/queue":
      return "Review Queue";
    case "/proofs":
      return "Proof Shelf";
    case "/operator":
      return "Operator";
  }
}

function detectRoute(pathname: string): RouteId {
  if (pathname === "/queue") {
    return "/queue";
  }
  if (pathname === "/proofs") {
    return "/proofs";
  }
  if (pathname === "/operator") {
    return "/operator";
  }
  return "/";
}

function navigate(route: RouteId) {
  window.history.pushState({}, "", route);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function toRequest(programId: string, form: PacketFormState): SubmissionDraftRequest {
  return {
    programId,
    title: form.title.trim(),
    summary: form.summary.trim(),
    proofLinks: form.proofLinks
      .split("\n")
      .map((entry) => entry.trim())
      .filter(Boolean),
    tags: form.tags
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
    note: form.note.trim()
  };
}

function fromSubmission(submission: SubmissionPacketSummary): PacketFormState {
  return {
    title: submission.title,
    summary: submission.summary,
    proofLinks: submission.proofLinks.join("\n"),
    tags: submission.tags.join(", "),
    note: submission.note
  };
}

function computeRecommendation(weightedScore: number): string {
  if (weightedScore >= 4.2) {
    return "Approve";
  }
  if (weightedScore >= 3) {
    return "Needs revision";
  }
  return "Reject";
}

function WalletConnectOption({
  busy,
  wallet
}: {
  busy: boolean;
  wallet: UiWallet;
}) {
  const { connect, isConnecting } = useWalletUiWallet({ wallet });

  return (
    <button
      className="ghost-button wallet-option"
      disabled={busy || isConnecting}
      onClick={() => void connect()}
      type="button"
    >
      <WalletUiIcon className="wallet-icon" wallet={wallet} />
      <span>{isConnecting ? `Connecting ${wallet.name}...` : `Connect ${wallet.name}`}</span>
    </button>
  );
}

function WalletSignInOption({
  onError,
  onNotice,
  refresh,
  wallet
}: {
  onError: (value: string | null) => void;
  onNotice: (value: string | null) => void;
  refresh: () => Promise<void>;
  wallet: UiWallet;
}) {
  const account = wallet.accounts?.[0];
  const signIn = useSignIn(wallet);
  const [isBusy, setIsBusy] = useState(false);

  if (!account) {
    return null;
  }

  return (
    <button
      className="primary-button wallet-option"
      disabled={isBusy}
      onClick={() => {
        onError(null);
        onNotice(null);
        setIsBusy(true);
        void handleSiwsAuth({
          address: account.address,
          refresh,
          signIn,
          statement: "Sign in to BountyProof with your Solana wallet."
        })
          .then((result) => {
            onNotice(
              result.isNewUser
                ? "Wallet connected. Contributor profile created."
                : "Wallet session refreshed."
            );
          })
          .catch((reason: unknown) => {
            onError(reason instanceof Error ? reason.message : "Wallet sign-in failed.");
          })
          .finally(() => {
            setIsBusy(false);
          });
      }}
      type="button"
    >
      <WalletUiIcon className="wallet-icon" wallet={wallet} />
      <span>{isBusy ? `Signing With ${wallet.name}...` : `Sign In With ${wallet.name}`}</span>
    </button>
  );
}

function WalletMessageSignInOption({
  onError,
  onNotice,
  refresh,
  wallet
}: {
  onError: (value: string | null) => void;
  onNotice: (value: string | null) => void;
  refresh: () => Promise<void>;
  wallet: UiWallet;
}) {
  const account = wallet.accounts?.[0];
  const [isBusy, setIsBusy] = useState(false);
  const signMessage = useSignMessage(account);

  if (!account) {
    return null;
  }

  return (
    <button
      className="primary-button wallet-option"
      disabled={isBusy}
      onClick={() => {
        onError(null);
        onNotice(null);
        setIsBusy(true);
        void handleSiwsAuthWithSignMessage({
          address: account.address,
          refresh,
          signMessage: async (message) =>
            signMessage({
              message
            }),
          statement: "Sign in to BountyProof with your Solana wallet."
        })
          .then((result) => {
            onNotice(
              result.isNewUser
                ? "Wallet connected. Contributor profile created."
                : "Wallet session refreshed."
            );
          })
          .catch((reason: unknown) => {
            onError(reason instanceof Error ? reason.message : "Wallet sign-in failed.");
          })
          .finally(() => {
            setIsBusy(false);
          });
      }}
      type="button"
    >
      <WalletUiIcon className="wallet-icon" wallet={wallet} />
      <span>{isBusy ? `Signing With ${wallet.name}...` : `Sign In With ${wallet.name}`}</span>
    </button>
  );
}

function SubmissionListItem({
  submission,
  onEdit,
  onFinalize,
  onMint,
  busyKey
}: {
  submission: SubmissionPacketSummary;
  onEdit: () => void;
  onFinalize: () => void;
  onMint: () => void;
  busyKey: string | null;
}) {
  return (
    <article className="panel-card">
      <div className="panel-row">
        <div>
          <p className="eyebrow">Submission packet</p>
          <h3>{submission.title}</h3>
        </div>
        <span className={`status-pill status-${submission.status}`}>{submission.status}</span>
      </div>
      <p className="muted">{submission.summary}</p>
      <div className="chip-row">
        {submission.tags.map((tag) => (
          <span className="tag-chip" key={tag}>
            #{tag}
          </span>
        ))}
      </div>
      <div className="meta-grid">
        <span>Updated {formatUtc(submission.updatedAt)}</span>
        <span>
          Reviewer {submission.assignedReviewer?.displayName ?? "not assigned"}
        </span>
        <span>
          Score {submission.review ? submission.review.weightedScore.toFixed(2) : "pending"}
        </span>
      </div>
      {submission.assignmentReason ? (
        <p className="inline-note">{submission.assignmentReason}</p>
      ) : null}
      {submission.review?.decisionNotes ? (
        <p className="inline-note">{submission.review.decisionNotes}</p>
      ) : null}
      {submission.proofMint?.blockerMessage ? (
        <p className="inline-note inline-note-danger">{submission.proofMint.blockerMessage}</p>
      ) : null}
      <div className="action-row">
        {submission.status === "draft" ? (
          <>
            <button className="ghost-button" onClick={onEdit} type="button">
              Edit draft
            </button>
            <button
              className="primary-button"
              disabled={busyKey === `finalize:${submission.id}`}
              onClick={onFinalize}
              type="button"
            >
              {busyKey === `finalize:${submission.id}` ? "Finalizing..." : "Finalize"}
            </button>
          </>
        ) : null}
        {submission.status === "approved" ? (
          <button
            className="primary-button"
            disabled={busyKey === `mint:${submission.id}` || submission.proofMint?.status === "minted"}
            onClick={onMint}
            type="button"
          >
            {submission.proofMint?.status === "minted"
              ? "Minted"
              : busyKey === `mint:${submission.id}`
                ? "Minting..."
                : submission.proofMint
                  ? "Retry mint"
                  : "Mint proof"}
          </button>
        ) : null}
      </div>
    </article>
  );
}

function ProofShelfCard({ item }: { item: ProofShelfItem }) {
  return (
    <article className="panel-card">
      <div className="panel-row">
        <div>
          <p className="eyebrow">Proof shelf</p>
          <h3>{item.submissionTitle}</h3>
        </div>
        <span className={`status-pill status-${item.status}`}>{item.status}</span>
      </div>
      <p className="muted">{item.programTitle}</p>
      <div className="meta-grid">
        <span>Decision {formatUtc(item.decisionAt)}</span>
        <span>Mint state {item.proofMint?.status ?? "not requested"}</span>
        <span>Attempts {item.proofMint?.attemptCount ?? 0}</span>
      </div>
      {item.proofMint?.blockerMessage ? (
        <p className="inline-note inline-note-danger">{item.proofMint.blockerMessage}</p>
      ) : null}
      {item.proofMint?.explorerUrls ? (
        <div className="link-row">
          <a href={item.proofMint.explorerUrls.asset} rel="noreferrer" target="_blank">
            Asset
          </a>
          <a href={item.proofMint.explorerUrls.transaction} rel="noreferrer" target="_blank">
            Transaction
          </a>
          <a href={item.proofMint.explorerUrls.collection} rel="noreferrer" target="_blank">
            Collection
          </a>
        </div>
      ) : null}
    </article>
  );
}

function ReviewQueueCard({
  criteria,
  entry,
  busyKey,
  draftNotes,
  draftScores,
  onNoteChange,
  onScoreChange,
  onSaveScore,
  onDecision
}: {
  criteria: BootstrapResponse["programs"][number]["rubric"];
  entry: ReviewQueueEntry;
  busyKey: string | null;
  draftNotes: string;
  draftScores: ReviewRubricScore[];
  onNoteChange: (value: string) => void;
  onScoreChange: (criterionId: string, score: number) => void;
  onSaveScore: () => void;
  onDecision: (decision: "approved" | "rejected") => void;
}) {
  const weightedScore = criteria.reduce((total, criterion) => {
    const score = draftScores.find((entry) => entry.criterionId === criterion.id)?.score ?? 0;
    return total + score * criterion.weight;
  }, 0);

  return (
    <article className="panel-card">
      <div className="panel-row">
        <div>
          <p className="eyebrow">{entry.priority === "assigned" ? "Assigned" : "Unassigned"}</p>
          <h3>{entry.submission.title}</h3>
        </div>
        <span className={`status-pill status-${entry.submission.status}`}>
          {entry.submission.status}
        </span>
      </div>
      <p className="muted">{entry.submission.summary}</p>
      <div className="meta-grid">
        <span>Submitter {entry.submission.submitter.displayName}</span>
        <span>
          Reviewer {entry.submission.assignedReviewer?.displayName ?? "unassigned"}
        </span>
        <span>Updated {formatUtc(entry.submission.updatedAt)}</span>
      </div>
      <div className="link-row">
        {entry.submission.proofLinks.map((link) => (
          <a href={link} key={link} rel="noreferrer" target="_blank">
            Proof link
          </a>
        ))}
      </div>
      <div className="rubric-grid">
        {criteria.map((criterion) => {
          const score =
            draftScores.find((entry) => entry.criterionId === criterion.id)?.score ?? 3;
          return (
            <label className="rubric-card" key={criterion.id}>
              <span>
                {criterion.label} · {(criterion.weight * 100).toFixed(0)}%
              </span>
              <small>{criterion.description}</small>
              <input
                max={5}
                min={1}
                onChange={(event) => onScoreChange(criterion.id, Number(event.target.value))}
                type="range"
                value={score}
              />
              <strong>{score.toFixed(0)} / 5</strong>
            </label>
          );
        })}
      </div>
      <div className="panel-row">
        <div>
          <p className="eyebrow">Recommendation</p>
          <h3>{computeRecommendation(weightedScore)}</h3>
        </div>
        <strong>{weightedScore.toFixed(2)}</strong>
      </div>
      <label>
        <span>Decision notes</span>
        <textarea
          onChange={(event) => onNoteChange(event.target.value)}
          rows={3}
          value={draftNotes}
        />
      </label>
      <div className="action-row">
        <button
          className="ghost-button"
          disabled={busyKey === `score:${entry.submission.id}`}
          onClick={onSaveScore}
          type="button"
        >
          {busyKey === `score:${entry.submission.id}` ? "Saving..." : "Save score"}
        </button>
        <button
          className="primary-button"
          disabled={busyKey === `decision:${entry.submission.id}:approved`}
          onClick={() => onDecision("approved")}
          type="button"
        >
          Approve
        </button>
        <button
          className="ghost-button"
          disabled={busyKey === `decision:${entry.submission.id}:rejected`}
          onClick={() => onDecision("rejected")}
          type="button"
        >
          Reject
        </button>
      </div>
    </article>
  );
}

export function App() {
  const [bootstrap, setBootstrap] = useState<BootstrapResponse | null>(null);
  const [route, setRoute] = useState<RouteId>(detectRoute(window.location.pathname));
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [editingSubmissionId, setEditingSubmissionId] = useState<string | null>(null);
  const [form, setForm] = useState<PacketFormState>(emptyForm);
  const [reviewDrafts, setReviewDrafts] = useState<
    Record<string, { scores: ReviewRubricScore[]; notes: string }>
  >({});

  const { account, disconnect, wallets } = useWalletUi();
  const connectedWalletAddress = account?.address ?? "";
  const user = bootstrap?.session.user ?? null;
  const program = bootstrap?.programs[0] ?? null;
  const hasWalletMismatch = Boolean(
    user && connectedWalletAddress && connectedWalletAddress !== user.walletAddress
  );

  async function refresh() {
    const data = await api<BootstrapResponse>("/api/bootstrap");
    setBootstrap(data);
    if (data.session.user?.role !== "operator" && route === "/operator") {
      startTransition(() => setRoute("/"));
    }
    if (data.session.user?.role === "contributor" && route === "/queue") {
      startTransition(() => setRoute("/"));
    }
  }

  useEffect(() => {
    void refresh().catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : "Failed to load BountyProof.");
    });
  }, []);

  useEffect(() => {
    const onPopState = () => setRoute(detectRoute(window.location.pathname));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (!bootstrap) {
      return;
    }

    const nextDrafts: Record<string, { scores: ReviewRubricScore[]; notes: string }> = {};
    for (const entry of bootstrap.reviewQueue) {
      nextDrafts[entry.submission.id] = {
        scores:
          entry.submission.review?.rubricScores.length
            ? entry.submission.review.rubricScores
            : (program?.rubric.map((criterion) => ({
                criterionId: criterion.id,
                score: 3
              })) ?? []),
        notes: entry.submission.review?.decisionNotes ?? ""
      };
    }
    setReviewDrafts(nextDrafts);
  }, [bootstrap, program?.id]);

  async function logout() {
    setBusyKey("logout");
    setError(null);
    try {
      await api("/api/auth/logout", { method: "POST" });
      await refresh();
      setNotice("Signed out.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Logout failed.");
    } finally {
      setBusyKey(null);
    }
  }

  async function saveSubmission() {
    if (!program) {
      return;
    }
    setBusyKey(editingSubmissionId ? `save:${editingSubmissionId}` : "create");
    setError(null);
    try {
      if (editingSubmissionId) {
        await api(`/api/submissions/${editingSubmissionId}`, {
          method: "PATCH",
          body: JSON.stringify(toRequest(program.id, form))
        });
        setNotice("Draft updated.");
      } else {
        await api("/api/submissions", {
          method: "POST",
          body: JSON.stringify(toRequest(program.id, form))
        });
        setNotice("Draft created.");
      }
      setForm(emptyForm);
      setEditingSubmissionId(null);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save submission.");
    } finally {
      setBusyKey(null);
    }
  }

  async function finalizeSubmission(submissionId: string) {
    setBusyKey(`finalize:${submissionId}`);
    setError(null);
    try {
      await api(`/api/submissions/${submissionId}/finalize`, { method: "POST" });
      setNotice("Submission packet finalized and sent to review.");
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not finalize submission.");
    } finally {
      setBusyKey(null);
    }
  }

  async function mintProof(submissionId: string) {
    setBusyKey(`mint:${submissionId}`);
    setError(null);
    try {
      await api(`/api/submissions/${submissionId}/mint`, { method: "POST" });
      setNotice("Mint attempt recorded.");
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not mint proof.");
    } finally {
      setBusyKey(null);
    }
  }

  async function rebalanceReviews() {
    setBusyKey("rebalance");
    setError(null);
    try {
      const result = await api<{ rebalanced: number }>("/api/reviews/rebalance", {
        method: "POST"
      });
      setNotice(`Rebalanced ${result.rebalanced} submission(s).`);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not rebalance queue.");
    } finally {
      setBusyKey(null);
    }
  }

  async function saveReviewScore(entry: ReviewQueueEntry) {
    const draft = reviewDrafts[entry.submission.id];
    if (!draft) {
      return;
    }
    setBusyKey(`score:${entry.submission.id}`);
    setError(null);
    try {
      await api(`/api/reviews/${entry.submission.id}/score`, {
        method: "POST",
        body: JSON.stringify({ rubricScores: draft.scores })
      });
      setNotice("Rubric score saved.");
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save review score.");
    } finally {
      setBusyKey(null);
    }
  }

  async function submitDecision(
    entry: ReviewQueueEntry,
    decision: "approved" | "rejected"
  ) {
    const draft = reviewDrafts[entry.submission.id];
    if (!draft) {
      return;
    }
    setBusyKey(`decision:${entry.submission.id}:${decision}`);
    setError(null);
    try {
      await api(`/api/reviews/${entry.submission.id}/decision`, {
        method: "POST",
        body: JSON.stringify({
          rubricScores: draft.scores,
          decision,
          notes: draft.notes
        })
      });
      setNotice(`Submission ${decision}.`);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not submit review decision.");
    } finally {
      setBusyKey(null);
    }
  }

  async function updateRole(userId: string, role: "contributor" | "reviewer") {
    setBusyKey(`role:${userId}:${role}`);
    setError(null);
    try {
      await api(`/api/admin/users/${userId}/role`, {
        method: "POST",
        body: JSON.stringify({ role })
      });
      setNotice("User role updated.");
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update role.");
    } finally {
      setBusyKey(null);
    }
  }

  const dashboardMetrics = useMemo(() => {
    if (!bootstrap) {
      return [];
    }

    return [
      {
        label: "Mint readiness",
        value: bootstrap.runtime.minting.enabled ? "Ready" : "Blocked"
      },
      {
        label: "My packets",
        value: String(bootstrap.mySubmissions.length)
      },
      {
        label: "Queue depth",
        value: String(bootstrap.reviewQueue.length)
      },
      {
        label: "Proof shelf",
        value: String(bootstrap.proofShelf.length)
      }
    ];
  }, [bootstrap]);

  if (!bootstrap) {
    return (
      <main className="app-shell loading">
        <div className="ambient ambient-a" />
        <div className="ambient ambient-b" />
        <section className="hero-card">
          <p className="eyebrow">BountyProof</p>
          <h1>Loading build 072.</h1>
        </section>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="auth-shell">
        <div className="ambient ambient-a" />
        <div className="ambient ambient-b" />
        <section className="hero-card">
          <p className="eyebrow">Nightshift 2026-04-29</p>
          <h1>BountyProof</h1>
          <p className="lede">
            Wallet-first submission review for contributors, reviewers, and operators. Build
            072 runs a dark editorial surface over durable server-side state.
          </p>
          <div className="hero-stamps">
            <span>SIWS auth</span>
            <span>MPL Core proofs</span>
            <span>Balanced review queue</span>
          </div>
        </section>
        <section className="auth-card stack">
          <div className="section-head">
            <h2>Sign in with wallet</h2>
            <span>{bootstrap.runtime.minting.message}</span>
          </div>
          {wallets.length === 0 ? (
            <p className="muted">
              No wallet providers detected. Install a Solana wallet extension, then reload.
            </p>
          ) : (
            wallets.map((wallet) => (
              <div className="wallet-stack" key={wallet.name}>
                <WalletConnectOption busy={false} wallet={wallet} />
                <WalletSignInOption
                  onError={setError}
                  onNotice={setNotice}
                  refresh={refresh}
                  wallet={wallet}
                />
                {("solana:signIn" in wallet.features) ? null : (
                  <WalletMessageSignInOption
                    onError={setError}
                    onNotice={setNotice}
                    refresh={refresh}
                    wallet={wallet}
                  />
                )}
              </div>
            ))
          )}
          {error ? <p className="banner banner-danger">{error}</p> : null}
          {notice ? <p className="banner">{notice}</p> : null}
          <small className="muted">
            Solana is the primitive here. The product state, review queue, and proof minting all
            live in BountyProof itself.
          </small>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <div className="ambient ambient-a" />
      <div className="ambient ambient-b" />
      <header className="topbar">
        <section className="hero-card hero-grid">
          <div className="stack">
            <p className="eyebrow">BountyProof build 072</p>
            <h1>Submission review that survives contact with reality.</h1>
            <p className="lede">
              Create packets, route them through weighted scoring, and mint approved proof assets
              only into the authenticated session wallet.
            </p>
            <div className="hero-stamps">
              {dashboardMetrics.map((entry) => (
                <span key={entry.label}>
                  {entry.label}: {entry.value}
                </span>
              ))}
            </div>
          </div>
          <div className="identity-block">
            <div className="identity-chip">
              <span>{user.displayName}</span>
              <strong>{shortAddress(user.walletAddress)}</strong>
            </div>
            <div className="identity-chip">
              <span>Role</span>
              <strong>{user.role}</strong>
            </div>
            <div className="identity-chip">
              <span>Mint runtime</span>
              <strong>{bootstrap.runtime.minting.status}</strong>
            </div>
          </div>
        </section>
        <section className="sheet topbar-actions">
          <div className="mode-switch">
            <button
              className={route === "/" ? "active" : ""}
              onClick={() => navigate("/")}
              type="button"
            >
              Submissions
            </button>
            {(user.role === "reviewer" || user.role === "operator") ? (
              <button
                className={route === "/queue" ? "active" : ""}
                onClick={() => navigate("/queue")}
                type="button"
              >
                Queue
              </button>
            ) : null}
            <button
              className={route === "/proofs" ? "active" : ""}
              onClick={() => navigate("/proofs")}
              type="button"
            >
              Proofs
            </button>
            {user.role === "operator" ? (
              <button
                className={route === "/operator" ? "active" : ""}
                onClick={() => navigate("/operator")}
                type="button"
              >
                Operator
              </button>
            ) : null}
          </div>
          <div className="topbar-actions">
            {connectedWalletAddress ? (
              <span className="wallet-inline">
                Connected {shortAddress(connectedWalletAddress)}
              </span>
            ) : null}
            <button
              className="ghost-button"
              disabled={disconnecting}
              onClick={() => {
                setDisconnecting(true);
                void Promise.resolve(disconnect())
                  .catch(() => null)
                  .finally(() => setDisconnecting(false));
              }}
              type="button"
            >
              {disconnecting ? "Disconnecting..." : "Disconnect wallet"}
            </button>
            <button
              className="ghost-button"
              disabled={busyKey === "logout"}
              onClick={() => void logout()}
              type="button"
            >
              {busyKey === "logout" ? "Signing out..." : "Sign out"}
            </button>
          </div>
        </section>
        {hasWalletMismatch ? (
          <p className="banner banner-danger">
            Connected wallet does not match the authenticated session wallet. Minting stays bound
            to the authenticated session.
          </p>
        ) : null}
        {error ? <p className="banner banner-danger">{error}</p> : null}
        {notice ? <p className="banner">{notice}</p> : null}
      </header>

      <section className="content-stack">
        {route === "/" ? (
          <>
            <section className="sheet stack">
              <div className="section-head">
                <div>
                  <p className="eyebrow">Contributor workspace</p>
                  <h2>{editingSubmissionId ? "Edit packet" : "New packet"}</h2>
                </div>
                <span>{program?.title}</span>
              </div>
              <label>
                <span>Title</span>
                <input
                  onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                  placeholder="Concise submission title"
                  value={form.title}
                />
              </label>
              <label>
                <span>Summary</span>
                <textarea
                  onChange={(event) =>
                    setForm((current) => ({ ...current, summary: event.target.value }))
                  }
                  placeholder="What did you ship, fix, or prove?"
                  rows={5}
                  value={form.summary}
                />
              </label>
              <label>
                <span>Proof links</span>
                <textarea
                  onChange={(event) =>
                    setForm((current) => ({ ...current, proofLinks: event.target.value }))
                  }
                  placeholder={"One URL per line\nhttps://github.com/...\nhttps://example.com/demo"}
                  rows={4}
                  value={form.proofLinks}
                />
              </label>
              <label>
                <span>Tags</span>
                <input
                  onChange={(event) => setForm((current) => ({ ...current, tags: event.target.value }))}
                  placeholder="frontend, api, validation"
                  value={form.tags}
                />
              </label>
              <label>
                <span>Optional note</span>
                <textarea
                  onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
                  placeholder="Context for reviewer handoff"
                  rows={3}
                  value={form.note}
                />
              </label>
              <div className="action-row">
                <button
                  className="primary-button"
                  disabled={busyKey === "create" || busyKey?.startsWith("save:")}
                  onClick={() => void saveSubmission()}
                  type="button"
                >
                  {editingSubmissionId
                    ? busyKey?.startsWith("save:")
                      ? "Saving..."
                      : "Save draft"
                    : busyKey === "create"
                      ? "Creating..."
                      : "Create draft"}
                </button>
                <button
                  className="ghost-button"
                  onClick={() => {
                    setEditingSubmissionId(null);
                    setForm(emptyForm);
                  }}
                  type="button"
                >
                  Reset editor
                </button>
              </div>
            </section>

            <section className="sheet stack">
              <div className="section-head">
                <div>
                  <p className="eyebrow">History</p>
                  <h2>Submission packets</h2>
                </div>
                <span>{bootstrap.mySubmissions.length} total</span>
              </div>
              <div className="panel-list">
                {bootstrap.mySubmissions.length === 0 ? (
                  <p className="muted">
                    No packets yet. Draft one above, then finalize it when the evidence is ready.
                  </p>
                ) : (
                  bootstrap.mySubmissions.map((submission) => (
                    <SubmissionListItem
                      busyKey={busyKey}
                      key={submission.id}
                      onEdit={() => {
                        setEditingSubmissionId(submission.id);
                        setForm(fromSubmission(submission));
                      }}
                      onFinalize={() => void finalizeSubmission(submission.id)}
                      onMint={() => void mintProof(submission.id)}
                      submission={submission}
                    />
                  ))
                )}
              </div>
            </section>
          </>
        ) : null}

        {route === "/queue" ? (
          <section className="sheet stack">
            <div className="section-head">
              <div>
                <p className="eyebrow">Reviewer surface</p>
                <h2>Review queue</h2>
              </div>
              <span>{bootstrap.reviewQueue.length} active items</span>
            </div>
            <div className="panel-list">
              {bootstrap.reviewQueue.length === 0 || !program ? (
                <p className="muted">
                  No packets are waiting on this reviewer queue right now.
                </p>
              ) : (
                bootstrap.reviewQueue.map((entry) => {
                  const draft = reviewDrafts[entry.submission.id] ?? {
                    notes: "",
                    scores:
                      program.rubric.map((criterion) => ({
                        criterionId: criterion.id,
                        score: 3
                      })) ?? []
                  };
                  return (
                    <ReviewQueueCard
                      busyKey={busyKey}
                      criteria={program.rubric}
                      draftNotes={draft.notes}
                      draftScores={draft.scores}
                      entry={entry}
                      key={entry.submission.id}
                      onDecision={(decision) => void submitDecision(entry, decision)}
                      onNoteChange={(value) =>
                        setReviewDrafts((current) => ({
                          ...current,
                          [entry.submission.id]: { ...draft, notes: value }
                        }))
                      }
                      onSaveScore={() => void saveReviewScore(entry)}
                      onScoreChange={(criterionId, score) =>
                        setReviewDrafts((current) => ({
                          ...current,
                          [entry.submission.id]: {
                            ...draft,
                            scores: draft.scores.map((entryScore) =>
                              entryScore.criterionId === criterionId
                                ? { ...entryScore, score }
                                : entryScore
                            )
                          }
                        }))
                      }
                    />
                  );
                })
              )}
            </div>
          </section>
        ) : null}

        {route === "/proofs" ? (
          <section className="sheet stack">
            <div className="section-head">
              <div>
                <p className="eyebrow">Proof shelf</p>
                <h2>Minted assets and outcomes</h2>
              </div>
              <span>{bootstrap.proofShelf.length} tracked items</span>
            </div>
            <div className="panel-list">
              {bootstrap.proofShelf.length === 0 ? (
                <p className="muted">
                  Approved packets and mint attempts will accumulate here with their proof state.
                </p>
              ) : (
                bootstrap.proofShelf.map((item) => (
                  <ProofShelfCard item={item} key={item.submissionId} />
                ))
              )}
            </div>
          </section>
        ) : null}

        {route === "/operator" && bootstrap.operatorDashboard ? (
          <>
            <section className="sheet stack">
              <div className="section-head">
                <div>
                  <p className="eyebrow">Operator tool</p>
                  <h2>Runtime and balancing</h2>
                </div>
                <button
                  className="primary-button"
                  disabled={busyKey === "rebalance"}
                  onClick={() => void rebalanceReviews()}
                  type="button"
                >
                  {busyKey === "rebalance" ? "Rebalancing..." : "Rebalance queue"}
                </button>
              </div>
              <div className="stats-grid">
                <div className="stat-card">
                  <span>Unassigned</span>
                  <strong>{bootstrap.operatorDashboard.unassignedSubmissionCount}</strong>
                </div>
                <div className="stat-card">
                  <span>In review</span>
                  <strong>{bootstrap.operatorDashboard.inReviewCount}</strong>
                </div>
                <div className="stat-card">
                  <span>Approved</span>
                  <strong>{bootstrap.operatorDashboard.approvedCount}</strong>
                </div>
                <div className="stat-card">
                  <span>Blocked mints</span>
                  <strong>{bootstrap.operatorDashboard.blockedMintCount}</strong>
                </div>
              </div>
              <p className="inline-note">{bootstrap.runtime.minting.message}</p>
            </section>

            <section className="sheet stack">
              <div className="section-head">
                <div>
                  <p className="eyebrow">Reviewer load</p>
                  <h2>Capacity</h2>
                </div>
              </div>
              <div className="panel-list">
                {bootstrap.operatorDashboard.reviewerCapacity.map((reviewer) => (
                  <article className="panel-card" key={reviewer.id}>
                    <div className="panel-row">
                      <div>
                        <h3>{reviewer.displayName}</h3>
                        <p className="muted">{shortAddress(reviewer.walletAddress)}</p>
                      </div>
                      <span className={`status-pill status-${reviewer.role}`}>{reviewer.role}</span>
                    </div>
                    <div className="meta-grid">
                      <span>Open assignments {reviewer.openAssignments}</span>
                      <span>Completed reviews {reviewer.completedReviews}</span>
                      <span>Last auth {formatUtc(reviewer.lastAuthenticatedAt)}</span>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="sheet stack">
              <div className="section-head">
                <div>
                  <p className="eyebrow">User directory</p>
                  <h2>Role controls</h2>
                </div>
              </div>
              <div className="panel-list">
                {bootstrap.operatorDashboard.userDirectory.map((entry) => (
                  <article className="panel-card" key={entry.id}>
                    <div className="panel-row">
                      <div>
                        <h3>{entry.displayName}</h3>
                        <p className="muted">{shortAddress(entry.walletAddress)}</p>
                      </div>
                      <span className={`status-pill status-${entry.role}`}>{entry.role}</span>
                    </div>
                    <div className="meta-grid">
                      <span>Open assignments {entry.openAssignments}</span>
                      <span>Completed reviews {entry.completedReviews}</span>
                      <span>Last auth {formatUtc(entry.lastAuthenticatedAt)}</span>
                    </div>
                    {entry.role === "operator" ? (
                      <p className="inline-note">
                        Operator role comes from the wallet allowlist and is not changed here.
                      </p>
                    ) : (
                      <div className="action-row">
                        <button
                          className="ghost-button"
                          disabled={busyKey === `role:${entry.id}:contributor`}
                          onClick={() => void updateRole(entry.id, "contributor")}
                          type="button"
                        >
                          Contributor
                        </button>
                        <button
                          className="primary-button"
                          disabled={busyKey === `role:${entry.id}:reviewer`}
                          onClick={() => void updateRole(entry.id, "reviewer")}
                          type="button"
                        >
                          Reviewer
                        </button>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </section>

            <section className="sheet stack">
              <div className="section-head">
                <div>
                  <p className="eyebrow">Audit trail</p>
                  <h2>Recent activity</h2>
                </div>
              </div>
              <div className="panel-list">
                {bootstrap.operatorDashboard.recentAudit.map((event) => (
                  <article className="panel-card" key={event.id}>
                    <div className="panel-row">
                      <div>
                        <h3>{event.headline}</h3>
                        <p className="muted">{event.detail}</p>
                      </div>
                      <span>{formatUtc(event.createdAt)}</span>
                    </div>
                    <div className="meta-grid">
                      <span>{event.actorDisplayName}</span>
                      <span>{event.kind}</span>
                      <span>{event.subjectType}</span>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </>
        ) : null}
      </section>

      <nav className="bottom-nav">
        <button className={route === "/" ? "active" : ""} onClick={() => navigate("/")} type="button">
          Submissions
        </button>
        {(user.role === "reviewer" || user.role === "operator") ? (
          <button
            className={route === "/queue" ? "active" : ""}
            onClick={() => navigate("/queue")}
            type="button"
          >
            Queue
          </button>
        ) : null}
        <button
          className={route === "/proofs" ? "active" : ""}
          onClick={() => navigate("/proofs")}
          type="button"
        >
          Proofs
        </button>
        {user.role === "operator" ? (
          <button
            className={route === "/operator" ? "active" : ""}
            onClick={() => navigate("/operator")}
            type="button"
          >
            Operator
          </button>
        ) : null}
      </nav>
    </main>
  );
}
