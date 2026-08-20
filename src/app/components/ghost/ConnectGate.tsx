"use client";

import { useStoreWallet } from "@/app/components/Wallet/walletContext";

export default function ConnectGate({
  title,
  lead,
}: {
  title: string;
  lead: string;
}) {
  const isConnected = useStoreWallet((s) => s.isConnected);

  if (isConnected) return null;

  return (
    <>
      <h1 className="gdH1">{title}</h1>
      <p className="gdLead">{lead}</p>
      <p className="gdMeta">Use Connect in the header.</p>
    </>
  );
}
