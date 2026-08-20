"use client";

import { SEED_LISTINGS, type Listing } from "@/data/listings";
import { sameAddress } from "@/data/accountStore";

const KEY = "ghostdeal-extra-listings";
const HIDDEN_KEY = "ghostdeal-hidden-listings";
const CHANGE_EVENT = "ghostdeal-listings";

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
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Listing[]) : [];
  } catch {
    return [];
  }
}

function loadHiddenIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(HIDDEN_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function saveExtraListing(listing: Listing) {
  const next = [listing, ...loadExtraListings().filter((row) => row.id !== listing.id)];
  localStorage.setItem(KEY, JSON.stringify(next));
  notifyListingsChanged();
}

export function removeListing(id: string) {
  const extras = loadExtraListings().filter((row) => row.id !== id);
  localStorage.setItem(KEY, JSON.stringify(extras));
  const hidden = new Set(loadHiddenIds());
  hidden.add(id);
  localStorage.setItem(HIDDEN_KEY, JSON.stringify([...hidden]));
  notifyListingsChanged();
}

export function allListings(): Listing[] {
  const extras = loadExtraListings();
  const hidden = new Set(loadHiddenIds());
  const ids = new Set(extras.map((l) => l.id));
  return [...extras, ...SEED_LISTINGS.filter((l) => !ids.has(l.id))].filter((l) => !hidden.has(l.id));
}

export function isOwnedBy(listing: Listing, address?: string): boolean {
  return sameAddress(listing.ownerAddress, address);
}

export function listingsOwnedBy(address?: string): Listing[] {
  if (!address) return [];
  return allListings().filter((row) => isOwnedBy(row, address));
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
  localStorage.setItem(KEY, JSON.stringify(next));
  notifyListingsChanged();
}
