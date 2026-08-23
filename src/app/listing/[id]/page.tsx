"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import QRCode from "qrcode";
import { allListings, isOwnedBy, onListingsChanged, refreshRemoteListings, removeListing } from "@/data/listingStore";
import { TOKEN_ICON, type Listing } from "@/data/listings";
import PayModal from "@/app/components/ghost/PayModal";
import { deleteRemoteListing } from "@/lib/marketplace";
import { useStoreWallet } from "@/app/components/Wallet/walletContext";

function ListingBody() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const isConnected = useStoreWallet((s) => s.isConnected);
  const address = useStoreWallet((s) => s.address);
  const [listings, setListings] = useState<Listing[]>([]);
  const listing = useMemo(() => listings.find((l) => l.id === params.id), [listings, params.id]);
  const [payOpen, setPayOpen] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [origin, setOrigin] = useState("");
  const [qrSrc, setQrSrc] = useState("");

  const mine = Boolean(listing && isConnected && isOwnedBy(listing, address));
  const buyer = Boolean(listing && isConnected && !mine);

  useEffect(() => {
    const refresh = () => setListings(allListings());
    refresh();
    setOrigin(window.location.origin);
    refreshRemoteListings();
    return onListingsChanged(refresh);
  }, [search, params.id]);

  useEffect(() => {
    if (buyer && search.get("pay") === "1") setPayOpen(true);
  }, [buyer, search]);

  // Rendered locally: the pay URL never leaves the device.
  useEffect(() => {
    if (!showQr || !origin || !listing) return;
    QRCode.toDataURL(`${origin}/listing/${listing.id}?pay=1`, { width: 220, margin: 1 }).then(setQrSrc);
  }, [showQr, origin, listing]);

  if (!listing) {
    return <p className="gdLead">Listing not found.</p>;
  }

  const payUrl = origin ? `${origin}/listing/${listing.id}?pay=1` : "";

  function onDelete() {
    if (!listing) return;
    if (!window.confirm("Remove this listing from this phone?")) return;
    // Also remove it from the shared marketplace when it went there.
    if (listing.ownerAddress && address) {
      deleteRemoteListing(listing.id, address).catch(() => undefined);
    }
    removeListing(listing.id);
    router.push("/");
  }

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="gdHeroImg" src={listing.image} alt="" />
      <h1 className="gdH1" style={{ marginTop: 16 }}>
        {listing.title}
      </h1>
      <div className="gdPrice">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={TOKEN_ICON[listing.token]} alt="" />
        {listing.price} {listing.token}
      </div>
      <p className="gdMeta">{listing.seller}</p>
      <p className="gdLead">{listing.blurb}</p>

      {!isConnected ? (
        <p className="gdMeta">Connect a wallet to buy or manage this listing.</p>
      ) : null}

      {mine ? (
        <>
          <div className="gdRow">
            <Link href={`/sell?edit=${listing.id}`} className="gdBtn gdBtnGhost">
              Edit
            </Link>
            <button type="button" className="gdBtn gdBtnGhost" onClick={() => setShowQr((v) => !v)}>
              QR
            </button>
            <button
              type="button"
              className="gdBtn gdBtnGhost"
              onClick={() => navigator.clipboard.writeText(payUrl)}
            >
              Copy link
            </button>
          </div>
          {showQr && qrSrc ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="gdQr" src={qrSrc} alt="Payment QR" />
              <p className="gdMeta" style={{ wordBreak: "break-all" }}>
                {payUrl}
              </p>
            </>
          ) : null}
          <button type="button" className="gdBtn gdBtnDanger" onClick={onDelete}>
            Delete listing
          </button>
        </>
      ) : null}

      {buyer ? (
        <>
          <div className="gdRow">
            <button type="button" className="gdBtn" onClick={() => setPayOpen(true)}>
              Pay
            </button>
            <button type="button" className="gdBtn gdBtnGhost" onClick={() => setShowQr((v) => !v)}>
              QR
            </button>
            <button
              type="button"
              className="gdBtn gdBtnGhost"
              onClick={() => navigator.clipboard.writeText(payUrl)}
            >
              Copy link
            </button>
          </div>
          {showQr && qrSrc ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="gdQr" src={qrSrc} alt="Payment QR" />
              <p className="gdMeta" style={{ wordBreak: "break-all" }}>
                {payUrl}
              </p>
            </>
          ) : null}
          <PayModal listing={listing} open={payOpen} onClose={() => setPayOpen(false)} />
        </>
      ) : null}
    </>
  );
}

export default function ListingPage() {
  return (
    <Suspense fallback={<p className="gdLead">Loading listing…</p>}>
      <ListingBody />
    </Suspense>
  );
}
