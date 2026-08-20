"use client";

import Link from "next/link";
import type { Listing } from "@/data/listings";
import { TOKEN_ICON } from "@/data/listings";

export default function ListingCard({ listing }: { listing: Listing }) {
  return (
    <Link href={`/listing/${listing.id}`} className="gdCard">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={listing.image} alt="" />
      <div className="gdCardBody">
        <div className="gdCardTitle">{listing.title}</div>
        <div className="gdPrice">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={TOKEN_ICON[listing.token]} alt="" />
          {listing.price} {listing.token}
        </div>
        <div className="gdMeta">{listing.seller}</div>
      </div>
    </Link>
  );
}
