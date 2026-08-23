import { NextResponse } from "next/server";

// Demo-grade ownership check: the caller must present the owner address the
// listing was published with. Not real authentication, but enough friction
// for a marketplace demo.

export const dynamic = "force-dynamic";

const IDS_KEY = "gd:ids";
const itemKey = (id: string) => `gd:l:${id}`;

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

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const call = redis();
  if (!call) return NextResponse.json({ error: "marketplace storage not configured" }, { status: 503 });
  const { id } = await params;
  if (!/^[a-z0-9-]{1,40}$/i.test(id)) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  const body = (await request.json().catch(() => null)) as { ownerAddress?: string } | null;
  if (!body?.ownerAddress) return NextResponse.json({ error: "ownerAddress required" }, { status: 400 });
  try {
    const res = await call([["get", itemKey(id)]]);
    const stored = (res.result as (string | null)[])[0];
    if (!stored) return NextResponse.json({ error: "not found" }, { status: 404 });
    const listing = JSON.parse(stored) as { ownerAddress?: string };
    if (
      !listing.ownerAddress ||
      listing.ownerAddress.toLowerCase() !== body.ownerAddress.toLowerCase()
    ) {
      return NextResponse.json({ error: "not the owner" }, { status: 403 });
    }
    await call([
      ["del", itemKey(id)],
      ["lrem", IDS_KEY, "1", id],
    ]);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "storage unavailable" }, { status: 502 });
  }
}
