"use client";

export type GhostAccount = {
  address: string;
  createdAt: number;
  alias?: string;
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

export function aliasFor(address: string): string {
  return loadMap()[address.toLowerCase()]?.alias ?? "";
}

export function setAccountAlias(address: string, alias: string) {
  const key = address.toLowerCase();
  const map = loadMap();
  map[key] = { ...(map[key] ?? { address, createdAt: Date.now() }), alias };
  localStorage.setItem(KEY, JSON.stringify(map));
}
