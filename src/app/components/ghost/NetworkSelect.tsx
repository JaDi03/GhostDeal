"use client";

import { useEffect } from "react";
import { useFrontendProvider } from "@/app/components/client/provider/providerContext";
import { useStoreWallet } from "@/app/components/Wallet/walletContext";
import {
  isMarketplaceNetwork,
  marketplaceIndexFromNetwork,
  marketplaceNetworkFromIndex,
  marketplaceNetworkLabel,
  type MarketplaceNetwork,
} from "@/lib/marketplaceNetwork";

const STORAGE_KEY = "ghostdeal-browse-network";

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

  function toggle() {
    const next: MarketplaceNetwork = current === "mainnet" ? "sepolia" : "mainnet";
    pick(next);
  }

  const label = marketplaceNetworkLabel(current);
  const nextLabel = marketplaceNetworkLabel(current === "mainnet" ? "sepolia" : "mainnet");

  return (
    <button
      type="button"
      className="gdNet"
      onClick={toggle}
      disabled={isConnected}
      aria-label={
        isConnected ? `Network ${label}` : `Network ${label}. Tap to switch to ${nextLabel}`
      }
      title={
        isConnected
          ? "Network follows the connected wallet"
          : `Switch to ${nextLabel}`
      }
    >
      {label}
    </button>
  );
}
