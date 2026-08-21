"use client";

import { useEffect, useMemo, useState } from "react";
import ListingCard from "./components/ghost/ListingCard";
import { allListings, onListingsChanged } from "@/data/listingStore";
import { type ListingStatus } from "@/data/listings";

const FILTERS: { id: "all" | ListingStatus; label: string }[] = [
  { id: "all", label: "All" },
  { id: "open", label: "For sale" },
  { id: "locked", label: "In escrow" },
];

export default function HomePage() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const [rows, setRows] = useState<ReturnType<typeof allListings>>([]);
  useEffect(() => {
    const refresh = () => setRows(allListings());
    refresh();
    return onListingsChanged(refresh);
  }, []);
  const listings = useMemo(() => {
    if (filter === "all") return rows;
    return rows.filter((l) => l.status === filter);
  }, [filter, rows]);

  return (
    <>
      <p className="gdLead" style={{ letterSpacing: "0.28em", textTransform: "uppercase", fontSize: 11, color: "var(--gd-faint)" }}>
        <b className="gdOrange">◢</b> P2P marketplace
      </p>
      <h1 className="gdH1">
        Buy and sell.
        <br />
        <span className="gdOrange">Hide the rest.</span>
      </h1>
      <p className="gdLead">Pay in person. The other side never sees your balance.</p>
      <div className="gdChips">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={filter === f.id ? "gdChip gdChipOn" : "gdChip"}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="gdGrid">
        {listings.length === 0 ? (
          <p className="gdLead">No listings yet. Connect and publish from Sell.</p>
        ) : (
          listings.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))
        )}
      </div>
    </>
  );
}
