"use client";

import { useEffect, useState } from "react";
import { TOKEN_ICON, type Listing } from "@/data/listings";
import { lockListing } from "@/data/listingStore";
import { saveRefundSecret } from "@/data/escrowSecrets";
import { useStoreWallet } from "@/app/components/Wallet/walletContext";
import { useFrontendProvider } from "@/app/components/client/provider/providerContext";
import { myFrontendProviders } from "@/utils/constants";
import {
  commitmentHashFromSecret,
  escrowAddressForIndex,
  escrowDepositState,
  formatWei,
  isZeroAddress,
  payListingDeposit,
  poolAddressForIndex,
  poolFeeAmount,
  priceToWei,
  randomFeltSecret,
  shieldTokens,
  tokenAddressForListing,
} from "@/lib/escrow";
import { friendlyPrivateError } from "@/lib/privateWalletError";

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
  // null until a shield succeeds while a prior reading existed; Pay does not
  // request a share-balance prompt on open.
  const [shielded, setShielded] = useState<bigint | null>(null);
  const [fee, setFee] = useState<bigint | null>(null);
  const [refundKey, setRefundKey] = useState("");
  const [refundCopied, setRefundCopied] = useState(false);

  // Plain RPC read, no wallet prompt: safe on every open.
  useEffect(() => {
    let cancelled = false;
    poolFeeAmount(myFrontendProviders[providerIndex], poolAddressForIndex(providerIndex)).then((value) => {
      if (!cancelled) setFee(value);
    });
    return () => {
      cancelled = true;
    };
  }, [providerIndex]);

  useEffect(() => {
    if (!open || !account) {
      setShielded(null);
      return;
    }
    let cancelled = false;
    // Do not call strk20Balances here: wallets gate it behind a share-balance
    // prompt, and Pay does not need that consent. Reconcile on-chain in case a
    // prior deposit landed after the wallet relay timed out.
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
  const feeIsSameToken = listing.token === "STRK";
  let priceWei: bigint | null = null;
  try {
    priceWei = priceToWei(listing.price, listing.token);
  } catch {
    priceWei = null;
  }
  const feeWei = fee ?? 0n;
  // STRK listings: pool fee is deducted from the same token. USDC listings:
  // the price is USDC; the flat pool fee is still charged in STRK by the wallet.
  const neededWei = priceWei !== null ? (feeIsSameToken ? priceWei + feeWei : priceWei) : null;
  const insufficient = shielded !== null && neededWei !== null && shielded < neededWei;
  // Unknown balance (Pay does not prompt to share it) also gets the shield
  // offer: most such users simply have nothing shielded yet.
  const offerShield = account !== null && priceWei !== null && (shielded === null || insufficient);

  async function onShield() {
    setError("");
    if (!account || priceWei === null) return;
    const tokenAddr = tokenAddressForListing(listing.token, providerIndex);
    // STRK: shield price + two pool fees (shield fee + upcoming pay fee).
    // USDC: shield the price only; pool fees are paid in STRK separately.
    const amountWei = feeIsSameToken ? priceWei + 2n * feeWei : priceWei;
    setBusy(true);
    try {
      await shieldTokens({ account, token: tokenAddr, amountWei });
      // The wallet balance read can prompt again and hang; set what we know
      // landed instead of re-reading.
      setShielded((prev) => {
        if (prev === null) return null;
        return feeIsSameToken ? prev + priceWei + feeWei : prev + priceWei;
      });
    } catch (err: unknown) {
      const message = friendlyPrivateError(err, "Shield failed.");
      setError(
        /^timeout$/i.test(message)
          ? "The wallet timed out. The shield can still land; close and reopen this panel to recheck."
          : message,
      );
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
    setRefundKey(refundSecret);
    // Persist BEFORE sending: pool proofs are slow and the wallet relay can
    // time out while the deposit still lands: losing the preimage would kill
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
      // The proving relay times out routinely: before reporting failure,
      // check whether the deposit actually landed on-chain.
      const escrowAddr = escrowAddressForIndex(providerIndex);
      const state = isZeroAddress(escrowAddr) || !listing.claimHash
        ? { funded: false, closed: false }
        : await escrowDepositState(myFrontendProviders[providerIndex], escrowAddr, listing.claimHash);
      if (state.funded) {
        lockListing(listing.id, { refundHash, payTxHash: "on-chain (hash pending)" });
        setTxHash("on-chain (hash pending)");
      } else {
        setError(friendlyPrivateError(err, "Pay failed."));
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
        {error ? (
          <p className="gdAlert" role="alert">
            {error}
          </p>
        ) : null}
        {shielded !== null ? (
          <p className="gdMeta">
            Shielded balance: {formatWei(shielded, listing.token)} {listing.token}
          </p>
        ) : null}
        {offerShield ? (
          <>
            <p className="gdMeta gdOrange" style={{ marginBottom: 10 }}>
              {insufficient
                ? feeIsSameToken
                  ? `You need ${listing.price} ${listing.token} plus the pool fee to pay in private. You have ${formatWei(shielded ?? 0n, listing.token)} shielded.`
                  : `You need ${listing.price} ${listing.token} shielded to pay. You have ${formatWei(shielded ?? 0n, listing.token)} shielded.`
                : "Pay uses your shielded balance. If you have not shielded this token yet, start here."}{" "}
              {feeIsSameToken
                ? `The pool charges ${formatWei(feeWei)} STRK per private operation (shield now, pay later); the shield button below already includes both.`
                : `The pool charges ${formatWei(feeWei)} STRK per private operation. Keep some STRK available for fees; this shield only covers the USDC price.`}
            </p>
            <button type="button" className="gdBtn gdBtnGhost" onClick={onShield} disabled={busy}>
              {busy
                ? "Shielding…"
                : feeIsSameToken
                  ? `Shield ${priceWei !== null ? formatWei(priceWei + 2n * feeWei, listing.token) : listing.price} ${listing.token} (price + 2 pool fees)`
                  : `Shield ${listing.price} ${listing.token}`}
            </button>
          </>
        ) : null}
        {txHash ? <p className="gdMeta" style={{ wordBreak: "break-all" }}>Locked. {txHash}</p> : null}
        {txHash && refundKey ? (
          <div style={{ marginTop: 12, marginBottom: 12 }}>
            <p className="gdMeta" style={{ marginBottom: 6 }}>
              Refund key. Save it securely: it is the only way to cancel and get your money back.
            </p>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--gd-raised2)", border: "1px solid var(--gd-line)", borderRadius: 12, padding: "8px 12px" }}>
              <span style={{ fontFamily: "var(--font-mono-ui), monospace", fontSize: 13, color: "var(--gd-dim)", letterSpacing: "0.08em" }}>
                0x • • • • • • • •
              </span>
              <button
                type="button"
                className="gdBtn gdBtnGhost"
                style={{ padding: "4px 10px", fontSize: 12, minHeight: 0 }}
                onClick={async () => {
                  await navigator.clipboard.writeText(refundKey);
                  setRefundCopied(true);
                  setTimeout(() => setRefundCopied(false), 2000);
                }}
              >
                {refundCopied ? "✓ Copied" : "Copy key"}
              </button>
            </div>
          </div>
        ) : null}
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
