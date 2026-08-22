"use client";

import { useEffect, useState } from "react";
import { TOKEN_ICON, type Listing } from "@/data/listings";
import { lockListing } from "@/data/listingStore";
import { saveRefundSecret } from "@/data/escrowSecrets";
import { useStoreWallet } from "@/app/components/Wallet/walletContext";
import { useFrontendProvider } from "@/app/components/client/provider/providerContext";
import { addrSTRK, myFrontendProviders } from "@/utils/constants";
import {
  commitmentHashFromSecret,
  escrowAddressForIndex,
  escrowDepositState,
  formatWei,
  isZeroAddress,
  payListingDeposit,
  randomFeltSecret,
  shieldedBalance,
  shieldTokens,
} from "@/lib/escrow";

export default function PayModal({
  listing,
  open,
  onClose,
}: {
  listing: Listing;
  open: boolean;
  onClose: () => void;
}) {
  const account = useStoreWallet((s) => s.myWalletAccount);
  const wallet = useStoreWallet((s) => s.StarknetWalletObject);
  const providerIndex = useFrontendProvider((s) => s.currentFrontendProviderIndex);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [txHash, setTxHash] = useState(listing.payTxHash ?? "");
  // null = the wallet cannot report it (older connector); don't block Pay then.
  const [shielded, setShielded] = useState<bigint | null>(null);

  useEffect(() => {
    if (!open || !account) {
      setShielded(null);
      return;
    }
    let cancelled = false;
    shieldedBalance(account, addrSTRK).then((value) => {
      if (!cancelled) setShielded(value);
    });
    // A deposit may have landed even when the wallet call timed out — the
    // chain is the source of truth, so reconcile on open.
    const escrowAddr = escrowAddressForIndex(providerIndex);
    if (!cancelled && listing.claimHash && !isZeroAddress(escrowAddr)) {
      escrowDepositState(myFrontendProviders[providerIndex], escrowAddr, listing.claimHash).then((state) => {
        if (cancelled || !state.funded) return;
        if (!listing.payTxHash) {
          lockListing(listing.id, { refundHash: listing.refundHash ?? "0x0", payTxHash: "on-chain (hash pending)" });
        }
        if (!txHash) setTxHash(listing.payTxHash ?? "on-chain (hash pending)");
      });
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, account, providerIndex]);

  if (!open) return null;

  const escrow = escrowAddressForIndex(providerIndex);
  const escrowReady = !isZeroAddress(escrow);
  const priceWei = /^\d+$/.test(listing.price) ? BigInt(listing.price) * 10n ** 18n : null;
  const insufficient = shielded !== null && priceWei !== null && shielded < priceWei;
  // Unreadable balance (fresh wallet, wallet backend error) also gets the
  // shield offer — most such users simply have nothing shielded yet.
  const offerShield = account !== null && priceWei !== null && (shielded === null || insufficient);

  async function onShield() {
    setError("");
    if (!account || priceWei === null) return;
    setBusy(true);
    try {
      await shieldTokens({ account, token: addrSTRK, amountWei: priceWei });
      // Give the wallet a moment to reflect the deposit, then re-read.
      const value = await shieldedBalance(account, addrSTRK);
      setShielded(value);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Shield failed.");
    } finally {
      setBusy(false);
    }
  }

  async function onPay() {
    setError("");
    if (!account || !wallet) {
      setError("Connect a wallet first.");
      return;
    }
    setBusy(true);
    const refundSecret = randomFeltSecret();
    const refundHash = commitmentHashFromSecret(refundSecret);
    // Persist BEFORE sending: pool proofs are slow and the wallet relay can
    // time out while the deposit still lands — losing the preimage would kill
    // the buyer's cancel option for a payment that went through.
    saveRefundSecret(listing.id, refundSecret);
    try {
      const hash = await payListingDeposit({
        listing,
        account,
        wallet,
        providerIndex,
        refundHash,
      });
      lockListing(listing.id, { refundHash, payTxHash: hash });
      setTxHash(hash);
    } catch (err: unknown) {
      // The proving relay times out routinely — before reporting failure,
      // check whether the deposit actually landed on-chain.
      const escrowAddr = escrowAddressForIndex(providerIndex);
      const state = isZeroAddress(escrowAddr) || !listing.claimHash
        ? { funded: false, closed: false }
        : await escrowDepositState(myFrontendProviders[providerIndex], escrowAddr, listing.claimHash);
      if (state.funded) {
        lockListing(listing.id, { refundHash, payTxHash: "on-chain (hash pending)" });
        setTxHash("on-chain (hash pending)");
      } else {
        setError(err instanceof Error ? err.message : "Pay failed.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="gdModal" onClick={busy ? undefined : onClose} role="presentation">
      <div className="gdSheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="pay-title">
        <h2 id="pay-title" className="gdCardTitle">
          Pay {listing.price} {listing.token}
        </h2>
        <p className="gdLead">
          Funds lock in GhostDeal private escrow. The seller never sees the rest of your wallet.
        </p>
        <div className="gdPrice" style={{ marginBottom: 14 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={TOKEN_ICON[listing.token]} alt="" />
          {listing.price} {listing.token}
        </div>
        {shielded !== null ? (
          <p className="gdMeta">
            Shielded balance: {formatWei(shielded)} {listing.token}
          </p>
        ) : account ? (
          <p className="gdMeta">Shielded balance: this wallet could not report it.</p>
        ) : null}
        {offerShield ? (
          <>
            <p className="gdMeta gdOrange" style={{ marginBottom: 10 }}>
              {insufficient
                ? `You need ${listing.price} ${listing.token} shielded to pay in private — you have ${formatWei(shielded ?? 0n)}.`
                : "Your wallet could not report a shielded balance — if you have never shielded, start here."}{" "}
              Shield below (the deposit itself is public; only pool activity stays private).
            </p>
            <button type="button" className="gdBtn gdBtnGhost" onClick={onShield} disabled={busy}>
              {busy ? "Shielding…" : `Shield ${listing.price} ${listing.token}`}
            </button>
          </>
        ) : null}
        {error ? <p className="gdMeta">{error}</p> : null}
        {txHash ? <p className="gdMeta" style={{ wordBreak: "break-all" }}>Locked. {txHash}</p> : null}
        {!escrowReady ? (
          <p className="gdMeta">
            Escrow is not deployed on this network. Deploy cairo/ and set the address in .env.local.
          </p>
        ) : null}
        <button
          type="button"
          className="gdBtn"
          onClick={onPay}
          disabled={busy || Boolean(txHash) || !escrowReady || insufficient}
        >
          {busy ? "Proving… can take a few minutes" : txHash ? "Paid" : "Pay in private escrow"}
        </button>
        <button type="button" className="gdBtn gdBtnGhost" onClick={onClose} disabled={busy}>
          Close
        </button>
      </div>
    </div>
  );
}
