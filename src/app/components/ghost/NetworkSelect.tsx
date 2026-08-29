"use client";

import { useEffect } from "react";
import { useFrontendProvider } from "@/app/components/client/provider/providerContext";
import { useStoreWallet } from "@/app/components/Wallet/walletContext";
import {
  isMarketplaceNetwork,
  marketplaceIndexFromNetwork,
  marketplaceNetworkFromIndex,
  type MarketplaceNetwork,
} from "@/lib/marketplaceNetwork";

const STORAGE_KEY = "ghostdeal-browse-network";
const OPTIONS: { id: MarketplaceNetwork; label: string }[] = [
  { id: "mainnet", label: "Mainnet" },
  { id: "sepolia", label: "Sepolia" },
];

export default function NetworkSelect() {
  const isConnected = useStoreWallet((s) => s.isConnected);
  const providerIndex = useFrontendProvider((s) => s.currentFrontendProviderIndex);
  const setIndex = useFrontendProvider((s) => s.setCurrentFrontendProviderIndex);
  const current = marketplaceNetworkFromIndex(providerIndex);

  useEffect(() => {
    if (isConnected) return;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (isMarketplaceNetwork(saved)) {
        setIndex(marketplaceIndexFromNetwork(saved));
      }
    } catch {
      /* ignore quota */
    }
  }, [isConnected, setIndex]);

  useEffect(() => {
    if (!isConnected) return;
    try {
      localStorage.setItem(STORAGE_KEY, marketplaceNetworkFromIndex(providerIndex));
    } catch {
      /* ignore quota */
    }
  }, [isConnected, providerIndex]);

  function pick(network: MarketplaceNetwork) {
    if (isConnected) return;
    setIndex(marketplaceIndexFromNetwork(network));
    try {
      localStorage.setItem(STORAGE_KEY, network);
    } catch {
      /* ignore quota */
    }
  }

  return (
    <div className="gdNet" role="group" aria-label="Marketplace network">
      {OPTIONS.map((option) => (
        <button
          key={option.id}
          type="button"
          className={current === option.id ? "gdNetBtn gdNetBtnOn" : "gdNetBtn"}
          onClick={() => pick(option.id)}
          disabled={isConnected}
          aria-pressed={current === option.id}
          title={
            isConnected
              ? "Network follows the connected wallet"
              : `Show the ${option.label} marketplace`
          }
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
