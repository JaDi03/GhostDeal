import { NextResponse } from "next/server";
import {
  listMarketplaceListings,
  networkFromRequest,
  redisConfigured,
  saveMarketplaceListing,
} from "@/lib/marketplaceRedis";

// Shared marketplace storage on Upstash Redis (REST, free tier). When the env
// vars are absent the API serves an empty list and rejects writes: the app
// falls back to local listings. Listings are stored per network (mainnet / sepolia).

export const dynamic = "force-dynamic";

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

export async function GET(request: Request) {
  const network = networkFromRequest(request);
  if (!network) return NextResponse.json({ listings: [] });
  if (!redisConfigured()) return NextResponse.json({ listings: [] });
  try {
    const listings = await listMarketplaceListings(network);
    return NextResponse.json({ listings });
  } catch {
    return NextResponse.json({ listings: [] });
  }
}

export async function POST(request: Request) {
  if (!redisConfigured()) return NextResponse.json({ error: "marketplace storage not configured" }, { status: 503 });
  const network = networkFromRequest(request);
  if (!network) return NextResponse.json({ error: "network required" }, { status: 400 });
  const listing = sanitize(await request.json().catch(() => null));
  if (!listing) return NextResponse.json({ error: "invalid listing" }, { status: 400 });
  try {
    await saveMarketplaceListing(network, listing);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "storage unavailable" }, { status: 502 });
  }
}
