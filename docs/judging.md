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
| Shielded balances | Yes. Account Show balance asks the wallet for STRK and USDC in one consent. A token with no notes shows 0. Counterparty balances are never requested | `src/app/account/page.tsx` |
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
| Three mainnet transactions | Yes. In `strk20.json`. Each touches the pool and the helper in the same tx (not shield-only): [Pay +2 STRK](https://starkscan.co/tx/0x05a72e851872709834eacd2a66c8f0c571b98db1d3fd58b624c069413fb7bacf), [Claim or Cancel −2 STRK](https://starkscan.co/tx/0x04da2e5f3e247ecf722e7af5c0de923eb639a48008fa15628fe300235af62fc1), [Pay +10 STRK](https://starkscan.co/tx/0x011dbb7d245a7bda4d982b6102f2c6c0c2b897979388879d8d490b7c78153868) |
| Demo video | Yes. In `strk20.json`: [YouTube demo](https://youtu.be/gR9kkWwdkCc) (3 minutes) |
| Live demo URL | Yes. [https://ghost-deal.vercel.app](https://ghost-deal.vercel.app) |

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
