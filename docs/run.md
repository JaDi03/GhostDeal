# Run locally

## App

```bash
yarn install
cp .env.example .env.local
```

Fill `.env.local` from [`.env.example`](https://github.com/JaDi03/GhostDeal/blob/main/.env.example). Never commit it.

| Variable | Role |
| --- | --- |
| `NEXT_PUBLIC_PROVIDER_URL` | Alchemy Starknet API key only (the URL prefix is already in `src/utils/constants.ts`) |
| `NEXT_PUBLIC_GHOSTDEAL_ESCROW_MAINNET` | Helper address, or `0x0` |
| `NEXT_PUBLIC_GHOSTDEAL_ESCROW_SEPOLIA` | Helper address, or `0x0` |
| `NEXT_PUBLIC_WC_PROJECT_ID` | Optional Reown id for ReadyConnector |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Shared listings. Without them, the app is local-only plus demo seeds |

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

If you change Cairo:

```bash
cd cairo && scarb build
```

## This documentation site

Python 3, then (Windows):

```bash
python -m venv .venv
.\.venv\Scripts\pip install -r requirements-docs.txt
.\.venv\Scripts\mkdocs serve
```

macOS / Linux: `source .venv/bin/activate` then `pip install -r requirements-docs.txt` and `mkdocs serve`.

Open [http://127.0.0.1:8000](http://127.0.0.1:8000). This stays local until we publish.

```bash
mkdocs build
```

writes a static site into `site/` (gitignored).

## Reuse the helper

This repo is not an npm platform. Copy `cairo/` and the Wallet API helpers in `src/lib/escrow.ts` into another dapp.

Rules that must travel with the code:

- The dapp never holds viewing keys.
- The dapp never calls the Privacy SDK.
- Do not display a counterparty balance.
- Do not invent pool, token, or helper addresses. Read `src/utils/constants.ts`.
