import { getQuotes, quoteToCalls, type Quote } from "@avnu/avnu-sdk";

export type { Quote };
import {
  transaction,
  type Call,
  type STRK20_ACTION,
  type WalletAccountV6,
} from "starknet";
import { felt, singlePrivateOp } from "@/lib/escrow";

// AVNU's public swap API per network, indexed like myFrontendProviders.
// Sepolia currently returns no routes for native USDC, so conversion runs on
// mainnet first; the code is network-generic.
const AVNU_BASE_URLS: Record<number, string> = {
  0: "https://starknet.api.avnu.fi",
  2: "https://sepolia.api.avnu.fi",
};

export const SWAP_SLIPPAGE = 0.01;

// Off-chain quote for converting a shielded amount. Null when AVNU lists no
// route for the pair on this network.
export async function fetchSwapQuote(input: {
  providerIndex: number;
  sellToken: string;
  buyToken: string;
  sellAmountWei: bigint;
  takerAddress: string;
}): Promise<Quote | null> {
  const baseUrl = AVNU_BASE_URLS[input.providerIndex];
  if (!baseUrl) return null;
  try {
    const quotes = await getQuotes(
      {
        sellTokenAddress: input.sellToken,
        buyTokenAddress: input.buyToken,
        sellAmount: input.sellAmountWei,
        takerAddress: input.takerAddress,
        size: 1,
      },
      { baseUrl },
    );
    return quotes[0] ?? null;
  } catch (err: unknown) {
    console.warn("[avnu] quote failed:", err);
    return null;
  }
}

// The private swap batch, mirroring AVNU's own buildStrk20Actions minus the
// paymaster fee withdraw (the wallet relay charges the pool fee in STRK like
// every other private op): the pool pulls the shielded sell amount into AVNU's
// executor, the executor runs the route, and the buy amount comes back as an
// open note credited to the taker.
export function buildAvnuSwapActions(input: {
  quote: Quote;
  calls: Call[];
  executorAddress: string;
  takerAddress: string;
}): STRK20_ACTION[] {
  return [
    {
      type: "withdraw",
      token: felt(input.quote.sellTokenAddress),
      amount: felt(input.quote.sellAmount),
      recipient: felt(input.executorAddress),
    },
    {
      type: "transfer",
      token: felt(input.quote.buyTokenAddress),
      amount: "OPEN",
      recipient: felt(input.takerAddress),
    },
    {
      type: "invoke",
      contract: felt(input.executorAddress),
      calldata: [
        felt(input.quote.buyTokenAddress),
        ...transaction.fromCallsToExecuteCalldata_cairo1(input.calls).map((item) => felt(item)),
        "${openNoteIds[0]}",
      ],
    },
  ];
}

// Turns a quote into the concrete private batch via AVNU's build endpoint
// (private mode sets the API's taker to its executor).
export async function planPrivateSwap(input: {
  providerIndex: number;
  quote: Quote;
  takerAddress: string;
}): Promise<STRK20_ACTION[]> {
  const baseUrl = AVNU_BASE_URLS[input.providerIndex];
  if (!baseUrl) throw new Error("STRK20 is not available on this network.");
  const { calls, executorAddress } = await quoteToCalls(
    { quoteId: input.quote.quoteId, slippage: SWAP_SLIPPAGE, private: true },
    { baseUrl },
  );
  if (!executorAddress) {
    throw new Error("AVNU returned no private-swap executor. Try again in a moment.");
  }
  return buildAvnuSwapActions({
    quote: input.quote,
    calls,
    executorAddress,
    takerAddress: input.takerAddress,
  });
}

export async function submitPrivateSwapBatch(input: {
  account: WalletAccountV6;
  actions: STRK20_ACTION[];
}): Promise<string> {
  const { transaction_hash } = await singlePrivateOp(() => input.account.strk20InvokeTransaction(input.actions));
  return transaction_hash;
}
