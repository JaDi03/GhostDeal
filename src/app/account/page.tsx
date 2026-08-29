"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ConnectGate from "@/app/components/ghost/ConnectGate";
import { useStoreWallet } from "@/app/components/Wallet/walletContext";
import { useFrontendProvider } from "@/app/components/client/provider/providerContext";
import { addrSTRK, myFrontendProviders, Strk20Networks } from "@/utils/constants";
import { aliasFor, setAccountAlias } from "@/data/accountStore";
import {
  escrowAddressForIndex,
  formatWei,
  isZeroAddress,
  poolAddressForIndex,
  poolFeeAmount,
  priceToWei,
  readShieldedBalance,
  shieldTokens,
  unshieldTokens,
} from "@/lib/escrow";
import { friendlyPrivateError, isPrivateTokensOffError, privateErrorText } from "@/lib/privateWalletError";

export default function AccountPage() {
  const isConnected = useStoreWallet((s) => s.isConnected);
  const account = useStoreWallet((s) => s.myWalletAccount);
  const address = useStoreWallet((s) => s.address);
  const providerIndex = useFrontendProvider((s) => s.currentFrontendProviderIndex);

  // null = not read yet; balanceFailed = the wallet's balance service failed.
  const [balance, setBalance] = useState<bigint | null>(null);
  const [balanceFailed, setBalanceFailed] = useState(false);
  const [reading, setReading] = useState(false);
  const [amount, setAmount] = useState("5");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [fee, setFee] = useState<bigint | null>(null);
  const [alias, setAlias] = useState("");
  const [editing, setEditing] = useState(false);

  const network = providerIndex in Strk20Networks ? Strk20Networks[providerIndex] : "UNSUPPORTED";
  const escrowReady = !isZeroAddress(escrowAddressForIndex(providerIndex));

  // Plain RPC read, no wallet prompt.
  useEffect(() => {
    let cancelled = false;
    poolFeeAmount(myFrontendProviders[providerIndex], poolAddressForIndex(providerIndex)).then((value) => {
      if (!cancelled) setFee(value);
    });
    return () => {
      cancelled = true;
    };
  }, [providerIndex]);

  useEffect(() => {
    if (isConnected && address) setAlias(aliasFor(address));
  }, [isConnected, address]);

  if (!isConnected) {
    return (
      <ConnectGate
        title="Account"
        lead="Connect a wallet to see your shielded balance. Until then you can only browse the marketplace."
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
      const value = await readShieldedBalance(account, addrSTRK);
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

  function parseAmountWei(): bigint | null {
    try {
      const amountWei = priceToWei(amount);
      return amountWei > 0n ? amountWei : null;
    } catch {
      return null;
    }
  }

  async function onShield() {
    setError("");
    setNote("");
    if (!account) return;
    const amountWei = parseAmountWei();
    if (!amountWei) {
      setError("Enter a whole number of STRK.");
      return;
    }
    setBusy(true);
    try {
      await shieldTokens({ account, token: addrSTRK, amountWei });
      setNote("Shielded. Tap Refresh balance to see it.");
    } catch (err: unknown) {
      console.error("[GhostDeal] shield failed:", err);
      if (isPrivateTokensOffError(err)) {
        setError(friendlyPrivateError(err, "Shield failed."));
      } else if (/timed out|stopped responding/i.test(privateErrorText(err))) {
        setError("The wallet timed out. The shield can still land; tap Refresh balance in a bit.");
      } else {
        setError(friendlyPrivateError(err, "Shield failed."));
      }
    } finally {
      setBusy(false);
    }
  }

  async function onUnshield() {
    setError("");
    setNote("");
    if (!account) return;
    const amountWei = parseAmountWei();
    if (!amountWei) {
      setError("Enter a whole number of STRK.");
      return;
    }
    setBusy(true);
    try {
      const hash = await unshieldTokens({ account, token: addrSTRK, amountWei });
      setNote(`Unshielded minus the pool fee. Tx ${hash}`);
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
      setBusy(false);
    }
  }

  const readyToBuy = balance !== null && balance > 0n;

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

      <div className="gdPrice" style={{ fontSize: 28, margin: "18px 0 6px" }}>
        {balance !== null ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/tokens/strk.png" alt="" />
            {formatWei(balance)} STRK shielded
          </>
        ) : balanceFailed ? (
          "Balance unavailable right now."
        ) : (
          "Shielded balance not read yet."
        )}
      </div>
      <button
        type="button"
        className="gdBtn gdBtnGhost"
        style={{ marginTop: 10 }}
        onClick={onReadBalance}
        disabled={reading}
      >
        {reading ? "Reading…" : balance === null ? "Show shielded balance" : "Refresh balance"}
      </button>
      {error ? (
        <p className="gdAlert" role="alert">
          {error}
        </p>
      ) : null}
      <p className="gdMeta" style={{ marginTop: 10 }}>
        {network} · Escrow {escrowReady ? "deployed" : "not deployed"}
      </p>

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
            onChange={(e) => setAmount(e.target.value)}
            placeholder="STRK"
            inputMode="numeric"
            aria-label="STRK amount"
            style={{ width: 90 }}
          />
          <button type="submit" className="gdBtn" disabled={busy}>
            {busy ? "Working…" : "Shield"}
          </button>
          <button type="button" className="gdBtn gdBtnGhost" onClick={onUnshield} disabled={busy}>
            Unshield
          </button>
        </div>
      </form>
      <p className="gdMeta">
        The wallet asks twice (approve, then move).
        {fee !== null ? ` Pool fee: ${formatWei(fee)} STRK per private operation, deducted from the amount (shield or unshield).` : ""}{" "}
        Unshield is a public withdraw. Spread withdrawals over time to break timing linkage.
      </p>

      {note ? <p className="gdMeta">{note}</p> : null}

      <h2 className="gdCardTitle" style={{ marginTop: 22 }}>
        To buy
      </h2>
      <p className="gdMeta">
        {readyToBuy
          ? `Ready. You can pay from your ${formatWei(balance ?? 0n)} shielded STRK.`
          : "Shield STRK above first. Private payments only spend shielded balance."}
      </p>

      <h2 className="gdCardTitle" style={{ marginTop: 16 }}>
        To sell
      </h2>
      <p className="gdMeta">
        Ready. Publishing needs no balance and payouts land in your shielded side. <Link href="/sell">Publish a listing</Link>.
      </p>
    </>
  );
}
