import { ProviderInterface, RpcProvider } from "starknet";

export const addrSTRK = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";

// Frontend RPC providers, indexed. The STRK20 privacy pool lives on Mainnet (0)
// and Sepolia (2); index 1 is a spare public testnet endpoint. NEXT_PUBLIC_PROVIDER_URL
// is your Alchemy key (see .env.example).
export const myFrontendProviders: ProviderInterface[] = [
    new RpcProvider({ nodeUrl: "https://starknet-mainnet.g.alchemy.com/starknet/version/rpc/v0_10/" + process.env.NEXT_PUBLIC_PROVIDER_URL }),
    new RpcProvider({ nodeUrl: "https://starknet-testnet.public.blastapi.io/rpc/v0_7" }),
    new RpcProvider({ nodeUrl: "https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_10/" + process.env.NEXT_PUBLIC_PROVIDER_URL })];

// Frontend provider indices where the STRK20 privacy pool is available.
export const Strk20Networks: Record<number, string> = { 0: "MAINNET", 2: "SEPOLIA" };

// GhostDeal escrow helper. 0x0 until you deploy cairo/ and paste the address.
export const GhostDealEscrowMainnet = process.env.NEXT_PUBLIC_GHOSTDEAL_ESCROW_MAINNET ?? "0x0";
export const GhostDealEscrowSepolia = process.env.NEXT_PUBLIC_GHOSTDEAL_ESCROW_SEPOLIA ?? "0x0";
