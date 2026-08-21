"use client";

import { useState } from "react";
import { TOKEN_ICON, type Listing } from "@/data/listings";
import { lockListing } from "@/data/listingStore";
import { saveRefundSecret } from "@/data/escrowSecrets";
import { useStoreWallet } from "@/app/components/Wallet/walletContext";
import { useFrontendProvider } from "@/app/components/client/provider/providerContext";
import {
  commitmentHashFromSecret,
  escrowAddressForIndex,
  isZeroAddress,
  payListingDeposit,
  randomFeltSecret,
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

  if (!open) return null;

  const escrow = escrowAddressForIndex(providerIndex);
  const escrowReady = !isZeroAddress(escrow);

  async function onPay() {
    setError("");
    if (!account || !wallet) {
      setError("Connect a wallet first.");
      return;
    }
    setBusy(true);
    try {
      const refundSecret = randomFeltSecret();
      const refundHash = commitmentHashFromSecret(refundSecret);
      const hash = await payListingDeposit({
        listing,
        account,
        wallet,
        providerIndex,
        refundHash,
      });
      saveRefundSecret(listing.id, refundSecret);
      lockListing(listing.id, { refundHash, payTxHash: hash });
      setTxHash(hash);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Pay failed.");
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
        {error ? <p className="gdMeta">{error}</p> : null}
        {txHash ? <p className="gdMeta" style={{ wordBreak: "break-all" }}>Locked. {txHash}</p> : null}
        {!escrowReady ? (
          <p className="gdMeta">
            Escrow is not deployed on this network. Deploy cairo/ and set the address in .env.local.
          </p>
        ) : null}
        <button type="button" className="gdBtn" onClick={onPay} disabled={busy || Boolean(txHash) || !escrowReady}>
          {busy ? "Paying…" : txHash ? "Paid" : "Pay in private escrow"}
        </button>
        <button type="button" className="gdBtn gdBtnGhost" onClick={onClose} disabled={busy}>
          Close
        </button>
      </div>
    </div>
  );
}
