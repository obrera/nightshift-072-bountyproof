import { fetchMaybeAssetV1, fetchMaybeCollectionV1, getCreateV2Instruction } from "@obrera/mpl-core-kit-lib";
import {
  address,
  appendTransactionMessageInstructions,
  assertIsAddress,
  createKeyPairSignerFromBytes,
  createNoopSigner,
  createSolanaRpc,
  createTransactionMessage,
  devnet,
  generateKeyPairSigner,
  getBase64Decoder,
  getTransactionDecoder,
  getTransactionEncoder,
  partiallySignTransactionMessageWithSigners,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  signature
} from "@solana/kit";
import { readFile } from "node:fs/promises";
import type { PrepareProofMintPlan } from "../../shared/contracts.js";
import { getMintingConfig } from "./config.js";

function createExplorerUrl(kind: "address" | "tx", value: string) {
  return `https://explorer.solana.com/${kind}/${value}?cluster=devnet`;
}

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
    "Minting signer keypair must be a path, JSON array, comma-separated list, or base64:value."
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

async function loadMintAuthoritySigner() {
  const config = await getMintingConfig();
  const secretKey = await loadSecretKey(config.signerKeypair);
  return createKeyPairSignerFromBytes(secretKey, false);
}

function decodeBase64ToBytes(value: string): Uint8Array {
  return Uint8Array.from(Buffer.from(value, "base64"));
}

export interface ProofMintResult {
  assetAddress: string;
  signature: string;
  collectionAddress: string;
  explorerUrls: {
    asset: string;
    collection: string;
    transaction: string;
  };
}

export async function prepareProofMintPlan(args: {
  metadataUrl: string;
  mintName: string;
  submissionId: string;
  walletAddress: string;
}): Promise<PrepareProofMintPlan> {
  const config = await getMintingConfig();

  try {
    assertIsAddress(args.walletAddress);
  } catch {
    throw new Error("Wallet address must be a valid Solana address.");
  }

  const rpc = createSolanaRpc(devnet(config.rpcUrl));
  const collectionAddress = address(config.collectionAddress);
  const collection = await fetchMaybeCollectionV1(rpc, collectionAddress);

  if (!collection.exists) {
    throw new Error("Configured MPL Core collection address does not exist on devnet.");
  }

  const authoritySigner = await loadMintAuthoritySigner();
  if (collection.data.updateAuthority !== authoritySigner.address) {
    throw new Error(
      "Configured minting signer does not match the devnet collection update authority."
    );
  }

  const assetSigner = await generateKeyPairSigner();
  const walletAddress = address(args.walletAddress);
  const walletNoopSigner = createNoopSigner(walletAddress);
  const { value: latestBlockhash } = await rpc
    .getLatestBlockhash({ commitment: "confirmed" })
    .send();

  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (current) => setTransactionMessageFeePayer(walletAddress, current),
    (current) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, current),
    (current) =>
      appendTransactionMessageInstructions(
        [
          getCreateV2Instruction({
            asset: assetSigner,
            authority: authoritySigner,
            collection: collectionAddress,
            name: args.mintName,
            owner: walletAddress,
            payer: walletNoopSigner,
            uri: args.metadataUrl
          })
        ],
        current
      )
  );

  const transaction = await partiallySignTransactionMessageWithSigners(message);
  const encodedTransaction = getBase64Decoder().decode(
    getTransactionEncoder().encode(transaction)
  );

  return {
    submissionId: args.submissionId,
    walletAddress: args.walletAddress,
    assetAddress: assetSigner.address,
    mintName: args.mintName,
    metadataUrl: args.metadataUrl,
    collectionAddress: config.collectionAddress,
    rpcUrl: config.rpcUrl,
    transaction: encodedTransaction,
    transactionEncoding: "base64"
  };
}

export async function verifyMintedProofAsset(args: {
  assetAddress: string;
  serializedTransaction: string;
  signatureValue: string;
  walletAddress: string;
}): Promise<ProofMintResult> {
  const config = await getMintingConfig();

  try {
    assertIsAddress(args.walletAddress);
    assertIsAddress(args.assetAddress);
    signature(args.signatureValue);
  } catch {
    throw new Error("Mint confirmation payload must include valid Solana addresses and signature.");
  }

  const transactionBytes = decodeBase64ToBytes(args.serializedTransaction);
  const preparedTransaction = getTransactionDecoder().decode(transactionBytes);
  const preparedSignerAddresses = Object.entries(preparedTransaction.signatures)
    .filter(([, signerValue]) => signerValue === null)
    .map(([signerAddress]) => signerAddress);

  if (!preparedSignerAddresses.includes(args.walletAddress)) {
    throw new Error("Prepared transaction did not require the authenticated wallet to co-sign.");
  }

  const rpc = createSolanaRpc(devnet(config.rpcUrl));
  const asset = await fetchMaybeAssetV1(rpc, address(args.assetAddress));

  if (!asset.exists) {
    throw new Error("Minted asset was not found on devnet yet.");
  }

  if (asset.data.owner !== address(args.walletAddress)) {
    throw new Error("Minted asset owner does not match the authenticated wallet.");
  }

  const mintedCollectionAddress =
    asset.data.updateAuthority.__kind === "Collection"
      ? asset.data.updateAuthority.fields[0]
      : undefined;
  if (mintedCollectionAddress !== address(config.collectionAddress)) {
    throw new Error("Minted asset does not belong to the configured MPL Core collection.");
  }

  return {
    assetAddress: args.assetAddress,
    signature: args.signatureValue,
    collectionAddress: config.collectionAddress,
    explorerUrls: {
      asset: createExplorerUrl("address", args.assetAddress),
      collection: createExplorerUrl("address", config.collectionAddress),
      transaction: createExplorerUrl("tx", args.signatureValue)
    }
  };
}
