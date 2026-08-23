export type ListingToken = "STRK" | "USDC";

export type ListingStatus = "open" | "locked" | "released";

export type Listing = {
  id: string;
  title: string;
  price: string;
  token: ListingToken;
  seller: string;
  ownerAddress?: string;
  image: string;
  blurb: string;
  status: ListingStatus;
  claimHash?: string;
  refundHash?: string;
  payTxHash?: string;
  claimTxHash?: string;
};

export const TOKEN_ICON: Record<ListingToken, string> = {
  STRK: "/tokens/strk.png",
  USDC: "/tokens/usdc.webp",
};
