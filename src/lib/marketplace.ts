import type { Listing } from "@/data/listings";
import type { MarketplaceNetwork } from "@/lib/marketplaceNetwork";

// Shared marketplace on the app's own API. Best-effort by design: any failure
// degrades to the local-only view and never blocks publishing or paying.
export async function fetchRemoteListings(network: MarketplaceNetwork): Promise<Listing[]> {
  try {
    const res = await fetch(`/api/listings?network=${network}`, { cache: "no-store" });
    if (!res.ok) return [];
    const data = (await res.json()) as { listings?: Listing[] };
    return Array.isArray(data.listings) ? data.listings : [];
  } catch {
    return [];
  }
}

export async function publishRemoteListing(listing: Listing, network: MarketplaceNetwork): Promise<boolean> {
  try {
    const res = await fetch(`/api/listings?network=${network}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(listing),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function deleteRemoteListing(
  id: string,
  ownerAddress: string,
  network: MarketplaceNetwork,
): Promise<boolean> {
  try {
    const res = await fetch(`/api/listings/${id}?network=${network}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ownerAddress }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
