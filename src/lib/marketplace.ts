import type { Listing } from "@/data/listings";
import type { MarketplaceNetwork } from "@/lib/marketplaceNetwork";

export type RemoteListingsResult = { listings: Listing[]; configured: boolean };

// Shared marketplace on the app's own API (Upstash via /api/listings).
export async function fetchRemoteListings(network: MarketplaceNetwork): Promise<RemoteListingsResult> {
  try {
    const res = await fetch(`/api/listings?network=${network}`, { cache: "no-store" });
    if (!res.ok) return { listings: [], configured: false };
    const data = (await res.json()) as { listings?: Listing[]; configured?: boolean };
    return {
      listings: Array.isArray(data.listings) ? data.listings : [],
      configured: data.configured === true,
    };
  } catch {
    return { listings: [], configured: false };
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

export async function patchRemoteListing(listing: Listing, network: MarketplaceNetwork): Promise<boolean> {
  try {
    const res = await fetch(`/api/listings/${listing.id}?network=${network}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: listing.status,
        refundHash: listing.refundHash,
        payTxHash: listing.payTxHash ?? "",
        claimTxHash: listing.claimTxHash,
      }),
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
