import { ProviderInterface, RpcProvider } from "starknet";

export const addrSTRK = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";

// Frontend RPC providers, indexed. The STRK20 privacy pool lives on Mainnet (0)
// and Sepolia (2); index 1 is a spare public testnet endpoint. Sepolia uses a
// keyless public RPC. Mainnet still uses Alchemy: the key ships in the client
// bundle, so replace with a public endpoint or a server proxy before a mainnet demo.
export const myFrontendProviders: ProviderInterface[] = [
    new RpcProvider({ nodeUrl: "https://starknet-mainnet.g.alchemy.com/starknet/version/rpc/v0_10/" + process.env.NEXT_PUBLIC_PROVIDER_URL }),
    new RpcProvider({ nodeUrl: "https://starknet-testnet.public.blastapi.io/rpc/v0_7" }),
    new RpcProvider({ nodeUrl: "https://starknet-sepolia.drpc.org" })];

// Frontend provider indices where the STRK20 privacy pool is available.
export const Strk20Networks: Record<number, string> = { 0: "MAINNET", 2: "SEPOLIA" };

// GhostDeal escrow helper. Mainnet fallback is the 2026-08-28 deploy (public on-chain).
export const GhostDealEscrowMainnet =
  process.env.NEXT_PUBLIC_GHOSTDEAL_ESCROW_MAINNET ??
  "0x1ad47d7b59f736383221af3847aeb737d358e0c2cce947482ca48dad6c4ca72";
export const GhostDealEscrowSepolia = process.env.NEXT_PUBLIC_GHOSTDEAL_ESCROW_SEPOLIA ?? "0x0";

// STRK20 privacy pool per network. Sepolia verified on-chain; mainnet from the
// README, verify at deploy time.
export const Strk20PoolSepolia = "0x0254a6b2997ef52e9f830ce1f543f6b29768295e8d17e2267d672c552cfe0d91";
export const Strk20PoolMainnet = "0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a";
