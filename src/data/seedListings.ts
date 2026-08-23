import type { Listing } from "@/data/listings";

// Demo listings shipped with the repo so any visitor sees a live marketplace
// with no backend. Their claimHashes are real: a payment locks on-chain like
// any other, and the GhostDeal team holds the preimages (never in this repo).
// Paying one is indistinguishable from paying a stranger's listing.
export const SEED_LISTINGS: Listing[] = [
  {
    id: "seed-keyboard",
    title: "Mechanical keyboard, tactile",
    price: "3",
    token: "STRK",
    seller: "@ghost",
    image: "/demo/keyboard.svg",
    blurb: "Hot-swappable switches, PBT caps, used for one hackathon season. Hand it over in person and get paid in private.",
    status: "open",
    claimHash: "0x1ef94103a8a2999ae6f189b3453e24b2522daa553ca40dd72c03c8d2bb32453",
  },
  {
    id: "seed-coffee",
    title: "Specialty coffee, 1 kg",
    price: "1",
    token: "STRK",
    seller: "@ghost",
    image: "/demo/coffee.svg",
    blurb: "Washed Ethiopian, roasted this week. The cheapest end-to-end demo on the marketplace.",
    status: "open",
    claimHash: "0x4faab32bf6bd50bf71fd7ecef6947d3281ffc89aea745723bf0186b5d968b79",
  },
  {
    id: "seed-bike",
    title: "City bike, tuned",
    price: "15",
    token: "STRK",
    seller: "@ghost",
    image: "/demo/bike.svg",
    blurb: "Single speed, new brake pads, locks to any rack. Meet at the park, scan, pay, ride away.",
    status: "open",
    claimHash: "0x2b7f05a6f1272ee370a220584e6c3b2c274d2f602a0d18a489eed19ec4e0636",
  },
];
