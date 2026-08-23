"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import ConnectGate from "@/app/components/ghost/ConnectGate";
import { useStoreWallet } from "@/app/components/Wallet/walletContext";
import { useFrontendProvider } from "@/app/components/client/provider/providerContext";
import {
  allListings,
  isOwnedBy,
  markListingClaimed,
  onListingsChanged,
  reopenListing,
} from "@/data/listingStore";
import { getEscrowSecrets } from "@/data/escrowSecrets";
import { TOKEN_ICON, type Listing } from "@/data/listings";
import { myFrontendProviders } from "@/utils/constants";
import {
  cancelEscrowFunds,
  claimEscrowFunds,
  commitmentHashFromSecret,
  escrowAddressForIndex,
  escrowDepositState,
  isZeroAddress,
} from "@/lib/escrow";

// On-chain commitment state per claimHash; local listing status can lag behind it.
type ChainStates = Record<string, { funded: boolean; closed: boolean }>;

export default function DealsPage() {
  const isConnected = useStoreWallet((s) => s.isConnected);
  const address = useStoreWallet((s) => s.address);
  const account = useStoreWallet((s) => s.myWalletAccount);
  const wallet = useStoreWallet((s) => s.StarknetWalletObject);
  const providerIndex = useFrontendProvider((s) => s.currentFrontendProviderIndex);

  const [listings, setListings] = useState<Listing[]>([]);
  const [chain, setChain] = useState<ChainStates>({});
  const [busyId, setBusyId] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [keyMode, setKeyMode] = useState(false);
  const [keyInput, setKeyInput] = useState("");

  const escrow = escrowAddressForIndex(providerIndex);
  const escrowReady = !isZeroAddress(escrow);

  const bought = listings.filter(
    (row) => !isOwnedBy(row, address) && row.status === "locked" && Boolean(getEscrowSecrets(row.id)?.refundSecret),
  );
  const selling = listings.filter((row) => isOwnedBy(row, address) && Boolean(row.claimHash));

  const refresh = useCallback(() => {
    setListings(allListings());
  }, []);

  useEffect(() => {
    refresh();
    return onListingsChanged(refresh);
  }, [refresh]);

  // A close on a listing I own is not auto-marked released: from the seller
  // side, my claim and the buyer's cancel are indistinguishable.
  useEffect(() => {
    if (!escrowReady) return;
    let cancelled = false;
    const wanted = [...bought, ...selling].filter((row) => row.claimHash);
    wanted.forEach((row) => {
      escrowDepositState(myFrontendProviders[providerIndex], escrow, row.claimHash as string).then((state) => {
        if (cancelled) return;
        setChain((prev) => ({ ...prev, [row.claimHash as string]: state }));
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [escrowReady, providerIndex, listings.length, address]);

  // Relayed pool transactions can land minutes after the wallet call settles;
  // poll for the close instead of trusting the wallet promise.
  async function waitClosed(claimHash: string, attempts = 10, delayMs = 15000): Promise<boolean> {
    for (let i = 0; i < attempts; i++) {
      const state = await escrowDepositState(myFrontendProviders[providerIndex], escrow, claimHash);
      if (state.closed) return true;
      if (i < attempts - 1) await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    return false;
  }

  async function onClaim(listing: Listing) {
    setError("");
    setNote("");
    if (!account || !wallet) {
      setError("Connect a wallet first.");
      return;
    }
    const secrets = getEscrowSecrets(listing.id);
    if (!secrets?.claimSecret) {
      setError(`No claim secret for "${listing.title}" on this device. Cash out must run where the listing was created.`);
      return;
    }
    setBusyId(listing.id);
    try {
      const hash = await claimEscrowFunds({
        claimSecret: secrets.claimSecret,
        account,
        wallet,
        providerIndex,
      });
      markListingClaimed(listing.id, { claimTxHash: hash });
      setWaiting(true);
      setNote(`Submitted. Waiting for the chain to close the escrow… ${hash}`);
      const closed = listing.claimHash ? await waitClosed(listing.claimHash) : false;
      setNote(
        closed
          ? `Cashed out ${listing.price} ${listing.token}. ${hash}`
          : `Still open on-chain several minutes after submitting. The relayer is slow; wait and refresh before trying again. ${hash}`,
      );
    } catch (err: unknown) {
      // Proving relay timeouts are routine and the transaction may still
      // land: poll before reporting failure.
      const closed = listing.claimHash ? await waitClosed(listing.claimHash, 6) : false;
      if (closed) {
        markListingClaimed(listing.id, { claimTxHash: "on-chain (hash pending)" });
        setNote(`Cashed out on-chain (hash pending).`);
      } else {
        setError(
          (err instanceof Error ? err.message : "Cash out failed.") +
            " The escrow still shows open on-chain. If it closes by itself over the next minutes, do not claim again; refreshing picks it up.",
        );
      }
    } finally {
      setWaiting(false);
      setBusyId("");
    }
  }

  async function onCancel(listing: Listing) {
    setError("");
    setNote("");
    if (!account || !wallet) {
      setError("Connect a wallet first.");
      return;
    }
    const secrets = getEscrowSecrets(listing.id);
    if (!secrets?.refundSecret || !listing.claimHash) {
      setError(`No refund secret for "${listing.title}" on this device. Cancel must run where the payment was made.`);
      return;
    }
    setBusyId(listing.id);
    try {
      const hash = await cancelEscrowFunds({
        claimHash: listing.claimHash,
        refundSecret: secrets.refundSecret,
        account,
        wallet,
        providerIndex,
      });
      setNote(`Submitted. Waiting for the chain to close the escrow… ${hash}`);
      setWaiting(true);
      const closed = await waitClosed(listing.claimHash);
      if (closed) {
        reopenListing(listing.id);
        setNote(`Refunded to your private balance. ${hash}`);
      } else {
        setNote(
          `Still open on-chain several minutes after submitting. The relayer is slow; wait and refresh before trying again. ${hash}`,
        );
      }
    } catch (err: unknown) {
      const closed = await waitClosed(listing.claimHash, 6);
      if (closed) {
        reopenListing(listing.id);
        setNote(`Refunded on-chain (hash pending).`);
      } else {
        setError(
          (err instanceof Error ? err.message : "Cancel failed.") +
            " The escrow still shows open on-chain. If it closes by itself over the next minutes, do not send another; refreshing picks it up.",
        );
      }
    } finally {
      setWaiting(false);
      setBusyId("");
    }
  }

  // Claiming with a pasted key works on any device: whoever holds the key
  // cashes out, and the payout lands in the connected wallet's private balance.
  async function onClaimWithKey(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNote("");
    if (!account || !wallet) {
      setError("Connect a wallet first.");
      return;
    }
    const secret = keyInput.trim();
    if (!secret.startsWith("0x") || isZeroAddress(secret)) {
      setError("Paste the claim key you saved when publishing (it starts with 0x).");
      return;
    }
    const claimHash = commitmentHashFromSecret(secret);
    setBusyId("key");
    try {
      const hash = await claimEscrowFunds({ claimSecret: secret, account, wallet, providerIndex });
      setWaiting(true);
      setNote(`Submitted. Waiting for the chain to close the escrow… ${hash}`);
      const closed = await waitClosed(claimHash);
      setNote(
        closed
          ? `Cashed out. ${hash}`
          : `Still open on-chain several minutes after submitting. The relayer is slow; wait and refresh before trying again. ${hash}`,
      );
    } catch (err: unknown) {
      const closed = await waitClosed(claimHash, 6);
      if (closed) {
        setNote(`Cashed out on-chain (hash pending).`);
      } else {
        setError(
          (err instanceof Error ? err.message : "Cash out failed.") +
            " The commitment is still open on-chain, so you can retry.",
        );
      }
    } finally {
      setWaiting(false);
      setBusyId("");
    }
  }

  function statusLine(listing: Listing): string {
    if (listing.claimTxHash) return "Cashed out.";
    if (!listing.claimHash) return "No escrow yet.";
    const state = chain[listing.claimHash];
    if (!state) return "Checking escrow…";
    if (state.closed) return "Escrow closed.";
    if (state.funded) return "Paid. Locked in escrow.";
    return "Waiting for payment.";
  }

  function stateOf(listing: Listing): "funded" | "closed" | "waiting" | "unknown" {
    if (listing.claimTxHash) return "closed";
    if (!listing.claimHash) return "waiting";
    const state = chain[listing.claimHash];
    if (!state) return "unknown";
    if (state.closed) return "closed";
    return state.funded ? "funded" : "waiting";
  }

  if (!isConnected) {
    return (
      <ConnectGate
        title="Deals"
        lead="Connect a wallet to see your deals. Until then you can only browse the marketplace."
      />
    );
  }

  return (
    <>
      <h1 className="gdH1">Deals</h1>
      <p className="gdLead">
        Buyer actions for listings you paid. Seller actions for your listings. Escrow state comes straight from the
        chain.
      </p>
      {!escrowReady ? (
        <p className="gdMeta">Escrow is not deployed on this network. Deploy cairo/ and set the address in .env.local.</p>
      ) : null}
      {error ? <p className="gdMeta">{error}</p> : null}
      {note ? <p className="gdMeta" style={{ wordBreak: "break-all" }}>{note}</p> : null}

      <h2 className="gdCardTitle">As buyer</h2>
      {bought.length === 0 ? (
        <p className="gdMeta">Nothing bought yet. Pay a listing to see it here.</p>
      ) : (
        bought.map((listing) => {
          const state = stateOf(listing);
          return (
            <div key={listing.id} className="gdCard" style={{ marginBottom: 12 }}>
              <div className="gdCardBody">
                <div className="gdCardTitle">
                  <Link href={`/listing/${listing.id}`}>{listing.title}</Link>
                </div>
                <div className="gdPrice">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={TOKEN_ICON[listing.token]} alt="" />
                  {listing.price} {listing.token}
                </div>
                <p className="gdMeta">{statusLine(listing)}</p>
                {state === "funded" ? (
                  <button
                    type="button"
                    className="gdBtn gdBtnGhost"
                    onClick={() => onCancel(listing)}
                    disabled={Boolean(busyId) || !escrowReady}
                  >
                    {busyId === listing.id
                      ? waiting
                        ? "Waiting for the chain…"
                        : "Proving… can take a few minutes"
                      : "Cancel deal"}
                  </button>
                ) : null}
              </div>
            </div>
          );
        })
      )}

      <h2 className="gdCardTitle" style={{ marginTop: 22 }}>
        As seller
      </h2>
      {selling.length === 0 ? (
        <p className="gdMeta">No listings yet. Publish one from Sell to get paid here.</p>
      ) : (
        selling.map((listing) => {
          const state = stateOf(listing);
          return (
            <div key={listing.id} className="gdCard" style={{ marginBottom: 12 }}>
              <div className="gdCardBody">
                <div className="gdCardTitle">
                  <Link href={`/listing/${listing.id}`}>{listing.title}</Link>
                </div>
                <div className="gdPrice">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={TOKEN_ICON[listing.token]} alt="" />
                  {listing.price} {listing.token}
                </div>
                <p className="gdMeta">{statusLine(listing)}</p>
                {state === "funded" ? (
                  <button
                    type="button"
                    className="gdBtn gdBtnOrange"
                    onClick={() => onClaim(listing)}
                    disabled={Boolean(busyId) || !escrowReady}
                  >
                    {busyId === listing.id
                      ? waiting
                        ? "Waiting for the chain…"
                        : "Proving… can take a few minutes"
                      : "Cash out"}
                  </button>
                ) : null}
                {listing.claimTxHash ? (
                  <p className="gdMeta" style={{ wordBreak: "break-all" }}>Cashed out. {listing.claimTxHash}</p>
                ) : null}
              </div>
            </div>
          );
        })
      )}

      <div style={{ marginTop: 18 }}>
        {keyMode ? (
          <form className="gdForm" onSubmit={onClaimWithKey}>
            <input
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="Claim key (0x…)"
              aria-label="Claim key"
            />
            <button type="submit" className="gdBtn gdBtnOrange" disabled={Boolean(busyId) || !escrowReady}>
              {busyId === "key"
                ? waiting
                  ? "Waiting for the chain…"
                  : "Proving… can take a few minutes"
                : "Cash out with key"}
            </button>
          </form>
        ) : (
          <button type="button" className="gdBtn gdBtnGhost" onClick={() => setKeyMode(true)}>
            Cash out with a saved key
          </button>
        )}
        <p className="gdMeta">Works on any device: the payout goes to the private balance of the connected wallet.</p>
      </div>
    </>
  );
}
