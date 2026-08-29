"use client";

import { useEffect, useMemo, useState } from "react";
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
  shieldedBalance,
  shieldTokens,
  STRK_DECIMALS,
  tokenAddressForListing,
  unshieldTokens,
} from "@/lib/escrow";

// Whole STRK covering one pool fee, rounded up. Used to seed the shield input
// with a fee-based default instead of a hard-coded demo amount.
function wholeStrkForFee(feeWei: bigint): bigint {
  const whole = feeWei / 10n ** STRK_DECIMALS;
  return feeWei % 10n ** STRK_DECIMALS > 0n ? whole + 1n : whole;
}

// Ready's WalletRPCError often has an empty .message; the code is on toString() or .cause.
function privateErrorText(err: unknown): string {
  const chunks: string[] = [];
  if (err instanceof Error) {
    if (err.name) chunks.push(err.name);
    if (err.message) chunks.push(err.message);
    if (err.cause instanceof Error && err.cause.message) chunks.push(err.cause.message);
    else if (typeof err.cause === "string") chunks.push(err.cause);
  } else if (err && typeof err === "object" && "message" in err) {
    const nested = (err as { message: unknown }).message;
    if (typeof nested === "string") chunks.push(nested);
  }
  try {
    const asString = String(err);
    if (asString && asString !== "[object Object]") chunks.push(asString);
  } catch {
    /* ignore */
  }
  return chunks.join(" ");
}

function friendlyPrivateError(err: unknown, fallback: string): string {
  const message = privateErrorText(err) || fallback;
  if (/NOT_REGISTERED|not registered|viewing key/i.test(message)) {
    return "Not registered in STRK20 yet. In Ready, open Privacy / Shield first.";
  }
  if (/timed out|stopped responding/i.test(message)) {
    return "Wallet timed out. The tx can still land; refresh in a bit.";
  }
  return message || fallback;
}

export default function AccountPage() {
  const isConnected = useStoreWallet((s) => s.isConnected);
  const account = useStoreWallet((s) => s.myWalletAccount);
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

  const escrowReady = !isZeroAddress(escrowAddressForIndex(providerIndex));
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
      const value = await shieldedBalance(account, tokenAddressForListing(asset, providerIndex));
      setBalance(value);
      setBalanceFailed(value === null);
    } finally {
      setReading(false);
    }
  }

  function onSaveAlias() {
    if (!address) return;
    setAccountAlias(address, alias.trim());
    setEditing(false);
  }

  function parseAmountWei(): bigint | null {
    try {
      const amountWei = priceToWei(amount, asset);
      return amountWei > 0n ? amountWei : null;
    } catch {
      return null;
    }
  }

  async function onShield() {
    setError("");
    setNote("");
    if (!account) {
      setError("Reconnect, then retry Shield.");
      return;
    }
    const amountWei = parseAmountWei();
    if (!amountWei) {
      setError(`Enter a whole number of ${asset}.`);
      return;
    }
    setBusy(true);
    try {
      await shieldTokens({ account, token: tokenAddressForListing(asset, providerIndex), amountWei });
      setNote(`Shielded ${amount} ${asset}. Refresh to see it.`);
    } catch (err: unknown) {
      console.error("[GhostDeal] shield failed:", err);
      setError(friendlyPrivateError(err, "Shield failed."));
    } finally {
      setBusy(false);
    }
  }

  async function onUnshield() {
    setError("");
    setNote("");
    if (!account) {
      setError("Reconnect, then retry.");
      return;
    }
    const amountWei = parseAmountWei();
    if (!amountWei) {
      setError(`Enter a whole number of ${asset}.`);
      return;
    }
    setBusy(true);
    try {
      const hash = await unshieldTokens({
        account,
        token: tokenAddressForListing(asset, providerIndex),
        amountWei,
      });
      setNote(`Unshielded ${asset}. Tx ${hash.slice(0, 10)}…`);
    } catch (err: unknown) {
      console.error("[GhostDeal] unshield failed:", err);
      setError(friendlyPrivateError(err, "Unshield failed."));
    } finally {
      setBusy(false);
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

      <div className="gdChips" style={{ marginTop: 18, marginBottom: 8 }} role="group" aria-label="Token">
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
          "—"
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
      {!escrowReady ? <p className="gdMeta">Escrow not deployed on this network.</p> : null}

      {note ? <p className="gdMeta" style={{ marginTop: 12 }}>{note}</p> : null}
      {busy ? (
        <p className="gdAlert" role="status">
          Waiting on wallet…
        </p>
      ) : null}

      <form
        className="gdForm"
        style={{ marginTop: 16 }}
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
      {error ? (
        <p className="gdAlert" role="alert">
          {error}
        </p>
      ) : null}
      <p className="gdMeta">
        {fee !== null ? `Fee ${formatWei(fee)} STRK per op. ` : ""}
        {asset === "USDC" ? "Fee is paid in STRK. " : ""}
        Unshield is public.
      </p>
    </>
  );
}
