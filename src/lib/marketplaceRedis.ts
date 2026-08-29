import { parseMarketplaceNetwork, type MarketplaceNetwork } from "@/lib/marketplaceNetwork";

const MAX_LISTINGS = 200;
const LEGACY_IDS_KEY = "gd:ids";
const legacyItemKey = (id: string) => `gd:l:${id}`;
const idsKey = (network: MarketplaceNetwork) => `gd:ids:${network}`;
const itemKey = (network: MarketplaceNetwork, id: string) => `gd:l:${network}:${id}`;

type RedisCall = (body: unknown) => Promise<{ result: unknown }>;

function redis(): RedisCall | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return async (body) => {
    const commands = Array.isArray(body) ? body : [];
    const pipeline = commands.length > 0 && Array.isArray(commands[0]);
    const endpoint = pipeline ? `${url.replace(/\/$/, "")}/pipeline` : url;
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`redis ${res.status}`);
    const json = await res.json();
    if (pipeline) {
      return { result: (json as { result: unknown }[]).map((row) => row.result) };
    }
    return json as { result: unknown };
  };
}

export function redisConfigured(): boolean {
  return redis() !== null;
}

export function networkFromRequest(request: Request): MarketplaceNetwork | null {
  return parseMarketplaceNetwork(new URL(request.url).searchParams.get("network"));
}

async function listIds(call: RedisCall, key: string): Promise<string[]> {
  const idsRes = await call([["lrange", key, "0", "-1"]]);
  return (idsRes.result as string[][])[0] ?? [];
}

async function mgetJson(call: RedisCall, keys: string[]): Promise<unknown[]> {
  if (keys.length === 0) return [];
  const itemsRes = await call([["mget", ...keys]]);
  return ((itemsRes.result as (string | null)[][])[0] ?? [])
    .filter((v): v is string => Boolean(v))
    .map((v) => JSON.parse(v))
    .filter(Boolean);
}

export async function listMarketplaceListings(network: MarketplaceNetwork): Promise<unknown[]> {
  const call = redis();
  if (!call) return [];
  const scopedIds = await listIds(call, idsKey(network));
  const scoped = await mgetJson(call, scopedIds.map((id) => itemKey(network, id)));
  if (network !== "sepolia") return scoped;
  const legacyIds = await listIds(call, LEGACY_IDS_KEY);
  const seen = new Set(scopedIds);
  const leftover = legacyIds.filter((id) => !seen.has(id));
  const legacy = await mgetJson(call, leftover.map(legacyItemKey));
  return [...scoped, ...legacy];
}

export async function saveMarketplaceListing(
  network: MarketplaceNetwork,
  listing: Record<string, unknown>,
): Promise<void> {
  const call = redis();
  if (!call) throw new Error("marketplace storage not configured");
  await call([
    ["set", itemKey(network, String(listing.id)), JSON.stringify({ ...listing, status: "open" })],
    ["lpush", idsKey(network), listing.id],
    ["ltrim", idsKey(network), "0", String(MAX_LISTINGS - 1)],
  ]);
}

export type ListingStatusPatch = {
  status: "open" | "locked" | "released";
  refundHash?: string;
  payTxHash?: string;
  claimTxHash?: string;
};

async function loadStoredListing(
  call: RedisCall,
  network: MarketplaceNetwork,
  id: string,
): Promise<{ raw: string; usedLegacy: boolean } | null> {
  const scopedRes = await call([["get", itemKey(network, id)]]);
  let stored = (scopedRes.result as (string | null)[])[0];
  let usedLegacy = false;
  if (!stored && network === "sepolia") {
    const legacyRes = await call([["get", legacyItemKey(id)]]);
    stored = (legacyRes.result as (string | null)[])[0];
    usedLegacy = Boolean(stored);
  }
  if (!stored) return null;
  return { raw: stored, usedLegacy };
}

// Pay / cash-out / cancel: keep the shared catalog in line with this device.
export async function patchMarketplaceListing(
  network: MarketplaceNetwork,
  id: string,
  patch: ListingStatusPatch,
): Promise<"ok" | "not_found"> {
  const call = redis();
  if (!call) throw new Error("marketplace storage not configured");
  const stored = await loadStoredListing(call, network, id);
  if (!stored) return "not_found";
  const listing = JSON.parse(stored.raw) as Record<string, unknown>;
  listing.status = patch.status;
  if (patch.refundHash !== undefined) listing.refundHash = patch.refundHash;
  if (patch.claimTxHash !== undefined) listing.claimTxHash = patch.claimTxHash;
  if (patch.payTxHash !== undefined) {
    if (patch.payTxHash) listing.payTxHash = patch.payTxHash;
    else delete listing.payTxHash;
  }
  const body = JSON.stringify(listing);
  const commands: unknown[] = [["set", itemKey(network, id), body]];
  if (stored.usedLegacy) commands.push(["set", legacyItemKey(id), body]);
  await call(commands);
  return "ok";
}

export async function deleteMarketplaceListing(
  network: MarketplaceNetwork,
  id: string,
  ownerAddress: string,
): Promise<"ok" | "not_found" | "forbidden"> {
  const call = redis();
  if (!call) throw new Error("marketplace storage not configured");
  const scopedRes = await call([["get", itemKey(network, id)]]);
  let stored = (scopedRes.result as (string | null)[])[0];
  let usedLegacy = false;
  if (!stored && network === "sepolia") {
    const legacyRes = await call([["get", legacyItemKey(id)]]);
    stored = (legacyRes.result as (string | null)[])[0];
    usedLegacy = Boolean(stored);
  }
  if (!stored) return "not_found";
  const listing = JSON.parse(stored) as { ownerAddress?: string };
  if (!listing.ownerAddress || listing.ownerAddress.toLowerCase() !== ownerAddress.toLowerCase()) {
    return "forbidden";
  }
  const commands: unknown[] = [
    ["del", itemKey(network, id)],
    ["lrem", idsKey(network), "1", id],
  ];
  if (usedLegacy || network === "sepolia") {
    commands.push(["del", legacyItemKey(id)], ["lrem", LEGACY_IDS_KEY, "1", id]);
  }
  await call(commands);
  return "ok";
}
