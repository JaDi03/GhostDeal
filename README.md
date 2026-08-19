# GhostDeal

Pay in person without showing your balance. P2P marketplace escrow on Starknet STRK20.

GhostDeal is a mobile-first PWA for the [STRK20 Private Sprint](https://strk20.starknet.io/hackathon). A seller shows a QR at the item. The buyer taps Pay. Funds lock in a private escrow. After delivery, the buyer taps Release and the seller cashes out into a shielded note. The listing price is public. The rest of either wallet is not.

Inspired by [IDEA-12 Marketplace escrow](https://github.com/starkience/strk20-hackathon/blob/main/IDEAS.md) and IDEA-09 (pay by QR / link).

## What is private vs public

- Public: listing title, price, photo URL, that a listing was sold; shield/deposit address, token, and amount.
- Private: who paid, which notes were spent, remaining shielded balance, seller payout into a private note.
- The UI never shows a counterparty balance.

## Stack

- Next.js 16, React 19, TypeScript
- starknet.js 10 + get-starknet v6 (Wallet API; Ready wallet)
- Cairo `privacy_invoke` helper (starter echo today; GhostDeal escrow next)
- Mainnet STRK20 pool: `0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a`

Bootstrapped from the [STRK20 starter kit](https://github.com/Akashneelesh/strk20-starter-kit).

## Run locally

```bash
yarn install
cp .env.example .env.local
```

Put your [Alchemy](https://www.alchemy.com) Starknet API key in `NEXT_PUBLIC_PROVIDER_URL`. Never commit `.env.local`.

```bash
yarn dev
```

Open http://localhost:3000 and connect Ready on Mainnet or Sepolia.

## Reuse

Copy `cairo/` and the Wallet API invoke helpers (when they land in `lib/`) into another dapp. This repo is not an npm platform. The dapp must not hold viewing keys.

## License

MIT. Starter kit copyright remains with Philippe ROSTAN; GhostDeal additions are JaDi03, 2026.
