import { NextResponse } from "next/server";
import {
  deleteMarketplaceListing,
  networkFromRequest,
  redisConfigured,
} from "@/lib/marketplaceRedis";

// Demo-grade ownership check: the caller must present the owner address the
// listing was published with. Not real authentication, but enough friction
// for a marketplace demo.

export const dynamic = "force-dynamic";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!redisConfigured()) return NextResponse.json({ error: "marketplace storage not configured" }, { status: 503 });
  const network = networkFromRequest(request);
  if (!network) return NextResponse.json({ error: "network required" }, { status: 400 });
  const { id } = await params;
  if (!/^[a-z0-9-]{1,40}$/i.test(id)) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  const body = (await request.json().catch(() => null)) as { ownerAddress?: string } | null;
  if (!body?.ownerAddress) return NextResponse.json({ error: "ownerAddress required" }, { status: 400 });
  try {
    const result = await deleteMarketplaceListing(network, id, body.ownerAddress);
    if (result === "not_found") return NextResponse.json({ error: "not found" }, { status: 404 });
    if (result === "forbidden") return NextResponse.json({ error: "not the owner" }, { status: 403 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "storage unavailable" }, { status: 502 });
  }
}
