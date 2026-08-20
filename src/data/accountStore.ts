"use client";

export type GhostAccount = {
  address: string;
  createdAt: number;
};

const KEY = "ghostdeal-accounts";

function loadMap(): Record<string, GhostAccount> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, GhostAccount>) : {};
  } catch {
    return {};
  }
}

export function sameAddress(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  return a.toLowerCase() === b.toLowerCase();
}

export function ensureAccount(address: string): GhostAccount {
  const key = address.toLowerCase();
  const map = loadMap();
  const existing = map[key];
  if (existing) return existing;
  const row: GhostAccount = { address, createdAt: Date.now() };
  map[key] = row;
  localStorage.setItem(KEY, JSON.stringify(map));
  return row;
}
