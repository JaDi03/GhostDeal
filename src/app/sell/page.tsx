"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { loadExtraListings, listingsOwnedBy, removeListing, saveExtraListing } from "@/data/listingStore";
import type { Listing, ListingToken } from "@/data/listings";
import { useStoreWallet } from "@/app/components/Wallet/walletContext";
import ConnectGate from "@/app/components/ghost/ConnectGate";

const FALLBACK_IMAGE = "/listings/bike.svg";

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
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [token, setToken] = useState<ListingToken>("STRK");
  const [seller, setSeller] = useState("@you");
  const [blurb, setBlurb] = useState("");
  const [image, setImage] = useState("");
  const [photoError, setPhotoError] = useState("");
  const [mine, setMine] = useState<Listing[]>([]);

  useEffect(() => {
    setMine(listingsOwnedBy(address));
    if (!editId || !address) return;
    const row = loadExtraListings().find((l) => l.id === editId);
    if (!row || row.ownerAddress?.toLowerCase() !== address.toLowerCase()) return;
    setTitle(row.title);
    setPrice(row.price);
    setToken(row.token);
    setSeller(row.seller);
    setBlurb(row.blurb);
    setImage(row.image.startsWith("data:") ? row.image : row.image);
  }, [address, editId]);

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

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !price.trim() || !address) return;
    const id = editId && mine.some((row) => row.id === editId) ? editId : `local-${Date.now()}`;
    try {
      saveExtraListing({
        id,
        title: title.trim(),
        price: price.trim(),
        token,
        seller: seller.trim() || "@you",
        ownerAddress: address,
        image: image || FALLBACK_IMAGE,
        blurb: blurb.trim() || "Listed from this phone.",
        status: "open",
      });
    } catch {
      setPhotoError("Could not save on this phone. Try a smaller photo.");
      return;
    }
    router.push(`/listing/${id}`);
  }

  function onDeleteMine(id: string) {
    if (!window.confirm("Remove this listing from this phone?")) return;
    removeListing(id);
    setMine(listingsOwnedBy(address));
  }

  return (
    <>
      <h1 className="gdH1">{editId ? "Edit" : "Sell"}</h1>
      <p className="gdLead">Saved on this phone until escrow is live.</p>
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
        <button type="submit" className="gdBtn gdBtnOrange">
          {editId ? "Save changes" : "Publish"}
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
