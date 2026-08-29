export type MarketplaceNetwork = "mainnet" | "sepolia";

export function isMarketplaceNetwork(value: unknown): value is MarketplaceNetwork {
  return value === "mainnet" || value === "sepolia";
}

export function parseMarketplaceNetwork(value: string | null): MarketplaceNetwork | null {
  return isMarketplaceNetwork(value) ? value : null;
}

export function marketplaceNetworkFromIndex(index: number): MarketplaceNetwork {
  return index === 0 ? "mainnet" : "sepolia";
}

export function marketplaceIndexFromNetwork(network: MarketplaceNetwork): number {
  return network === "mainnet" ? 0 : 2;
}

export function marketplaceNetworkLabel(network: MarketplaceNetwork): string {
  return network === "mainnet" ? "Mainnet" : "Sepolia";
}
