"use client";

import { useEffect, useMemo, useState } from "react";
import ListingCard from "./components/ghost/ListingCard";
import { allListings, onListingsChanged, refreshRemoteListings } from "@/data/listingStore";
import { type ListingStatus } from "@/data/listings";
import { useFrontendProvider } from "@/app/components/client/provider/providerContext";
import {
  marketplaceNetworkFromIndex,
  marketplaceNetworkLabel,
} from "@/lib/marketplaceNetwork";

const FILTERS: { id: "all" | ListingStatus; label: string }[] = [
  { id: "all", label: "All" },
  { id: "open", label: "For sale" },
  { id: "locked", label: "In escrow" },
];

export default function HomePage() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const [rows, setRows] = useState<ReturnType<typeof allListings>>([]);
  const [loaded, setLoaded] = useState(false);
  const providerIndex = useFrontendProvider((s) => s.currentFrontendProviderIndex);
  const networkName = marketplaceNetworkLabel(marketplaceNetworkFromIndex(providerIndex));
  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    const refresh = () => setRows(allListings());
    refresh();
    const off = onListingsChanged(refresh);
    refreshRemoteListings().finally(() => {
      if (!cancelled) setLoaded(true);
    });
    return () => {
      cancelled = true;
      off();
    };
  }, [providerIndex]);
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
        {!loaded ? (
          <p className="gdLead">Loading listings…</p>
        ) : listings.length === 0 ? (
          <div className="gdEmpty">
            <p className="gdEmptyTitle">No listings yet</p>
            <p className="gdEmptyLead">
              {rows.length === 0
                ? `Nothing for sale on ${networkName} yet. Connect and publish from Sell.`
                : "Nothing in this filter. Try All or For sale."}
            </p>
          </div>
        ) : (
          listings.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))
        )}
      </div>
    </>
  );
}
