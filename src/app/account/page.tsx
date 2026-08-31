"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ConnectGate from "@/app/components/ghost/ConnectGate";
import { useStoreWallet } from "@/app/components/Wallet/walletContext";
import { useFrontendProvider } from "@/app/components/client/provider/providerContext";
import { myFrontendProviders } from "@/utils/constants";
import { aliasFor, setAccountAlias } from "@/data/accountStore";
import { TOKEN_ICON, type ListingToken } from "@/data/listings";
import {
  escrowAddressForIndex,
  formatWei,
  isZeroAddress,
  poolAddressForIndex,
  poolFeeAmount,
  priceToWei,
  publicTokenBalance,
  readShieldedBalance,
  requireWalletApi0103,
  forceReleasePrivateOp,
  shieldTokens,
  STRK_DECIMALS,
  tokenAddressForListing,
  unshieldTokens,
  waitForPublicBalanceMove,
} from "@/lib/escrow";
import { fetchSwapQuote, planPrivateSwap, submitPrivateSwapBatch, SWAP_SLIPPAGE, type Quote } from "@/lib/avnu";
import { friendlyPrivateError, isPrivateTokensOffError, privateErrorText } from "@/lib/privateWalletError";
import { Strk20Networks } from "@/utils/constants";

// Whole STRK covering one pool fee, rounded up. Used to seed the shield input
// with a fee-based default instead of a hard-coded demo amount.
function wholeStrkForFee(feeWei: bigint): bigint {
  const whole = feeWei / 10n ** STRK_DECIMALS;
  return feeWei % 10n ** STRK_DECIMALS > 0n ? whole + 1n : whole;
}

