import type { Listing } from "@/data/listings";

// Shared marketplace on the app's own API. Best-effort by design: any failure
// degrades to the local-only view and never blocks publishing or paying.
export async function fetchRemoteListings(): Promise<Listing[]> {
  try {
    const res = await fetch("/api/listings", { cache: "no-store" });
    if (!res.ok) return [];
    const data = (await res.json()) as { listings?: Listing[] };
    return Array.isArray(data.listings) ? data.listings : [];
  } catch {
    return [];
  }
}

export async function publishRemoteListing(listing: Listing): Promise<boolean> {
  try {
    const res = await fetch("/api/listings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(listing),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function deleteRemoteListing(id: string, ownerAddress: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/listings/${id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ownerAddress }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
