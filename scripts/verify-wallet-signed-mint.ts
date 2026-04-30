import {
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  devnet,
  getBase58Decoder,
  getSignatureFromTransaction,
  getTransactionDecoder,
  sendTransactionWithoutConfirmingFactory,
  signTransactionWithSigners,
  type KeyPairSigner
} from "@solana/kit";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import type {
  BootstrapResponse,
  ConfirmProofMintRequest,
  PrepareProofMintResponse,
  ReviewDecisionRequest,
  SolanaAuthNonceResponse,
  SubmissionDraftRequest,
  SubmissionPacketSummary
} from "../src/shared/contracts.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

function parseSecretKey(raw: string): Uint8Array {
  const normalized = raw.trim();

  if (normalized.startsWith("base64:")) {
    return Uint8Array.from(Buffer.from(normalized.slice(7), "base64"));
  }

  if (normalized.startsWith("[") && normalized.endsWith("]")) {
    return Uint8Array.from(JSON.parse(normalized) as number[]);
  }

  if (normalized.includes(",")) {
    return Uint8Array.from(
      normalized
        .split(",")
        .map((value) => Number(String(value).trim()))
        .filter((value) => Number.isFinite(value))
    );
  }

  throw new Error(
    "Verification wallet keypair must be a path, JSON array, comma-separated list, or base64:value."
  );
}

async function loadSecretKey(raw: string): Promise<Uint8Array> {
  if (
    raw.startsWith("/") ||
    raw.startsWith("./") ||
    raw.startsWith("../") ||
    raw.endsWith(".json")
  ) {
    const contents = await readFile(raw, "utf8");
    return parseSecretKey(contents);
  }

  return parseSecretKey(raw);
}

function buildSiwsMessage(challenge: SolanaAuthNonceResponse) {
  return [
    `${challenge.domain} wants you to sign in with your Solana account:`,
    challenge.walletAddress,
    "",
    challenge.statement,
    "",
    `URI: ${challenge.uri}`,
    "Version: 1",
    `Chain ID: ${challenge.chainId}`,
    `Nonce: ${challenge.nonce}`,
    `Issued At: ${challenge.issuedAt}`,
    `Expiration Time: ${challenge.expirationTime}`
  ].join("\n");
}

function decodeBase64ToBytes(value: string): Uint8Array {
  return Uint8Array.from(Buffer.from(value, "base64"));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(baseUrl: string) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // Retry until the server is up.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${baseUrl}/api/health`);
}

async function maybeStartLocalServer(): Promise<{
  baseUrl: string;
  cleanup: () => Promise<void>;
}> {
  const externalBaseUrl = process.env.BOUNTYPROOF_VERIFY_BASE_URL;
  if (externalBaseUrl) {
    return {
      baseUrl: externalBaseUrl,
      cleanup: async () => undefined
    };
  }

  const port = process.env.BOUNTYPROOF_VERIFY_PORT ?? "3101";
  const baseUrl = `http://127.0.0.1:${port}`;
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "bountyproof-verify-"));
  const dataPath = path.join(tempDir, "verify-db.json");
  const server = spawn(process.execPath, [path.resolve(rootDir, "dist/server/index.js")], {
    cwd: rootDir,
    env: {
      ...process.env,
      PORT: port,
      BOUNTYPROOF_DATA_PATH: dataPath,
      BOUNTYPROOF_PUBLIC_BASE_URL: baseUrl
    },
    stdio: "inherit"
  });

  try {
    await waitForServer(baseUrl);
  } catch (error) {
    server.kill("SIGTERM");
    throw error;
  }

  return {
    baseUrl,
    cleanup: async () => stopProcess(server)
  };
}

async function stopProcess(server: ChildProcess) {
  if (server.exitCode !== null || server.signalCode !== null) {
    return;
  }

  server.kill("SIGTERM");
  await new Promise<void>((resolve) => {
    server.once("exit", () => resolve());
    setTimeout(() => {
      server.kill("SIGKILL");
      resolve();
    }, 5_000);
  });
}

