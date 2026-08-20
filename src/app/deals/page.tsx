"use client";

import ConnectGate from "@/app/components/ghost/ConnectGate";
import { useStoreWallet } from "@/app/components/Wallet/walletContext";
import { listingsOwnedBy } from "@/data/listingStore";

export default function DealsPage() {
  const isConnected = useStoreWallet((s) => s.isConnected);
  const address = useStoreWallet((s) => s.address);
  const selling = isConnected && listingsOwnedBy(address).length > 0;

  if (!isConnected) {
    return (
      <ConnectGate
        title="Deals"
        lead="Connect a wallet to see your deals. Until then you can only browse the marketplace."
      />
    );
  }

  return (
    <>
      <h1 className="gdH1">Deals</h1>
      <p className="gdLead">Buyer actions for listings you paid. Seller actions if you have open listings. Escrow is not on-chain yet.</p>
      <h2 className="gdCardTitle">As buyer</h2>
      <button type="button" className="gdBtn" disabled>
        Release
      </button>
      <div className="gdRow">
        <button type="button" className="gdBtn gdBtnGhost" disabled>
          Cancel deal
        </button>
      </div>
      {selling ? (
        <>
          <h2 className="gdCardTitle" style={{ marginTop: 22 }}>
            As seller
          </h2>
          <button type="button" className="gdBtn gdBtnOrange" disabled>
            Cash out
          </button>
        </>
      ) : null}
    </>
  );
}
