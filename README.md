# BountyProof

BountyProof is Nightshift 2026-04-29 build 072. It is a wallet-first submission review product for bounty programs: contributors create and finalize proof packets, reviewers score them with a weighted rubric, operators balance the queue, and approved packets can mint MPL Core proof assets to the authenticated session wallet.

Live link: `TBD`

## Agent

- Agent: `openai-codex/gpt-5.4`
- Reasoning: `low`

## Stack

- TypeScript throughout
- React + Vite frontend
- Express single-container server for API + frontend
- `@solana/kit`
- `@wallet-ui/react`
- local `@obrera/mpl-core-kit-lib`
- file-backed durable persistence
- no `@solana/web3.js`
- no `@solana/wallet-adapter-react`

## How To Run

```bash
npm install --ignore-scripts
npm run typecheck
npm run build
npm start
```

Default server URL:

- `http://localhost:3001`

## Challenge Reference

- `Nightshift 2026-04-29 build 072`

## Environment Variables

Product-specific variables use the `BOUNTYPROOF_` prefix.

Required for live mint readiness:

```bash
export BOUNTYPROOF_PUBLIC_BASE_URL="https://your-app.example.com"
export BOUNTYPROOF_DEVNET_SIGNER_KEYPAIR="/absolute/path/to/devnet-keypair.json"
export BOUNTYPROOF_COLLECTION_ADDRESS="YOUR_DEVNET_COLLECTION_ADDRESS"
```

Optional runtime variables:

```bash
export BOUNTYPROOF_DEVNET_RPC_URL="https://api.devnet.solana.com"
export BOUNTYPROOF_DEVNET_WS_URL="wss://api.devnet.solana.com"
export BOUNTYPROOF_OPERATOR_WALLETS="wallet1,wallet2"
export BOUNTYPROOF_DATA_PATH="/custom/path/bountyproof-db.json"
export PORT="3001"
```

`BOUNTYPROOF_DEVNET_SIGNER_KEYPAIR` may be:

- an absolute or relative path to a Solana keypair JSON file
- a raw JSON array
- a comma-separated 64-byte list
- a `base64:<value>` string

## API Summary

- `GET /api/health`
- `GET /api/bootstrap`
- `POST /api/auth/solana-auth/nonce`
- `POST /api/auth/solana-auth/verify`
- `POST /api/auth/logout`
- `POST /api/submissions`
- `PATCH /api/submissions/:submissionId`
- `POST /api/submissions/:submissionId/finalize`
- `POST /api/reviews/rebalance`
- `POST /api/reviews/:submissionId/score`
- `POST /api/reviews/:submissionId/decision`
- `POST /api/submissions/:submissionId/mint`
- `POST /api/admin/users/:userId/role`
- `GET /api/proofs/:submissionId/metadata.json`
- `GET /api/proofs/:submissionId/image.svg`

## Notes

- Health and bootstrap both expose mint runtime readiness so blocked mint states are honest when configuration is missing.
- Proof minting always targets the wallet bound to the authenticated SIWS session. The product never accepts a pasted destination wallet for minting.
- Persistent state defaults to `data/bountyproof-db.json`.
