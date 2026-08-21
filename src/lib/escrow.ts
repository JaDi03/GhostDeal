import {
  compareVersions,
  hash,
  shortString,
  walletV6,
  type STRK20_ACTION,
  type WalletAccountV6,
} from "starknet";
import type { WalletWithStarknetFeatures } from "@starknet-io/get-starknet-wallet-standard/features";
import { addrSTRK, GhostDealEscrowMainnet, GhostDealEscrowSepolia, Strk20Networks } from "@/utils/constants";
import type { Listing } from "@/data/listings";

export const ESCROW_COMMITMENT_TAG = "ESCROW_COMMITMENT_TAG:V1";
export const ESCROW_OP_DEPOSIT = "0x0";
export const STRK_DECIMALS = 18n;

export function isZeroAddress(value: string): boolean {
  try {
    return BigInt(value) === 0n;
  } catch {
    return true;
  }
}

export function escrowAddressForIndex(index: number): string {
  if (index === 0) return GhostDealEscrowMainnet;
  if (index === 2) return GhostDealEscrowSepolia;
  return "0x0";
}

export function randomFeltSecret(): string {
  const bytes = new Uint8Array(31);
  crypto.getRandomValues(bytes);
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export function commitmentHashFromSecret(secret: string): string {
  const tag = shortString.encodeShortString(ESCROW_COMMITMENT_TAG);
  return hash.computePoseidonHashOnElements([tag, secret]);
}

export function priceToWei(price: string): bigint {
  if (!/^\d+$/.test(price)) {
    throw new Error("Price must be a whole number of tokens.");
  }
  return BigInt(price) * 10n ** STRK_DECIMALS;
}

export function buildDepositActions(input: {
  escrow: string;
  claimHash: string;
  refundHash: string;
  token: string;
  amountWei: bigint;
}): STRK20_ACTION[] {
  return [
    {
      type: "invoke",
      contract: input.escrow,
      calldata: [
        ESCROW_OP_DEPOSIT,
        input.claimHash,
        input.refundHash,
        input.token,
        input.amountWei.toString(),
        "0x0",
        "0x0",
      ],
    },
  ];
}

export async function requireWalletApi0103(wallet: WalletWithStarknetFeatures): Promise<void> {
  const versions = (await walletV6.supportedWalletApi(wallet)).map(String);
  const ok = versions.some((v) => compareVersions(v, "0.10.3") >= 0);
  if (!ok) {
    throw new Error(
      "This Ready session does not expose Wallet API 0.10.3. Connect worked; private Pay cannot use this connector.",
    );
  }
}

export async function payListingDeposit(input: {
  listing: Listing;
  account: WalletAccountV6;
  wallet: WalletWithStarknetFeatures;
  providerIndex: number;
  refundHash: string;
}): Promise<string> {
  if (input.listing.token !== "STRK") {
    throw new Error("On-chain Pay only supports STRK until a USDC pool token is verified.");
  }
  if (!input.listing.claimHash || isZeroAddress(input.listing.claimHash)) {
    throw new Error("This listing has no seller claim hash. Publish it from Sell first.");
  }
  if (!(input.providerIndex in Strk20Networks)) {
    throw new Error("STRK20 is not available on this network.");
  }
  const escrow = escrowAddressForIndex(input.providerIndex);
  if (isZeroAddress(escrow)) {
    throw new Error(
      "GhostDeal escrow is not deployed on this network. Deploy cairo/ and set NEXT_PUBLIC_GHOSTDEAL_ESCROW_MAINNET or NEXT_PUBLIC_GHOSTDEAL_ESCROW_SEPOLIA.",
    );
  }
  await requireWalletApi0103(input.wallet);
  const actions = buildDepositActions({
    escrow,
    claimHash: input.listing.claimHash,
    refundHash: input.refundHash,
    token: addrSTRK,
    amountWei: priceToWei(input.listing.price),
  });
  await input.account.strk20PrepareInvoke(actions, true);
  const { transaction_hash } = await input.account.strk20InvokeTransaction(actions);
  return transaction_hash;
}