export default function AccountPage() {
  const isConnected = useStoreWallet((s) => s.isConnected);
  const account = useStoreWallet((s) => s.myWalletAccount);
  const wallet = useStoreWallet((s) => s.StarknetWalletObject);
  const address = useStoreWallet((s) => s.address);
  const providerIndex = useFrontendProvider((s) => s.currentFrontendProviderIndex);

  // null = not read yet; balanceFailed = the wallet's balance service failed.
  const [balance, setBalance] = useState<bigint | null>(null);
  const [balanceFailed, setBalanceFailed] = useState(false);
  const [reading, setReading] = useState(false);
  const [asset, setAsset] = useState<ListingToken>("STRK");
  const [amount, setAmount] = useState("");
  const [amountTouched, setAmountTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [fee, setFee] = useState<bigint | null>(null);
  const [alias, setAlias] = useState("");
  const [editing, setEditing] = useState(false);
  // Convert flow: quote fetched first, then the user confirms the private swap.
  const [convertQuote, setConvertQuote] = useState<Quote | null>(null);
  const [converting, setConverting] = useState(false);
  // The wallet request stays live for the whole proving run (minutes); the
  // Cancel-wait escape hatch only appears after a generous delay so a slow
  // proof is never mistaken for a failure worth retrying.
  const [waitLong, setWaitLong] = useState(false);
  const waitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Convert owns its pair and amount so it never borrows the Shield form's.
  const [swapAsset, setSwapAsset] = useState<ListingToken>("STRK");
  const [swapAmount, setSwapAmount] = useState("");

  const escrowReady = !isZeroAddress(escrowAddressForIndex(providerIndex));
  const swapNetworkReady =
    providerIndex in Strk20Networks && !isZeroAddress(poolAddressForIndex(providerIndex));
  const swapBuyToken: ListingToken = swapAsset === "STRK" ? "USDC" : "STRK";
  // STRK only: seed the input with ~2 pool fees so fees for later private ops are covered.
  const suggestedAmount = useMemo(() => {
    if (asset !== "STRK" || fee === null || fee <= 0n) return null;
    const perOp = wholeStrkForFee(fee);
    return perOp > 0n ? String(perOp * 2n) : null;
  }, [fee, asset]);

  // Plain RPC read, no wallet prompt.
  useEffect(() => {
    let cancelled = false;
    setAmountTouched(false);
    setFee(null);
    setConvertQuote(null);
    poolFeeAmount(myFrontendProviders[providerIndex], poolAddressForIndex(providerIndex)).then((value) => {
      if (!cancelled) setFee(value);
    });
    return () => {
      cancelled = true;
    };
  }, [providerIndex]);

  useEffect(() => {
    setBalance(null);
    setBalanceFailed(false);
    setAmountTouched(false);
    if (asset === "USDC") setAmount("");
  }, [asset]);

  // A quote is only valid for the pair it was fetched for.
  useEffect(() => {
    setConvertQuote(null);
  }, [swapAsset]);

  useEffect(() => {
    if (amountTouched || !suggestedAmount) return;
    setAmount(suggestedAmount);
  }, [suggestedAmount, amountTouched]);

  useEffect(() => {
    if (isConnected && address) setAlias(aliasFor(address));
  }, [isConnected, address]);

  if (!isConnected) {
    return (
      <ConnectGate
        title="Account"
        lead="Connect to shield and pay in private."
      />
    );
  }

  // Reading the balance triggers a wallet consent prompt, so it only runs on
  // explicit request.
  async function onReadBalance() {
    if (!account) return;
    setError("");
    setReading(true);
    try {
      const value = await readShieldedBalance(account, tokenAddressForListing(asset, providerIndex));
      setBalance(value);
      setBalanceFailed(false);
    } catch (err: unknown) {
      console.warn("[strk20] shieldedBalance failed:", err);
      setBalance(null);
      setBalanceFailed(true);
      setError(friendlyPrivateError(err, "Could not read shielded balance."));
    } finally {
      setReading(false);
    }
  }

  function onSaveAlias() {
    if (!address) return;
    setAccountAlias(address, alias.trim());
    setEditing(false);
  }

  function parseWholeAmount(value: string, token: ListingToken): bigint | null {
    try {
      const amountWei = priceToWei(value, token);
      return amountWei > 0n ? amountWei : null;
    } catch {
      return null;
    }
  }

  function parseAmountWei(): bigint | null {
    return parseWholeAmount(amount, asset);
  }

  function beginWait() {
    setWaitLong(false);
    waitTimer.current = setTimeout(() => setWaitLong(true), 45_000);
  }

  function endWait() {
    if (waitTimer.current) clearTimeout(waitTimer.current);
    waitTimer.current = null;
    setWaitLong(false);
  }

  function onCancelWait() {
    forceReleasePrivateOp();
    endWait();
    setBusy(false);
    setConverting(false);
    setNote("Wait cancelled. The operation may still land — check Show balance before repeating it.");
  }

  // The wallet's promise can lag minutes behind a transaction that already
  // landed. Whichever signal arrives first wins: the op settling on its own, or
  // the chain showing the public balance move. A late op rejection after the
  // chain confirmed is ignored — the chain is the source of truth.
  async function settleOrChainConfirm<T>(
    op: Promise<T>,
    landed: Promise<boolean> | null,
    chainNote: string,
    settledNote: (result: T) => string,
  ) {
    let opError: unknown = null;
    const settled = op.then(
      () => "op" as const,
      (err: unknown) => {
        opError = err;
        return "op" as const;
      },
    );
    const never = new Promise<never>(() => {});
    const winner = await Promise.race([settled, (landed ?? never).then(() => "chain" as const)]);
    if (winner === "chain") {
      forceReleasePrivateOp();
      setNote(chainNote);
    } else if (opError) {
      throw opError;
    } else {
      setNote(settledNote(await op));
    }
  }

  async function onShield() {
    setError("");
    setNote("");
    if (!account || !address) {
      setError("Reconnect, then retry Shield.");
      return;
    }
    const amountWei = parseAmountWei();
    if (!amountWei) {
      setError(`Enter a whole number of ${asset}.`);
      return;
    }
    const token = tokenAddressForListing(asset, providerIndex);
    const provider = myFrontendProviders[providerIndex];
    beginWait();
    setBusy(true);
    let done = false;
    try {
      const before = await publicTokenBalance(provider, token, address);
      const op = shieldTokens({ account, token, amountWei });
      await settleOrChainConfirm(
        op,
        before !== null
          ? waitForPublicBalanceMove(provider, token, address, before, "down", 300_000, () => done)
          : null,
        `Shielded ${amount} ${asset} — confirmed on-chain. Refresh to see it.`,
        () => `Shielded ${amount} ${asset}. Refresh to see it.`,
      );
    } catch (err: unknown) {
      console.error("[GhostDeal] shield failed:", err);
      if (isPrivateTokensOffError(err)) {
        setError(friendlyPrivateError(err, "Shield failed."));
      } else if (/timed out|stopped responding/i.test(privateErrorText(err))) {
        setError("The wallet timed out. The shield can still land; tap Refresh in a bit.");
      } else {
        setError(friendlyPrivateError(err, "Shield failed."));
      }
    } finally {
      done = true;
      endWait();
      setBusy(false);
    }
  }

  async function onUnshield() {
    setError("");
    setNote("");
    if (!account || !address) {
      setError("Reconnect, then retry.");
      return;
    }
    const amountWei = parseAmountWei();
    if (!amountWei) {
      setError(`Enter a whole number of ${asset}.`);
      return;
    }
    const token = tokenAddressForListing(asset, providerIndex);
    const provider = myFrontendProviders[providerIndex];
    beginWait();
    setBusy(true);
    let done = false;
    try {
      const before = await publicTokenBalance(provider, token, address);
      const op = unshieldTokens({ account, token, amountWei });
      await settleOrChainConfirm(
        op,
        before !== null
          ? waitForPublicBalanceMove(provider, token, address, before, "up", 300_000, () => done)
          : null,
        `Unshielded ${asset} — confirmed on-chain.`,
        (hash) => `Unshielded ${asset}. Tx ${hash.slice(0, 10)}…`,
      );
    } catch (err: unknown) {
      console.error("[GhostDeal] unshield failed:", err);
      if (isPrivateTokensOffError(err)) {
        setError(friendlyPrivateError(err, "Unshield failed."));
      } else if (/timed out|stopped responding/i.test(privateErrorText(err))) {
        setError("The wallet timed out. The unshield can still land; check your public balance in a bit.");
      } else {
        setError(friendlyPrivateError(err, "Unshield failed."));
      }
    } finally {
      done = true;
      endWait();
      setBusy(false);
    }
  }

  // Convert step 1: quote the pair off-chain (no wallet prompt, no consent).
  async function onConvertQuote() {
    setError("");
    setNote("");
    if (!account) {
      setError("Reconnect, then retry Convert.");
      return;
    }
    if (!swapNetworkReady) {
      setError("Private swaps run on mainnet.");
      return;
    }
    const amountWei = parseWholeAmount(swapAmount, swapAsset);
    if (!amountWei) {
      setError(`Enter a whole number of ${swapAsset} to convert.`);
      return;
    }
    // The displayed balance only matches when converting the chip-selected asset.
    if (swapAsset === asset && balance !== null && balance < amountWei) {
      setError(`Not enough shielded ${swapAsset}: you have ${formatWei(balance, swapAsset)}.`);
      return;
    }
    setConverting(true);
    try {
      const quote = await fetchSwapQuote({
        providerIndex,
        sellToken: tokenAddressForListing(swapAsset, providerIndex),
        buyToken: tokenAddressForListing(swapBuyToken, providerIndex),
        sellAmountWei: amountWei,
        takerAddress: account.address,
      });
      if (!quote) {
        setError(`No conversion route ${swapAsset} → ${swapBuyToken} on this network right now.`);
        return;
      }
      setConvertQuote(quote);
    } catch (err: unknown) {
      console.error("[GhostDeal] convert quote failed:", err);
      setError("Could not fetch a conversion quote. Try again.");
    } finally {
      setConverting(false);
    }
  }

  // Convert step 2: build the private batch and hand it to the wallet to prove
  // and submit. Same relay as Pay; the pool fee is charged in shielded STRK.
  async function onConvertConfirm() {
    setError("");
    setNote("");
    if (!account || !wallet) {
      setError("Connect a wallet first.");
      return;
    }
    if (!convertQuote) return;
    beginWait();
    setConverting(true);
    try {
      await requireWalletApi0103(wallet);
      const actions = await planPrivateSwap({
        providerIndex,
        quote: convertQuote,
        takerAddress: account.address,
      });
      const hash = await submitPrivateSwapBatch({ account, actions });
      setConvertQuote(null);
      setNote(
        `Converting ${swapAmount} ${swapAsset} → ~${formatWei(convertQuote.buyAmount, swapBuyToken)} ${swapBuyToken}. ` +
          `The new shielded ${swapBuyToken} is spendable in about a minute (~10 blocks). Tx ${hash.slice(0, 10)}…`,
      );
    } catch (err: unknown) {
      console.error("[GhostDeal] private swap failed:", err);
      if (isPrivateTokensOffError(err)) {
        setError(friendlyPrivateError(err, "Convert failed."));
      } else if (/timed out|stopped responding/i.test(privateErrorText(err))) {
        setError("The wallet timed out while proving. The conversion can still land; refresh in a bit.");
      } else {
        setError(friendlyPrivateError(err, "Convert failed."));
      }
    } finally {
      endWait();
      setConverting(false);
    }
  }

  return (
    <>
      <div className="gdRow" style={{ alignItems: "center", gap: 8 }}>
        <h1 className="gdH1" style={{ margin: 0 }}>
          {alias || "Account"}
        </h1>
        {!editing ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label="Rename"
            title="Rename"
            style={{ background: "none", border: "none", cursor: "pointer", padding: 4, lineHeight: 0 }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
            </svg>
          </button>
        ) : null}
      </div>
      {editing ? (
        <form
          className="gdForm"
          onSubmit={(e) => {
            e.preventDefault();
            onSaveAlias();
          }}
        >
          <div className="gdRow">
            <input
              autoFocus
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              placeholder="Your name"
              style={{ width: 150 }}
            />
            <button type="submit" className="gdBtn gdBtnGhost">
              Save
            </button>
          </div>
        </form>
      ) : null}

      <p className="gdLead" style={{ marginTop: 10, marginBottom: 4 }}>
        To buy you need shielded STRK for fees, and shielded USDC to pay. STRK listings spend shielded STRK.
      </p>

      <div className="gdChips" style={{ marginTop: 10, marginBottom: 8 }} role="group" aria-label="Token">
        {(["STRK", "USDC"] as ListingToken[]).map((token) => (
          <button
            key={token}
            type="button"
            className={asset === token ? "gdChip gdChipOn" : "gdChip"}
            onClick={() => setAsset(token)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={TOKEN_ICON[token]} alt="" style={{ width: 16, height: 16, marginRight: 6, verticalAlign: "middle" }} />
            {token}
          </button>
        ))}
      </div>

      <div className="gdPrice" style={{ fontSize: 28, margin: "10px 0 6px" }}>
        {balance !== null ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={TOKEN_ICON[asset]} alt="" />
            {formatWei(balance, asset)} {asset}
          </>
        ) : balanceFailed ? (
          "Unavailable"
        ) : (
          "Hidden"
        )}
      </div>
      <button
        type="button"
        className="gdBtn gdBtnGhost"
        style={{ marginTop: 10 }}
        onClick={onReadBalance}
        disabled={reading}
      >
        {reading ? "Reading…" : balance === null ? "Show balance" : "Refresh"}
      </button>
      {error ? (
        <p className="gdAlert" role="alert">
          {error}
        </p>
      ) : null}
      {!escrowReady ? <p className="gdMeta">Escrow not deployed on this network.</p> : null}

      {note ? <p className="gdMeta" style={{ marginTop: 12 }}>{note}</p> : null}
      {busy || converting ? (
        <>
          <p className="gdAlert" role="status">
            {waitLong
              ? "Still proving… private proofs can take a few minutes."
              : "Waiting on wallet… proving can take a couple of minutes."}
          </p>
          {waitLong ? (
            <button type="button" className="gdBtn gdBtnGhost" onClick={onCancelWait}>
              Cancel wait
            </button>
          ) : null}
        </>
      ) : null}

      <p className="gdMeta" style={{ marginTop: 16, marginBottom: 8 }}>
        Amount to shield
      </p>
      <form
        className="gdForm"
        onSubmit={(e) => {
          e.preventDefault();
          onShield();
        }}
      >
        <div className="gdRow">
          <input
            value={amount}
            onChange={(e) => {
              setAmountTouched(true);
              setAmount(e.target.value);
            }}
            placeholder={asset === "STRK" ? (suggestedAmount ?? "amount") : "amount"}
            inputMode="numeric"
            aria-label={`${asset} amount to shield`}
            style={{ width: 90 }}
          />
          <span className="gdMeta" style={{ alignSelf: "center" }}>
            {asset}
          </span>
          <button type="submit" className="gdBtn" disabled={busy}>
            {busy ? "Waiting…" : "Shield"}
          </button>
          <button type="button" className="gdBtn gdBtnGhost" onClick={onUnshield} disabled={busy}>
            Unshield
          </button>
        </div>
      </form>
      <p className="gdMeta">
        Unshield is public.
        {fee !== null ? ` Fee ${formatWei(fee)} STRK per op.` : ""}
      </p>

      <p className="gdMeta" style={{ marginTop: 16, marginBottom: 8 }}>
        Convert inside the pool via AVNU. Pool fee charged in STRK.
      </p>
      {!swapNetworkReady ? <p className="gdMeta" style={{ marginBottom: 8 }}>Private swaps run on mainnet.</p> : null}
      <div className="gdChips" style={{ marginBottom: 8 }} role="group" aria-label="Convert direction">
        {(["STRK", "USDC"] as ListingToken[]).map((token) => (
          <button
            key={token}
            type="button"
            className={swapAsset === token ? "gdChip gdChipOn" : "gdChip"}
            onClick={() => setSwapAsset(token)}
          >
            {token} → {token === "STRK" ? "USDC" : "STRK"}
          </button>
        ))}
      </div>
      {convertQuote ? (
        <div className="gdRow" style={{ flexWrap: "wrap", gap: 8 }}>
          <span className="gdMeta" style={{ alignSelf: "center" }}>
            Convert {swapAmount} {swapAsset} → receive ~{formatWei(convertQuote.buyAmount, swapBuyToken)} {swapBuyToken} ({SWAP_SLIPPAGE * 100}% max slippage)
          </span>
          <button type="button" className="gdBtn" onClick={onConvertConfirm} disabled={converting}>
            {converting ? "Proving…" : "Confirm convert"}
          </button>
          <button type="button" className="gdBtn gdBtnGhost" onClick={() => setConvertQuote(null)} disabled={converting}>
            Cancel
          </button>
        </div>
      ) : (
        <form
          className="gdForm"
          onSubmit={(e) => {
            e.preventDefault();
            onConvertQuote();
          }}
        >
          <div className="gdRow">
            <input
              value={swapAmount}
              onChange={(e) => setSwapAmount(e.target.value)}
              placeholder="amount"
              inputMode="numeric"
              aria-label={`${swapAsset} amount to convert`}
              style={{ width: 90 }}
            />
            <span className="gdMeta" style={{ alignSelf: "center" }}>
              {swapAsset}
            </span>
            <button type="submit" className="gdBtn" disabled={busy || converting || !swapNetworkReady}>
              {converting ? "Quoting…" : "Convert"}
            </button>
          </div>
        </form>
      )}
    </>
  );
}
