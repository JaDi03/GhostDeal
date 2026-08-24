# For judges

GhostDeal is built for the [STRK20 Private Sprint](https://strk20.starknet.io/hackathon). Inspired by [IDEA-12 Marketplace escrow](https://github.com/starkience/strk20-hackathon/blob/main/IDEAS.md) and IDEA-09 (pay by QR / link).

Public repo: [github.com/JaDi03/GhostDeal](https://github.com/JaDi03/GhostDeal).

This page is the scoring map. Claims stay inside what the repo actually ships.

## 30% STRK20 integration depth

How far into the stack, not how many buzzwords.

| Surface | In GhostDeal? | Where |
| --- | --- | --- |
| Shielded balances | Yes, via the user's Ready wallet. The dapp does not read or display a counterparty balance | Account shield/unshield in the PWA; Pay spends shielded notes |
| Private transfers into app logic | Yes. Pay, claim, and cancel are `strk20InvokeTransaction` batches | `src/lib/escrow.ts` |
| Anonymizer contract | Yes. Custom `privacy_invoke` escrow: Deposit, Claim, Cancel | `cairo/src/lib.cairo` |
| Privacy SDK | No, on purpose. A marketplace must not hold viewing keys | Wallet API route only |
| Stealth / shadow accounts | No. Different STRK20 surface, Wallet API route still pending in current docs. Not required for the cash-like promise | See [Architecture](architecture.md) |

Depth here means: a real helper the pool calls, not only a shield button on a starter kit.

## 30% Working mainnet product

The bar: it runs, on mainnet, for a real user. Not a prototype behind a login.

| Check | Status to verify before submission |
| --- | --- |
| No login wall | The PWA is public. Guest can open a listing |
| STRK20 pool on mainnet | Yes. Address in `src/utils/constants.ts` |
| GhostDeal helper on mainnet | Only when `NEXT_PUBLIC_GHOSTDEAL_ESCROW_MAINNET` is not `0x0` and Pay lands on that contract |
| Three txs that emit from **our** helper | Fill `strk20.json` `contracts` and `transactions` only with those txs |
| Live demo URL | Fill `strk20.json` `demo_url` when the public deploy is the judged build |

Until the mainnet helper is deployed and wired, call the live app what it is: a working PWA on the STRK20 pool, with escrow on the network that has a non-zero address. Do not list `contracts` in `strk20.json` without mainnet txs from those contracts.

## 25% Innovation

What the ecosystem does not have yet, or a materially better take.

**The take:** in-person crypto that feels like cash for ordinary people.

Most private-DeFi demos are swaps, lending, or "hide a transfer." GhostDeal is a neighbor selling a PC. The innovation is the product shape, not a new proving system:

- The other party never sees your wallet or remaining balance.
- Price is public (that is the deal). The rest is not.
- Escrow is a `privacy_invoke` helper, so lock and cash-out stay inside the pool.
- QR / listing link for two phones, not a DEX UI.
- Honest copy: we do not sell unlinkability against a chain observer.

That is a better take on marketplace escrow (IDEA-12) plus pay-by-QR (IDEA-09), aimed at people who already meet in person.

## 15% Documentation and open-source quality

| Ask | Where |
| --- | --- |
| A README someone can follow | Root `README.md` |
| Docs a judge can explain in five minutes | This MkDocs site |
| Code someone can build on | `cairo/` helper + `src/lib/escrow.ts` |
| License | MIT. [LICENSE](https://github.com/JaDi03/GhostDeal/blob/main/LICENSE) includes starter kit copyright (Philippe ROSTAN, 2023) and GhostDeal (JaDi03, 2026) |

Preview docs locally with `pip install -r requirements-docs.txt` and `mkdocs serve`.
