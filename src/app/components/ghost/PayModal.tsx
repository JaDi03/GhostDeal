"use client";

import { TOKEN_ICON, type Listing } from "@/data/listings";

export default function PayModal({
  listing,
  open,
  onClose,
}: {
  listing: Listing;
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="gdModal" onClick={onClose} role="presentation">
      <div className="gdSheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="pay-title">
        <h2 id="pay-title" className="gdCardTitle">
          Pay {listing.price} {listing.token}
        </h2>
        <p className="gdLead">
          Funds will lock in private escrow. The seller never sees the rest of your
          wallet. On-chain escrow ships next; this step only confirms the UI.
        </p>
        <div className="gdPrice" style={{ marginBottom: 14 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={TOKEN_ICON[listing.token]} alt="" />
          {listing.price} {listing.token}
        </div>
        <button type="button" className="gdBtn" onClick={onClose}>
          Got it
        </button>
      </div>
    </div>
  );
}
