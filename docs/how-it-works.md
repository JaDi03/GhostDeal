# How a deal works

Same deal, two views: what you do when you meet, and what Starknet does with the payment.

## At the meetup

You found a listing nearby. You agree on a price in USDC. You do not want the seller opening an explorer and seeing the rest of your wallet.

##### What you do

<div class="gd-diagram-row" markdown="1">

<div class="gd-diagram-col" markdown="1">

<figure class="gd-role" markdown="1">
![Seller showing a listing QR on their phone](assets/seller.png)
<figcaption>Seller</figcaption>
</figure>

<div class="gd-steps">
  <div class="gd-step">1. Lists the item + QR</div>
  <div class="gd-step-arrow" aria-hidden="true"></div>
  <div class="gd-step">2. Hands over the item</div>
  <div class="gd-step-arrow" aria-hidden="true"></div>
  <div class="gd-step">3. Cashes out</div>
</div>

</div>

<div class="gd-diagram-col" markdown="1">

<figure class="gd-role" markdown="1">
![Buyer paying from their phone](assets/buyer.png)
<figcaption>Buyer</figcaption>
</figure>

<div class="gd-steps">
  <div class="gd-step">1. Meet / agree price</div>
  <div class="gd-step-arrow" aria-hidden="true"></div>
  <div class="gd-step">2. Pay the listing</div>
  <div class="gd-step-arrow" aria-hidden="true"></div>
  <div class="gd-step">3. Take the item</div>
</div>

</div>

</div>

<div class="gd-diagram-chain" markdown="1">

##### What the chain does

```mermaid
sequenceDiagram
  participant Seller
  participant Buyer
  participant App as GhostDeal
  participant Wallet as Ready wallet
  participant Pool as STRK20 pool
  participant Escrow as GhostDeal helper

  Note over Seller,App: Publish (off-chain)
  Seller->>App: create listing
  App-->>Seller: claimSecret shown once
  Note over App: listing = price + claimHash

  Note over Buyer,Pool: Shield (public by design)
  Buyer->>Wallet: deposit funds into the pool
  Wallet->>Pool: public deposit, pool fee deducted

  Note over Buyer,Escrow: Pay (private)
  Buyer->>App: Pay
  App->>Wallet: strk20InvokeTransaction
  Wallet->>Pool: withdraw price + invoke Deposit
  Pool->>Escrow: privacy_invoke(Deposit)
  Note over Escrow: locks price on claimHash, payer hidden

  Note over Seller,Buyer: In person: item changes hands

  alt Seller cash out
    Seller->>Wallet: claim with claimSecret
    Wallet->>Pool: open note + invoke Claim
    Pool->>Escrow: privacy_invoke(Claim)
    Escrow-->>Seller: private note
  else Buyer cancel
    Buyer->>Wallet: cancel with refundSecret
    Wallet->>Pool: open note + invoke Cancel
    Pool->>Escrow: privacy_invoke(Cancel)
    Escrow-->>Buyer: private note back
  end
```

</div>

1. **List.** The seller creates the listing on their phone. The app shows a claim secret once, like a backup phrase. The listing carries the price (in USDC) and a hash of that secret. No transaction yet.
2. **Pay.** The buyer opens the listing (QR or link), connects Ready, and pays the price from shielded funds. Funds lock in the GhostDeal escrow. The seller sees that it is paid, not who paid from which notes.
3. **Meet.** The item changes hands in person.
4. **Cash out.** The seller claims with the secret kept on their phone (or pasted from backup). The price lands as a private note. If the deal falls through, the buyer cancels with the refund secret saved at pay time and the listing can reopen.

Shield is public on purpose. The chain sees that someone deposited an amount. After that, Pay and cash-out run as private pool transactions. Observers see the pool move the price into escrow, not which notes were spent or who paid.

## Deal states

```mermaid
stateDiagram-v2
  [*] --> Listed: seller publishes
  Listed --> Locked: buyer pays
  Locked --> Claimed: seller cash out
  Locked --> Cancelled: buyer cancel
  Claimed --> [*]
  Cancelled --> Listed: listing can reopen
```

On chain, a commitment is either open or `closed`. Claim and cancel both close it. There is no separate "release" function on the helper: the seller already holds the claim secret from list time. The app can still show Release as a step before cash-out.

## Who touches what

| Action | Escrow function | On-chain visibility |
| --- | --- | --- |
| Publish | none | none |
| Shield | none | public deposit to the pool |
| Pay | `privacy_invoke` op `Deposit` | pool to escrow transfer, amount public, payer hidden |
| Cash out | `privacy_invoke` op `Claim` | open-note amount public, receiver hidden |
| Cancel | `privacy_invoke` op `Cancel` | same shape as claim |
| Any read | `get_commitment(claimHash)` | funded / closed, no identities |
