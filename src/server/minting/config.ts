import { createKeyPairSignerFromBytes } from "@solana/kit";
import { promises as fs } from "node:fs";
import type { RuntimeMintingStatus } from "../../shared/contracts.js";
import { getEnv } from "../utils.js";

const defaultRpcUrl = "https://api.devnet.solana.com";
const defaultWsUrl = "wss://api.devnet.solana.com";

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
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isFinite(value))
    );
  }

  throw new Error(
    "BOUNTYPROOF_DEVNET_SIGNER_KEYPAIR must be a keypair path, JSON array, comma-separated list, or base64:value."
  );
}

async function loadSecretKey(raw: string): Promise<Uint8Array> {
  if (
    raw.startsWith("/") ||
    raw.startsWith("./") ||
    raw.startsWith("../") ||
    raw.endsWith(".json")
  ) {
    const contents = await fs.readFile(raw, "utf8");
    return parseSecretKey(contents);
  }

  return parseSecretKey(raw);
}

export interface BountyProofMintingConfig {
  publicBaseUrl: string;
  collectionAddress: string;
  rpcUrl: string;
  wsUrl: string;
  signer: Awaited<ReturnType<typeof createKeyPairSignerFromBytes>>;
}

export function getMintingStatus(): RuntimeMintingStatus {
  const publicBaseUrl = getEnv("BOUNTYPROOF_PUBLIC_BASE_URL");
  const signer = getEnv("BOUNTYPROOF_DEVNET_SIGNER_KEYPAIR");
  const collectionAddress = getEnv("BOUNTYPROOF_COLLECTION_ADDRESS");

  if (!publicBaseUrl) {
    return {
      enabled: false,
      status: "missing_public_base_url",
      message:
        "Proof minting is blocked because BOUNTYPROOF_PUBLIC_BASE_URL is not configured.",
      publicBaseUrlConfigured: false,
      signerConfigured: Boolean(signer),
      collectionConfigured: Boolean(collectionAddress),
      collectionAddress,
      executionMode: "collection-backed-mpl-core"
    };
  }

  if (!signer) {
    return {
      enabled: false,
      status: "missing_signer",
      message:
        "Proof minting is blocked because BOUNTYPROOF_DEVNET_SIGNER_KEYPAIR is not configured.",
      publicBaseUrlConfigured: true,
      signerConfigured: false,
      collectionConfigured: Boolean(collectionAddress),
      collectionAddress,
      executionMode: "collection-backed-mpl-core"
    };
  }

  if (!collectionAddress) {
    return {
      enabled: false,
      status: "missing_collection",
      message:
        "Proof minting is blocked until BOUNTYPROOF_COLLECTION_ADDRESS points at the MPL Core collection.",
      publicBaseUrlConfigured: true,
      signerConfigured: true,
      collectionConfigured: false,
      executionMode: "collection-backed-mpl-core"
    };
  }

  return {
    enabled: true,
    status: "ready",
    message: "Proof minting is ready for collection-backed MPL Core minting.",
    publicBaseUrlConfigured: true,
    signerConfigured: true,
    collectionConfigured: true,
    collectionAddress,
    executionMode: "collection-backed-mpl-core"
  };
}

export async function getMintingConfig(): Promise<BountyProofMintingConfig> {
  const status = getMintingStatus();
  if (!status.enabled || !status.collectionAddress) {
    throw new Error(status.message);
  }

  const secret = await loadSecretKey(getEnv("BOUNTYPROOF_DEVNET_SIGNER_KEYPAIR")!);

  return {
    publicBaseUrl: getEnv("BOUNTYPROOF_PUBLIC_BASE_URL")!,
    collectionAddress: status.collectionAddress,
    rpcUrl: getEnv("BOUNTYPROOF_DEVNET_RPC_URL") ?? defaultRpcUrl,
    wsUrl: getEnv("BOUNTYPROOF_DEVNET_WS_URL") ?? defaultWsUrl,
    signer: await createKeyPairSignerFromBytes(secret, false)
  };
}
