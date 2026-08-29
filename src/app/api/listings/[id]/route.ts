import { NextResponse } from "next/server";
import {
  deleteMarketplaceListing,
  patchMarketplaceListing,
  networkFromRequest,
  redisConfigured,
} from "@/lib/marketplaceRedis";

// PATCH is demo-grade: Pay/Cancel/Cash out update status by listing id so
// other devices see the same catalog. DELETE still requires ownerAddress.

export const dynamic = "force-dynamic";

function isFelt(value: unknown): value is string {
  return typeof value === "string" && /^0x[0-9a-fA-F]{1,64}$/.test(value);
}

function isStatus(value: unknown): value is "open" | "locked" | "released" {
  return value === "open" || value === "locked" || value === "released";
}

function isTxNote(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 120;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!redisConfigured()) return NextResponse.json({ error: "marketplace storage not configured" }, { status: 503 });
  const network = networkFromRequest(request);
  if (!network) return NextResponse.json({ error: "network required" }, { status: 400 });
  const { id } = await params;
  if (!/^[a-z0-9-]{1,40}$/i.test(id)) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || !isStatus(body.status)) return NextResponse.json({ error: "invalid status" }, { status: 400 });
  if (body.refundHash !== undefined && !isFelt(body.refundHash)) {
    return NextResponse.json({ error: "invalid listing" }, { status: 400 });
  }
  if (body.claimTxHash !== undefined && !isTxNote(body.claimTxHash)) {
    return NextResponse.json({ error: "invalid listing" }, { status: 400 });
  }
  if (body.payTxHash !== undefined && body.payTxHash !== "" && !isTxNote(body.payTxHash) && !isFelt(body.payTxHash)) {
    return NextResponse.json({ error: "invalid listing" }, { status: 400 });
  }
  try {
    const result = await patchMarketplaceListing(network, id, {
      status: body.status,
      refundHash: typeof body.refundHash === "string" ? body.refundHash : undefined,
      payTxHash: typeof body.payTxHash === "string" ? body.payTxHash : undefined,
      claimTxHash: typeof body.claimTxHash === "string" ? body.claimTxHash : undefined,
    });
    if (result === "not_found") return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "storage unavailable" }, { status: 502 });
  }
}

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
