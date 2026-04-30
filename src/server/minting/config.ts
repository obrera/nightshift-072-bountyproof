import type { RuntimeMintingStatus } from "../../shared/contracts.js";
import { getEnv } from "../utils.js";

const defaultRpcUrl = "https://api.devnet.solana.com";
const defaultWsUrl = "wss://api.devnet.solana.com";

export interface BountyProofMintingConfig {
  publicBaseUrl: string;
  collectionAddress: string;
  rpcUrl: string;
  wsUrl: string;
  signerKeypair: string;
}

export function getMintingStatus(): RuntimeMintingStatus {
  const publicBaseUrl = getEnv("BOUNTYPROOF_PUBLIC_BASE_URL");
  const collectionAddress = getEnv("BOUNTYPROOF_COLLECTION_ADDRESS");
  const signerKeypair = getEnv("BOUNTYPROOF_DEVNET_SIGNER_KEYPAIR");

  if (!publicBaseUrl) {
    return {
      enabled: false,
      status: "missing_public_base_url",
      message:
        "Proof minting is blocked because BOUNTYPROOF_PUBLIC_BASE_URL is not configured for co-signed wallet metadata.",
      publicBaseUrlConfigured: false,
      collectionConfigured: Boolean(collectionAddress),
      signerConfigured: Boolean(signerKeypair),
      collectionAddress,
      executionMode: "wallet-co-signed-mpl-core"
    };
  }

  if (!collectionAddress) {
    return {
      enabled: false,
      status: "missing_collection",
      message:
        "Proof minting is blocked until BOUNTYPROOF_COLLECTION_ADDRESS points at the co-signed MPL Core collection.",
      publicBaseUrlConfigured: true,
      collectionConfigured: false,
      signerConfigured: Boolean(signerKeypair),
      executionMode: "wallet-co-signed-mpl-core"
    };
  }

  if (!signerKeypair) {
    return {
      enabled: false,
      status: "missing_signer",
      message:
        "Proof minting is blocked until BOUNTYPROOF_DEVNET_SIGNER_KEYPAIR is configured for collection-authority co-signing.",
      publicBaseUrlConfigured: true,
      collectionConfigured: true,
      signerConfigured: false,
      collectionAddress,
      executionMode: "wallet-co-signed-mpl-core"
    };
  }

  return {
    enabled: true,
    status: "ready",
    message: "Proof minting is ready for co-signed wallet collection-backed MPL Core minting.",
    publicBaseUrlConfigured: true,
    collectionConfigured: true,
    signerConfigured: true,
    collectionAddress,
    executionMode: "wallet-co-signed-mpl-core"
  };
}

export async function getMintingConfig(): Promise<BountyProofMintingConfig> {
  const status = getMintingStatus();
  if (!status.enabled || !status.collectionAddress) {
    throw new Error(status.message);
  }

  return {
    publicBaseUrl: getEnv("BOUNTYPROOF_PUBLIC_BASE_URL")!,
    collectionAddress: status.collectionAddress,
    rpcUrl: getEnv("BOUNTYPROOF_DEVNET_RPC_URL") ?? defaultRpcUrl,
    wsUrl: getEnv("BOUNTYPROOF_DEVNET_WS_URL") ?? defaultWsUrl,
    signerKeypair: getEnv("BOUNTYPROOF_DEVNET_SIGNER_KEYPAIR")!
  };
}
