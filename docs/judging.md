# For judges

GhostDeal is built for the [STRK20 Private Sprint](https://strk20.starknet.io/hackathon). Public repo: [github.com/JaDi03/GhostDeal](https://github.com/JaDi03/GhostDeal).

This page maps the repo to the four scoring criteria. Every claim points at code or data in this repo, so you can verify it instead of trusting it.

## The idea, and where it comes from

Using an idea from the list was never required. GhostDeal is its own product that takes two ideas as starting points rather than implementing either:

- **[IDEA-12 · Marketplace escrow](https://github.com/starkience/strk20-hackathon/blob/main/IDEAS.md)**: same shape: buyer pays into private escrow, seller receives a private note. Different trust design: no arbitrator and no buyer confirmation. The seller cashes out with a claim secret held since list time; the buyer cancels with a refund secret saved at pay time.
- **[IDEA-09 · Payments by identifier](https://github.com/starkience/strk20-hackathon/blob/main/IDEAS.md)**: the QR/link entry, but the listing itself is the payment target instead of a wallet address.

That is the innovation case in one line: not a new proving system, a better take on ideas the ecosystem already published.

## 30% STRK20 integration depth

How far into the stack, not how many buzzwords.

| Surface | In GhostDeal? | Where |
| --- | --- | --- |
| Shielded balances | Yes, via the user's Ready wallet. The dapp does not read or display a counterparty balance | Account shield/unshield in the PWA; Pay spends shielded notes |
| Private transfers into app logic | Yes. Pay, claim, and cancel are `strk20InvokeTransaction` batches | `src/lib/escrow.ts` |
| Anonymizer contract | Yes. Custom `privacy_invoke` escrow: Deposit, Claim, Cancel | `cairo/src/lib.cairo` |
| Private swaps | Yes. Shielded STRK ↔ USDC via AVNU's deployed executor, batched as `strk20InvokeTransaction` actions | `src/lib/avnu.ts` |
| Privacy SDK | No, on purpose. A marketplace must not hold viewing keys | Wallet API route only |
| Stealth / shadow accounts | No. A different STRK20 surface, not needed for the cash-like promise | See [Architecture](architecture.md) |

Depth here means: a real helper the pool calls, not only a shield button on a starter kit.

## 30% Working mainnet product

The bar from the rules: it runs, on mainnet, for a real user.

| Check | Status to verify before submission |
| --- | --- |
| No login wall | The PWA is public. Guests can open a listing |
| STRK20 pool on mainnet | Yes. Address in `src/utils/constants.ts` |
| GhostDeal helper on mainnet | Yes. Mainnet `0x1ad47d7b59f736383221af3847aeb737d358e0c2cce947482ca48dad6c4ca72`, Sepolia `0x2fe8c2bc2194ccdf899c0566057217a34e139c0c5e6f7931f2b24cb436a22cf` |
| Three mainnet transactions | Not yet in `strk20.json`. Use Pay, Claim, or Cancel transactions: each touches the pool and runs through our helper via `privacy_invoke` in the same tx. A shield-only deposit touches the pool but does not run through our contract |
| Demo video | Not yet. `demo_video` is a required `strk20.json` field (3 minutes) |
| Live demo URL | Yes. [https://ghost-deal.vercel.app](https://ghost-deal.vercel.app). Fill `strk20.json` `demo_url` with it |

## 25% Innovation

What the ecosystem does not have yet, or a materially better take.

**The take:** in-person crypto that feels like cash for ordinary people.

Most private-DeFi demos are swaps, lending, or "hide a transfer." GhostDeal is a neighbor selling a PC. The innovation is the product shape, not a new proving system:

- The other party never sees your wallet or remaining balance.
- Price is public (that is the deal). The rest is not.
- Escrow is a `privacy_invoke` helper, so lock and cash-out stay inside the pool.
- QR / listing link for two phones, not a DEX UI.
- Honest copy: we do not sell unlinkability against a chain observer.

## 15% Documentation and open-source quality

| Ask | Where |
| --- | --- |
| A README someone can follow | Root `README.md` |
| Docs a judge can explain in five minutes | This MkDocs site |
| Code someone can build on | `cairo/` helper + `src/lib/escrow.ts` |
| License | MIT. [LICENSE](https://github.com/JaDi03/GhostDeal/blob/main/LICENSE) includes starter kit copyright (Philippe ROSTAN, 2023) and GhostDeal (JaDi03, 2026) |