async function api<T>(baseUrl: string, pathName: string, init?: RequestInit & { cookie?: string }) {
  const response = await fetch(`${baseUrl}${pathName}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.cookie ? { Cookie: init.cookie } : {}),
      ...(init?.headers ?? {})
    }
  });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    const detail =
      typeof data.error === "string"
        ? data.error
        : JSON.stringify(data.error ?? data);
    throw new Error(detail || `Request failed: ${pathName}`);
  }
  return {
    data,
    cookie: response.headers.get("set-cookie") ?? init?.cookie ?? ""
  };
}

async function executeWalletSignedMint(args: {
  prepared: PrepareProofMintResponse;
  walletSigner: KeyPairSigner<string>;
  wsUrl: string;
}) {
  const rpc = createSolanaRpc(devnet(args.prepared.plan.rpcUrl));
  const sendTransactionWithoutConfirming = sendTransactionWithoutConfirmingFactory({
    rpc
  });
  const transactionBytes = decodeBase64ToBytes(args.prepared.plan.transaction);
  const preparedTransaction = getTransactionDecoder().decode(transactionBytes);
  const transaction = await signTransactionWithSigners([args.walletSigner], preparedTransaction);
  await sendTransactionWithoutConfirming(
    transaction as Parameters<typeof sendTransactionWithoutConfirming>[0],
    {
      commitment: "confirmed"
    }
  );

  const signature = getSignatureFromTransaction(
    transaction as Parameters<typeof getSignatureFromTransaction>[0]
  );

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const { value: statuses } = await rpc.getSignatureStatuses([signature]).send();
    const status = statuses[0];

    if (status?.err) {
      throw new Error(`Mint transaction failed on-chain: ${JSON.stringify(status.err)}`);
    }

    if (
      status &&
      (status.confirmationStatus === "confirmed" ||
        status.confirmationStatus === "finalized")
    ) {
      break;
    }

    await sleep(1_000);
  }

  const confirmBody: ConfirmProofMintRequest = {
    assetAddress: args.prepared.plan.assetAddress,
    signature,
    transaction: args.prepared.plan.transaction
  };

  return confirmBody;
}

async function main() {
  const secretSource =
    process.env.BOUNTYPROOF_VERIFY_WALLET_KEYPAIR ??
    process.env.BOUNTYPROOF_DEVNET_SIGNER_KEYPAIR;
  if (!secretSource) {
    throw new Error(
      "Set BOUNTYPROOF_VERIFY_WALLET_KEYPAIR (or reuse BOUNTYPROOF_DEVNET_SIGNER_KEYPAIR) to run verification."
    );
  }

  const secretKey = await loadSecretKey(secretSource);
  const walletSigner = (await createKeyPairSignerFromBytes(
    secretKey,
    false
  )) as KeyPairSigner<string>;
  const walletAddress = String(walletSigner.address);
  const wsUrl =
    process.env.BOUNTYPROOF_DEVNET_WS_URL ??
    process.env.SOLANA_WS_URL ??
    "wss://api.devnet.solana.com";
  const { baseUrl, cleanup } = await maybeStartLocalServer();

  try {
    const nonce = await api<SolanaAuthNonceResponse>(baseUrl, "/api/auth/solana-auth/nonce", {
      method: "POST",
      body: JSON.stringify({ walletAddress })
    });
    const message = buildSiwsMessage(nonce.data);
    const [signatures] = await walletSigner.signMessages([
      { content: new TextEncoder().encode(message) }
    ]);
    const signed = await api<{ isNewUser: boolean }>(
      baseUrl,
      "/api/auth/solana-auth/verify",
      {
        method: "POST",
        body: JSON.stringify({
          walletAddress,
          message,
          signature: getBase58Decoder().decode(signatures[walletSigner.address]!)
        })
      }
    );
    const cookie = signed.cookie;

    await api(baseUrl, "/api/demo/promote-reviewer", {
      method: "POST",
      cookie
    });

    const bootstrap = await api<BootstrapResponse>(baseUrl, "/api/bootstrap", {
      method: "GET",
      cookie
    });
    const program = bootstrap.data.programs[0];
    if (!program) {
      throw new Error("No BountyProof program was available for verification.");
    }

    const draft: SubmissionDraftRequest = {
      programId: program.id,
      title: `Wallet-signed verify ${randomUUID().slice(0, 8)}`,
      summary: "Verification path for wallet-signed MPL Core minting.",
      proofLinks: ["https://example.com/wallet-signed-verify"],
      tags: ["verify", "wallet", "mint"],
      note: "Automated verification script."
    };

    const created = await api<SubmissionPacketSummary>(baseUrl, "/api/submissions", {
      method: "POST",
      body: JSON.stringify(draft),
      cookie
    });
    const submissionId = created.data.id;

    await api(baseUrl, `/api/submissions/${submissionId}/finalize`, {
      method: "POST",
      cookie
    });
    await api(baseUrl, "/api/reviews/rebalance", {
      method: "POST",
      cookie
    });

    const queueSnapshot = await api<BootstrapResponse>(baseUrl, "/api/bootstrap", {
      method: "GET",
      cookie
    });
    const queueEntry = queueSnapshot.data.reviewQueue.find(
      (entry) => entry.submission.id === submissionId
    );
    if (!queueEntry) {
      throw new Error("Finalized submission never appeared in the review queue.");
    }

    const decision: ReviewDecisionRequest = {
      rubricScores: program.rubric.map((criterion) => ({
        criterionId: criterion.id,
        score: 5
      })),
      decision: "approved",
      notes: "Automated wallet-signed mint verification approval."
    };

    await api(baseUrl, `/api/reviews/${submissionId}/decision`, {
      method: "POST",
      body: JSON.stringify(decision),
      cookie
    });

    const prepared = await api<PrepareProofMintResponse>(
      baseUrl,
      `/api/submissions/${submissionId}/mint/prepare`,
      {
        method: "POST",
        cookie
      }
    );
    const confirmBody = await executeWalletSignedMint({
      prepared: prepared.data,
      walletSigner,
      wsUrl
    });

    await api(baseUrl, `/api/submissions/${submissionId}/mint/confirm`, {
      method: "POST",
      body: JSON.stringify(confirmBody),
      cookie
    });

    const finalBootstrap = await api<BootstrapResponse>(baseUrl, "/api/bootstrap", {
      method: "GET",
      cookie
    });
    const minted = finalBootstrap.data.mySubmissions.find((entry) => entry.id === submissionId);
    if (minted?.proofMint?.status !== "minted" || !minted.proofMint.signature) {
      throw new Error("Submission did not persist a minted proof after wallet-signed confirmation.");
    }

    console.log(
      JSON.stringify(
        {
          baseUrl,
          submissionId,
          proofMintId: minted.proofMint.id,
          assetAddress: minted.proofMint.assetAddress,
          signature: minted.proofMint.signature,
          collectionAddress: minted.proofMint.collectionAddress
        },
        null,
        2
      )
    );
  } finally {
    await cleanup();
  }
}

void main().catch((error) => {
  if (error instanceof Error) {
    console.error(error.stack ?? error.message);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});
