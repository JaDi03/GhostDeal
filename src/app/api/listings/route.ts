import { NextResponse } from "next/server";

// Shared marketplace storage on Upstash Redis (REST, free tier). When the env
// vars are absent the API serves an empty list and rejects writes: the app
// falls back to local listings plus the shipped demo seeds.

export const dynamic = "force-dynamic";

const IDS_KEY = "gd:ids";
const itemKey = (id: string) => `gd:l:${id}`;
const MAX_LISTINGS = 200;

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

function isFelt(value: unknown): value is string {
  return typeof value === "string" && /^0x[0-9a-fA-F]{1,64}$/.test(value);
}

// Only public-by-design data is accepted; status is forced to open and any
// transaction fields are dropped. Sizes are capped to bound storage abuse.
function sanitize(raw: unknown): { id: string; title: string; price: string; token: "STRK" | "USDC"; seller: string; ownerAddress?: string; image: string; blurb: string; claimHash?: string } | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || !/^[a-z0-9-]{1,40}$/i.test(r.id)) return null;
  if (typeof r.title !== "string" || !r.title.trim() || r.title.length > 80) return null;
  if (typeof r.price !== "string" || !/^\d{1,6}$/.test(r.price)) return null;
  if (r.token !== "STRK" && r.token !== "USDC") return null;
  if (typeof r.seller !== "string" || r.seller.length > 30) return null;
  if (typeof r.blurb !== "string" || r.blurb.length > 300) return null;
  if (typeof r.image !== "string" || r.image.length > 400_000) return null;
  if (!r.image.startsWith("data:image/") && !r.image.startsWith("/")) return null;
  if (r.ownerAddress !== undefined && !isFelt(r.ownerAddress)) return null;
  if (r.claimHash !== undefined && !isFelt(r.claimHash)) return null;
  return {
    id: r.id,
    title: r.title.trim(),
    price: r.price,
    token: r.token,
    seller: r.seller,
    ownerAddress: typeof r.ownerAddress === "string" ? r.ownerAddress : undefined,
    image: r.image,
    blurb: r.blurb,
    claimHash: typeof r.claimHash === "string" ? r.claimHash : undefined,
  };
}

export async function GET() {
  const call = redis();
  if (!call) return NextResponse.json({ listings: [] });
  try {
    const idsRes = await call([["lrange", IDS_KEY, "0", "-1"]]);
    const ids = (idsRes.result as string[][])[0] ?? [];
    if (ids.length === 0) return NextResponse.json({ listings: [] });
    const itemsRes = await call([["mget", ...ids.map(itemKey)]]);
    const rows = ((itemsRes.result as (string | null)[][])[0] ?? [])
      .filter((v): v is string => Boolean(v))
      .map((v) => JSON.parse(v))
      .filter(Boolean);
    return NextResponse.json({ listings: rows });
  } catch {
    return NextResponse.json({ listings: [] });
  }
}

export async function POST(request: Request) {
  const call = redis();
  if (!call) return NextResponse.json({ error: "marketplace storage not configured" }, { status: 503 });
  const listing = sanitize(await request.json().catch(() => null));
  if (!listing) return NextResponse.json({ error: "invalid listing" }, { status: 400 });
  try {
    await call([
      ["set", itemKey(listing.id), JSON.stringify({ ...listing, status: "open" })],
      ["lpush", IDS_KEY, listing.id],
      ["ltrim", IDS_KEY, "0", String(MAX_LISTINGS - 1)],
    ]);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "storage unavailable" }, { status: 502 });
  }
}
