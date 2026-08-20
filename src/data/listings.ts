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
};

export const SEED_LISTINGS: Listing[] = [
  {
    id: "bike",
    title: "City bicycle",
    price: "120",
    token: "STRK",
    seller: "@javi",
    image: "/listings/bike.svg",
    blurb: "Steel frame, lights, lock included. Meet in person.",
    status: "open",
  },
  {
    id: "chair",
    title: "Desk chair",
    price: "45",
    token: "USDC",
    seller: "@maya",
    image: "/listings/chair.svg",
    blurb: "Adjustable height. Pickup only.",
    status: "open",
  },
  {
    id: "camera",
    title: "Point-and-shoot camera",
    price: "80",
    token: "STRK",
    seller: "@nico",
    image: "/listings/camera.svg",
    blurb: "Works. Battery and strap included.",
    status: "open",
  },
];

export const TOKEN_ICON: Record<ListingToken, string> = {
  STRK: "/tokens/strk.png",
  USDC: "/tokens/usdc.webp",
};
