"use client";

import { type Listing } from "@/data/listings";
import { fetchRemoteListings, patchRemoteListing } from "@/lib/marketplace";
import { marketplaceNetworkFromIndex, type MarketplaceNetwork } from "@/lib/marketplaceNetwork";
import { sameAddress } from "@/data/accountStore";
import { useFrontendProvider } from "@/app/components/client/provider/providerContext";

const KEY = "ghostdeal-extra-listings";
const HIDDEN_KEY = "ghostdeal-hidden-listings";
const CHANGE_EVENT = "ghostdeal-listings";

function currentNetwork(): MarketplaceNetwork {
  return marketplaceNetworkFromIndex(useFrontendProvider.getState().currentFrontendProviderIndex);
}

function extrasKey(network: MarketplaceNetwork) {
  return `${KEY}:${network}`;
}

function hiddenKey(network: MarketplaceNetwork) {
  return `${HIDDEN_KEY}:${network}`;
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function notifyListingsChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function onListingsChanged(handler: () => void) {
  window.addEventListener(CHANGE_EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(CHANGE_EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

export function loadExtraListings(): Listing[] {
  const network = currentNetwork();
  const scoped = readJson<Listing[]>(extrasKey(network), []);
  if (network !== "sepolia") return scoped;
  const legacy = readJson<Listing[]>(KEY, []);
  if (legacy.length === 0) return scoped;
  const seen = new Set(scoped.map((row) => row.id));
  return [...scoped, ...legacy.filter((row) => !seen.has(row.id))];
}

function loadHiddenIds(): string[] {
  const network = currentNetwork();
  const scoped = readJson<string[]>(hiddenKey(network), []);
  if (network !== "sepolia") return scoped;
  const legacy = readJson<string[]>(HIDDEN_KEY, []);
  return [...new Set([...scoped, ...legacy])];
}

export function saveExtraListing(listing: Listing) {
  const network = currentNetwork();
  const next = [listing, ...loadExtraListings().filter((row) => row.id !== listing.id)];
  localStorage.setItem(extrasKey(network), JSON.stringify(next));
  notifyListingsChanged();
}

export function removeListing(id: string) {
  const network = currentNetwork();
  const extras = loadExtraListings().filter((row) => row.id !== id);
  localStorage.setItem(extrasKey(network), JSON.stringify(extras));
  const hidden = new Set(loadHiddenIds());
  hidden.add(id);
  localStorage.setItem(hiddenKey(network), JSON.stringify([...hidden]));
  notifyListingsChanged();
}

const remoteCache: Partial<Record<MarketplaceNetwork, Listing[]>> = {};
let marketplaceConfigured: boolean | null = null;

function statusRank(status: Listing["status"]): number {
  if (status === "released") return 2;
  if (status === "locked") return 1;
  return 0;
}

function mergeListing(a: Listing, b: Listing): Listing {
  const [winner, other] = statusRank(a.status) >= statusRank(b.status) ? [a, b] : [b, a];
  return {
    ...other,
    ...winner,
    payTxHash: winner.payTxHash ?? other.payTxHash,
    claimTxHash: winner.claimTxHash ?? other.claimTxHash,
    refundHash: winner.refundHash ?? other.refundHash,
  };
}

export function allListings(): Listing[] {
  const network = currentNetwork();
  const hidden = new Set(loadHiddenIds());
  const byId = new Map<string, Listing>();
  for (const row of loadExtraListings()) {
    if (!hidden.has(row.id)) byId.set(row.id, row);
  }
  for (const row of remoteCache[network] ?? []) {
    if (hidden.has(row.id)) continue;
    const existing = byId.get(row.id);
    byId.set(row.id, existing ? mergeListing(existing, row) : row);
  }
  return [...byId.values()];
}

function syncRemoteListing(listing: Listing) {
  patchRemoteListing(listing, currentNetwork()).catch(() => undefined);
}

export function getMarketplaceConfigured(): boolean | null {
  return marketplaceConfigured;
}

// Pulls the shared marketplace into the cache. Failures keep the previous
// cache: a storage hiccup must not blank the marketplace view.
export async function refreshRemoteListings() {
  const network = currentNetwork();
  notifyListingsChanged();
  const { listings: rows, configured } = await fetchRemoteListings(network);
  marketplaceConfigured = configured;
  const prev = remoteCache[network] ?? [];
  if (rows.length > 0 || prev.length === 0) {
    remoteCache[network] = rows;
    notifyListingsChanged();
  } else {
    notifyListingsChanged();
  }
}

export function isOwnedBy(listing: Listing, address?: string): boolean {
  return sameAddress(listing.ownerAddress, address);
}

export function listingsOwnedBy(address?: string): Listing[] {
  if (!address) return [];
  return allListings().filter((row) => isOwnedBy(row, address));
}

export function lockListing(
  id: string,
  patch: Pick<Listing, "refundHash" | "payTxHash">,
) {
  const current = allListings().find((row) => row.id === id);
  if (!current) return;
  const next = { ...current, ...patch, status: "locked" as const };
  saveExtraListing(next);
  syncRemoteListing(next);
}

// Seller cashed out: the commitment is closed on-chain, the deal is done.
export function markListingClaimed(id: string, patch: Pick<Listing, "claimTxHash">) {
  const network = currentNetwork();
  const current =
    allListings().find((row) => row.id === id) ??
    (remoteCache[network] ?? []).find((row) => row.id === id);
  if (!current) return;
  const next = { ...current, ...patch, status: "released" as const };
  saveExtraListing(next);
  syncRemoteListing(next);
}

export function markListingClaimedByHash(claimHash: string, patch: Pick<Listing, "claimTxHash">) {
  const network = currentNetwork();
  const current =
    allListings().find((row) => row.claimHash === claimHash) ??
    (remoteCache[network] ?? []).find((row) => row.claimHash === claimHash);
  if (!current) return;
  markListingClaimed(current.id, patch);
}

// Buyer refund landed: the escrow is closed and the item can sell again.
export function reopenListing(id: string) {
  const current = allListings().find((row) => row.id === id);
  if (!current) return;
  const next = { ...current, status: "open" as const, payTxHash: undefined };
  saveExtraListing(next);
  syncRemoteListing(next);
}

export function claimOrphanListings(address: string) {
  const extras = loadExtraListings();
  let changed = false;
  const next = extras.map((row) => {
    if (!row.ownerAddress && row.id.startsWith("local-")) {
      changed = true;
      return { ...row, ownerAddress: address };
    }
    return row;
  });
  if (!changed) return;
  localStorage.setItem(extrasKey(currentNetwork()), JSON.stringify(next));
  notifyListingsChanged();
}
