import {
  compareVersions,
  hash,
  num,
  shortString,
  walletV6,
  type ProviderInterface,
  type STRK20_ACTION,
  type WalletAccountV6,
} from "starknet";
import type { WalletWithStarknetFeatures } from "@starknet-io/get-starknet-wallet-standard/features";
import {
  addrSTRK,
  addrUSDCMainnet,
  addrUSDCSepolia,
  GhostDealEscrowMainnet,
  GhostDealEscrowSepolia,
  Strk20Networks,
  Strk20PoolMainnet,
  Strk20PoolSepolia,
} from "@/utils/constants";
import type { Listing, ListingToken } from "@/data/listings";

export const ESCROW_COMMITMENT_TAG = "ESCROW_COMMITMENT_TAG:V1";
export const ESCROW_OP_DEPOSIT = "0x0";
export const ESCROW_OP_CLAIM = "0x1";
export const ESCROW_OP_CANCEL = "0x2";
export const STRK_DECIMALS = 18n;
// Circle USDC uses 6 decimals on every chain, including Starknet.
export const USDC_DECIMALS = 6n;

// Wallet API felts must be unpadded hex; the literal "0x0" and ${...} placeholders are the only exemptions.
const felt = (value: string | bigint): string => num.toHex(BigInt(value));

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

export function poolAddressForIndex(index: number): string {
  if (index === 0) return Strk20PoolMainnet;
  if (index === 2) return Strk20PoolSepolia;
  return "0x0";
}

// The pool's flat fee per private operation, deducted from the amount moved
// (shielding 10 with a 2 fee lands 8). Null when the read fails: callers
// fall back to hiding fee hints rather than guessing.
export async function poolFeeAmount(provider: ProviderInterface, pool: string): Promise<bigint | null> {
  if (isZeroAddress(pool)) return null;
  try {
    const r = await provider.callContract({ contractAddress: pool, entrypoint: "get_fee_amount", calldata: [] });
    return BigInt(r[0]);
  } catch {
    return null;
  }
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

export function tokenDecimals(token: ListingToken): bigint {
  return token === "USDC" ? USDC_DECIMALS : STRK_DECIMALS;
}

export function tokenAddressForListing(token: ListingToken, providerIndex: number): string {
  if (token === "STRK") return addrSTRK;
  if (providerIndex === 0) return addrUSDCMainnet;
  if (providerIndex === 2) return addrUSDCSepolia;
  throw new Error("USDC is not available on this network.");
}

export function priceToWei(price: string, token: ListingToken = "STRK"): bigint {
  if (!/^\d+$/.test(price)) {
    throw new Error("Price must be a whole number of tokens.");
  }
  return BigInt(price) * 10n ** tokenDecimals(token);
}

export function formatWei(wei: bigint, token: ListingToken = "STRK"): string {
  const decimals = tokenDecimals(token);
  const whole = wei / 10n ** decimals;
  const remainder = wei % 10n ** decimals;
  if (remainder === 0n) return `${whole}`;
  const show = decimals >= 3n ? 3n : decimals;
  const frac = remainder / 10n ** (decimals - show);
  const fracStr = frac.toString().padStart(Number(show), "0").replace(/0+$/, "");
  return fracStr ? `${whole}.${fracStr}` : `${whole}`;
}

function sameFelt(a: string, b: string): boolean {
  try {
    return BigInt(a) === BigInt(b);
  } catch {
    return false;
  }
}

// strk20InvokeTransaction can stall forever when the proving relay wedges; a
// submit that times out may still land, so callers must poll the chain.
const PRIVATE_SUBMIT_TIMEOUT_MS = 180_000;

function boundPrivateSubmit<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
            new Error(
              "The wallet stopped responding while proving. Wait a few minutes and check the deal status on the chain before retrying. The transaction can still land.",
            ),
        ),
      PRIVATE_SUBMIT_TIMEOUT_MS,
    );
  });
  return Promise.race([work, expiry]).finally(() => clearTimeout(timer));
}

