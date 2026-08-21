"use client";

const KEY = "ghostdeal-escrow-secrets";

export type EscrowSecretRecord = {
  listingId: string;
  claimSecret?: string;
  refundSecret?: string;
};

function loadMap(): Record<string, EscrowSecretRecord> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, EscrowSecretRecord>) : {};
  } catch {
    return {};
  }
}

function saveMap(map: Record<string, EscrowSecretRecord>) {
  localStorage.setItem(KEY, JSON.stringify(map));
}

export function getEscrowSecrets(listingId: string): EscrowSecretRecord | undefined {
  return loadMap()[listingId];
}

export function saveClaimSecret(listingId: string, claimSecret: string) {
  const map = loadMap();
  map[listingId] = { ...map[listingId], listingId, claimSecret };
  saveMap(map);
}

export function saveRefundSecret(listingId: string, refundSecret: string) {
  const map = loadMap();
  map[listingId] = { ...map[listingId], listingId, refundSecret };
  saveMap(map);
}
