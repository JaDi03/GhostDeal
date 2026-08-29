"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { loadExtraListings, listingsOwnedBy, removeListing, saveExtraListing } from "@/data/listingStore";
import type { Listing, ListingToken } from "@/data/listings";
import { saveClaimSecret, getEscrowSecrets } from "@/data/escrowSecrets";
import { aliasFor } from "@/data/accountStore";
import { commitmentHashFromSecret, randomFeltSecret } from "@/lib/escrow";
import { publishRemoteListing } from "@/lib/marketplace";
import { marketplaceNetworkFromIndex } from "@/lib/marketplaceNetwork";
import { useStoreWallet } from "@/app/components/Wallet/walletContext";
import { useFrontendProvider } from "@/app/components/client/provider/providerContext";
import ConnectGate from "@/app/components/ghost/ConnectGate";

function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const max = 720;
      let width = img.width;
      let height = img.height;
      if (width > max || height > max) {
        const scale = max / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      URL.revokeObjectURL(url);
      if (!ctx) {
        reject(new Error("Canvas is not available"));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image"));
    };
    img.src = url;
  });
}

function SellForm() {
  const router = useRouter();
  const search = useSearchParams();
  const editId = search.get("edit");
  const isConnected = useStoreWallet((s) => s.isConnected);
  const address = useStoreWallet((s) => s.address);
  const providerIndex = useFrontendProvider((s) => s.currentFrontendProviderIndex);
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [token, setToken] = useState<ListingToken>("STRK");
  const [seller, setSeller] = useState("@you");
  const [blurb, setBlurb] = useState("");
  const [image, setImage] = useState("");
  const [photoError, setPhotoError] = useState("");
  const [mine, setMine] = useState<Listing[]>([]);
  // Set right after a first publish: the claim key is shown once, like a seed
  // phrase. It is the only thing that can open the payout.
  const [published, setPublished] = useState<{ id: string; secret: string; shared: boolean } | null>(null);
  const [claimCopied, setClaimCopied] = useState(false);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    setMine(listingsOwnedBy(address));
    // Prefill with the account name when set; edits keep the listing's own alias.
    const saved = address ? aliasFor(address) : "";
    if (saved) setSeller(`@${saved.replace(/^@/, "")}`);
    if (!editId || !address) return;
    const row = loadExtraListings().find((l) => l.id === editId);
    if (!row || row.ownerAddress?.toLowerCase() !== address.toLowerCase()) return;
    setTitle(row.title);
    setPrice(row.price);
    setToken(row.token);
    setSeller(row.seller);
    setBlurb(row.blurb);
    setImage(row.image.startsWith("data:") ? row.image : row.image);
  }, [address, editId, providerIndex]);

  if (!isConnected) {
    return <ConnectGate title="Sell" lead="Connect a wallet to publish. Until then you can only browse the marketplace." />;
  }

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPhotoError("");
    try {
      const dataUrl = await compressImage(file);
      setImage(dataUrl);
    } catch {
      setPhotoError("Could not use that photo. Try a JPG or PNG.");
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !price.trim() || !address) return;
    if (!image) {
      setPhotoError("Add a photo of the item.");
      return;
    }
    const id = editId && mine.some((row) => row.id === editId) ? editId : `local-${Date.now()}`;
    const existing = loadExtraListings().find((row) => row.id === id);
    const existingSecret = getEscrowSecrets(id)?.claimSecret;
    const claimSecret = existingSecret ?? randomFeltSecret();
    const claimHash = existing?.claimHash ?? commitmentHashFromSecret(claimSecret);
    const listing: Listing = {
      id,
      title: title.trim(),
      price: price.trim(),
      token,
      seller: seller.trim() || "@you",
      ownerAddress: address,
      image,
      blurb: blurb.trim(),
      status: existing?.status ?? "open",
      claimHash,
      refundHash: existing?.refundHash,
      payTxHash: existing?.payTxHash,
    };
    try {
      saveClaimSecret(id, claimSecret);
      saveExtraListing(listing);
    } catch {
      setPhotoError("Could not save on this phone. Try a smaller photo.");
      return;
    }
    let shared = Boolean(existing);
    if (!existing) {
      setPublishing(true);
      try {
        shared = await publishRemoteListing(listing, marketplaceNetworkFromIndex(providerIndex));
      } finally {
        setPublishing(false);
      }
    }
    if (existingSecret) {
      router.push(`/listing/${id}`);
      return;
    }
    setPublished({ id, secret: claimSecret, shared });
  }

  function onDeleteMine(id: string) {
    if (!window.confirm("Remove this listing from this phone?")) return;
    removeListing(id);
    setMine(listingsOwnedBy(address));
  }

  if (published) {
    return (
      <>
        <h1 className="gdH1">Published</h1>
        <p className="gdLead">Save this key somewhere safe. It is the only way to cash out.</p>
        {!published.shared ? (
          <p className="gdAlert" role="alert">
            This listing is only on this browser. The public marketplace is off until UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are set on the server (Vercel env), then publish again.
          </p>
        ) : (
          <p className="gdMeta">Anyone on this network can see the listing. The claim key stays on this browser.</p>
        )}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--gd-raised2)", border: "1px solid var(--gd-line)", borderRadius: 12, padding: "10px 14px", margin: "14px 0" }}>
          <span style={{ fontFamily: "var(--font-mono-ui), monospace", fontSize: 14, color: "var(--gd-dim)", letterSpacing: "0.08em" }}>
            0x • • • • • • • •
          </span>
          <button
            type="button"
            className="gdBtn gdBtnGhost"
            style={{ padding: "6px 12px", fontSize: 12, minHeight: 0 }}
            onClick={async () => {
              await navigator.clipboard.writeText(published.secret);
              setClaimCopied(true);
              setTimeout(() => setClaimCopied(false), 2000);
            }}
          >
            {claimCopied ? "✓ Copied" : "Copy key"}
          </button>
        </div>
        <div className="gdRow">
          <button type="button" className="gdBtn" onClick={() => router.push(`/listing/${published.id}`)}>
            View listing
          </button>
        </div>
        <p className="gdMeta" style={{ marginTop: 14 }}>
          It is stored only on this phone. If this data is wiped and you did not write the key down, nobody can
          ever claim that money.
        </p>
      </>
    );
  }

  return (
    <>
      <h1 className="gdH1">{editId ? "Edit" : "Sell"}</h1>
      <p className="gdLead">Buyers on any device see it when marketplace storage is on.</p>
      <form className="gdForm" onSubmit={onSubmit}>
        <label className="gdFilePick">
          <input type="file" accept="image/*" onChange={onPhoto} />
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt="Listing preview" />
          ) : (
            <span>Add photo</span>
          )}
        </label>
        {photoError ? <p className="gdMeta gdOrange">{photoError}</p> : null}
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Item name" required />
        <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Price" inputMode="decimal" required />
        <select value={token} onChange={(e) => setToken(e.target.value as ListingToken)}>
          <option value="STRK">STRK</option>
          <option value="USDC">USDC</option>
        </select>
        <input value={seller} onChange={(e) => setSeller(e.target.value)} placeholder="Alias" />
        <textarea value={blurb} onChange={(e) => setBlurb(e.target.value)} placeholder="Short note" rows={3} />
        <button type="submit" className="gdBtn gdBtnOrange" disabled={publishing}>
          {publishing ? "Publishing…" : editId ? "Save changes" : "Publish"}
        </button>
      </form>
      {mine.length > 0 ? (
        <>
          <h2 className="gdCardTitle" style={{ marginTop: 22 }}>
            Your listings
          </h2>
          <ul className="gdMineList">
            {mine.map((row) => (
              <li key={row.id} className="gdMineRow">
                <span>{row.title}</span>
                <button type="button" className="gdLinkBtn" onClick={() => onDeleteMine(row.id)}>
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </>
  );
}

export default function SellPage() {
  return (
    <Suspense fallback={<p className="gdLead">Loading…</p>}>
      <SellForm />
    </Suspense>
  );
}