// Wallet-mediated read of the user's shielded balance. No viewing key ever
// reaches the dapp. Returns null when the wallet cannot report it: callers
// must treat null as "unknown", not as zero, and let the pay attempt proceed.
export async function shieldedBalance(account: WalletAccountV6, token: string): Promise<bigint | null> {
  try {
    // A wedged relay can leave this read hanging forever, freezing whatever
    // button triggered it: degrade to "unknown" after a minute instead.
    const entries = await Promise.race([
      account.strk20Balances([token]),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("shielded balance read timed out")), 60_000),
      ),
    ]);
    const entry = entries.find((e) => sameFelt(e.token, token));
    return entry ? BigInt(entry.balance) : 0n;
  } catch (err: unknown) {
    // Visible on purpose: this error names the real cause (unsupported method,
    // permission, payload) when the wallet rejects the request.
    console.warn("[strk20] shieldedBalance failed:", err);
    return null;
  }
}

// Deposit returns an empty span: withdraw + invoke only, no OPEN leg (an open
// note with nothing to credit gets the batch rejected). secret/note_id stay "0x0".
export function buildDepositActions(input: {
  escrow: string;
  claimHash: string;
  refundHash: string;
  token: string;
  amountWei: bigint;
}): STRK20_ACTION[] {
  return [
    { type: "withdraw", token: felt(input.token), amount: felt(input.amountWei), recipient: felt(input.escrow) },
    {
      type: "invoke",
      contract: felt(input.escrow),
      calldata: [
        ESCROW_OP_DEPOSIT,
        felt(input.claimHash),
        felt(input.refundHash),
        felt(input.token),
        felt(input.amountWei),
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

// Shields public tokens into the STRK20 pool through the wallet. The deposit
// leg is public by design (README: what is private vs public). Returns the tx hash.
export async function shieldTokens(input: {
  account: WalletAccountV6;
  token: string;
  amountWei: bigint;
}): Promise<string> {
  const actions: STRK20_ACTION[] = [
    {
      type: "deposit",
      token: felt(input.token),
      amount: felt(input.amountWei),
    },
  ];
  const { transaction_hash } = await boundPrivateSubmit(input.account.strk20InvokeTransaction(actions));
  return transaction_hash;
}

// Unshields to the connected wallet. The closing transfer is public and names
// this address; splitting withdrawals over time is what breaks timing linkage.
export async function unshieldTokens(input: {
  account: WalletAccountV6;
  token: string;
  amountWei: bigint;
}): Promise<string> {
  const actions: STRK20_ACTION[] = [
    { type: "withdraw", token: felt(input.token), amount: felt(input.amountWei), recipient: felt(input.account.address) },
  ];
  const { transaction_hash } = await boundPrivateSubmit(input.account.strk20InvokeTransaction(actions));
  return transaction_hash;
}

// Read-only deposit state straight from the escrow contract. The wallet's
// proving relay can time out while the transaction still lands on-chain, so
// the UI must trust the chain, not the wallet promise.
export async function escrowDepositState(
  provider: ProviderInterface,
  escrow: string,
  claimHash: string,
): Promise<{ funded: boolean; closed: boolean }> {
  try {
    const r = await provider.callContract({
      contractAddress: escrow,
      entrypoint: "get_commitment",
      calldata: [claimHash],
    });
    // get_commitment returns CommitmentEntry(token, amount, refund_hash, closed).
    return { funded: BigInt(r[0]) !== 0n, closed: r[3] !== "0x0" };
  } catch {
    return { funded: false, closed: false };
  }
}

export async function payListingDeposit(input: {
  listing: Listing;
  account: WalletAccountV6;
  wallet: WalletWithStarknetFeatures;
  providerIndex: number;
  refundHash: string;
}): Promise<string> {
  if (input.listing.token !== "STRK" && input.listing.token !== "USDC") {
    throw new Error("On-chain Pay only supports STRK and USDC.");
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

  const token = tokenAddressForListing(input.listing.token, input.providerIndex);
  const amountWei = priceToWei(input.listing.price, input.listing.token);
  const shielded = await shieldedBalance(input.account, token);
  if (shielded !== null && shielded < amountWei) {
    throw new Error(
      `Not enough shielded ${input.listing.token}: you have ${formatWei(shielded, input.listing.token)}, the price is ${input.listing.price}. ` +
        `Shield (deposit) ${input.listing.token} into the STRK20 pool from your wallet, then try again.`,
    );
  }

  const actions = buildDepositActions({
    escrow,
    claimHash: input.listing.claimHash,
    refundHash: input.refundHash,
    token,
    amountWei,
  });
  // Direct submit: no strk20PrepareInvoke first: it re-triggers balance
  // permissions and can loop the wallet permission popup.
  const { transaction_hash } = await boundPrivateSubmit(input.account.strk20InvokeTransaction(actions));
  return transaction_hash;
}

// Claim returns an OpenNoteDeposit, so the OPEN leg is required; no withdraw:
// the escrow already holds the funds and approves the pool.
export function buildClaimActions(input: {
  escrow: string;
  secret: string;
  recipient: string;
  token: string;
}): STRK20_ACTION[] {
  return [
    { type: "transfer", token: felt(input.token), amount: "OPEN", recipient: felt(input.recipient) },
    {
      type: "invoke",
      contract: felt(input.escrow),
      calldata: [
        ESCROW_OP_CLAIM,
        // commitment_hash, refund_hash, token, amount: ignored by the Claim branch.
        "0x0",
        "0x0",
        "0x0",
        "0x0",
        felt(input.secret),
        "${openNoteIds[0]}",
      ],
    },
  ];
}

export function buildCancelActions(input: {
  escrow: string;
  claimHash: string;
  secret: string;
  recipient: string;
  token: string;
}): STRK20_ACTION[] {
  return [
    { type: "transfer", token: felt(input.token), amount: "OPEN", recipient: felt(input.recipient) },
    {
      type: "invoke",
      contract: felt(input.escrow),
      calldata: [
        ESCROW_OP_CANCEL,
        felt(input.claimHash),
        // refund_hash, token, amount: ignored by the Cancel branch.
        "0x0",
        "0x0",
        "0x0",
        felt(input.secret),
        "${openNoteIds[0]}",
      ],
    },
  ];
}

function requireEscrowReady(providerIndex: number): string {
  if (!(providerIndex in Strk20Networks)) {
    throw new Error("STRK20 is not available on this network.");
  }
  const escrow = escrowAddressForIndex(providerIndex);
  if (isZeroAddress(escrow)) {
    throw new Error(
      "GhostDeal escrow is not deployed on this network. Deploy cairo/ and set NEXT_PUBLIC_GHOSTDEAL_ESCROW_MAINNET or NEXT_PUBLIC_GHOSTDEAL_ESCROW_SEPOLIA.",
    );
  }
  return escrow;
}

// Seller payout. Throws when the commitment is missing or already closed.
export async function claimEscrowFunds(input: {
  claimSecret: string;
  account: WalletAccountV6;
  wallet: WalletWithStarknetFeatures;
  providerIndex: number;
  token: string;
}): Promise<string> {
  await requireWalletApi0103(input.wallet);
  const escrow = requireEscrowReady(input.providerIndex);
  const actions = buildClaimActions({
    escrow,
    secret: input.claimSecret,
    recipient: input.account.address,
    token: input.token,
  });
  const { transaction_hash } = await boundPrivateSubmit(input.account.strk20InvokeTransaction(actions));
  return transaction_hash;
}

// Buyer refund with the refund preimage.
export async function cancelEscrowFunds(input: {
  claimHash: string;
  refundSecret: string;
  account: WalletAccountV6;
  wallet: WalletWithStarknetFeatures;
  providerIndex: number;
  token: string;
}): Promise<string> {
  await requireWalletApi0103(input.wallet);
  const escrow = requireEscrowReady(input.providerIndex);
  const actions = buildCancelActions({
    escrow,
    claimHash: input.claimHash,
    secret: input.refundSecret,
    recipient: input.account.address,
    token: input.token,
  });
  const { transaction_hash } = await boundPrivateSubmit(input.account.strk20InvokeTransaction(actions));
  return transaction_hash;
}

// Token parked in an open commitment. Used when claiming with a pasted key
// (no local listing row) so the OPEN note matches the escrowed asset.
export async function escrowCommitmentToken(
  provider: ProviderInterface,
  escrow: string,
  claimHash: string,
): Promise<string | null> {
  try {
    const r = await provider.callContract({
      contractAddress: escrow,
      entrypoint: "get_commitment",
      calldata: [claimHash],
    });
    const token = r[0];
    return token && BigInt(token) !== 0n ? token : null;
  } catch {
    return null;
  }
}
