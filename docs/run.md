# Run locally

## Prerequisites

- **Node 20.9+** (Next.js 16 requirement) and **Yarn 1.22+**. The repo pins Yarn via `packageManager`; `corepack enable` sets it up.
- A **Ready wallet**: Chrome extension for desktop, or the Ready mobile app.
- An [Alchemy](https://www.alchemy.com) Starknet API key.
- Optional: [Upstash](https://upstash.com) Redis credentials for a shared catalog.
- Optional: [Scarb](https://docs.swmansion.com/scarb), only if you want to rebuild the Cairo helper.

## App

```bash
git clone https://github.com/JaDi03/GhostDeal.git
cd GhostDeal
yarn install
cp .env.example .env.local
```

Fill `.env.local`.

| Variable | Role |
| --- | --- |
| `NEXT_PUBLIC_PROVIDER_URL` | Alchemy Starknet API key only (the URL prefix is already in `src/utils/constants.ts`) |
| `NEXT_PUBLIC_GHOSTDEAL_ESCROW_MAINNET` | Mainnet helper address |
| `NEXT_PUBLIC_GHOSTDEAL_ESCROW_SEPOLIA` | Sepolia helper address |
| `NEXT_PUBLIC_WC_PROJECT_ID` | Optional Reown id for ReadyConnector |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Required for a public marketplace. Without them, listings stay in this browser |

```bash
yarn dev
```

Open [http://localhost:3000](http://localhost:3000). Connect Ready on Mainnet or Sepolia.

- **Desktop:** Chrome + Ready extension. The picker uses get-starknet discovery.
- **Phone:** open the PWA inside Ready's in-app browser. A normal mobile browser has no injected wallet.

Wallet API must be `>= 0.10.3` before Pay. The app refuses a fake public Pay if the wallet is below that.

```bash
yarn lint
yarn build
```

If you change the Cairo helper:

```bash
cd cairo && scarb build
```
