"use client";
import styles from "../../../uni.module.css";
import { useStoreWallet } from "../../Wallet/walletContext";
import { useFrontendProvider } from "../provider/providerContext";
import { useEffect, useRef, useState } from "react";
import { walletV6, validateAndParseAddress, constants as SNconstants, WalletAccountV6 } from "starknet";
import { WALLET_API, type StarknetWindowObject } from "@starknet-io/types-js";
import { myFrontendProviders } from "@/utils/constants";
import { createStore, type Store } from "@starknet-io/get-starknet-discovery";
import { StarknetInjectedWallet } from "@starknet-io/get-starknet-wallet-standard";
import type {
  WalletWithStarknetFeatures,
} from '@starknet-io/get-starknet-wallet-standard/features';


// Normalize wallet identifiers so starknetkit's connector id / SWO name
// ("argentX", "Ready", "Braavos") can be matched against the wallet-standard
// wallet's display name ("Argent X", "Braavos", ...).
function normalizeId(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parseVersionParts(v: string): number[] {
  return v.split(".").map((part) => Number.parseInt(part, 10) || 0);
}

function hasMinWalletApi(versions: readonly string[], min: string): boolean {
  const [minMajor, minMinor, minPatch] = parseVersionParts(min);
  return versions.some((raw) => {
    const [major, minor, patch] = parseVersionParts(raw);
    if (major !== minMajor) return major > minMajor;
    if (minor !== minMinor) return minor > minMinor;
    return patch >= minPatch;
  });
}

function asStarknetWindowObject(wallet: unknown): StarknetWindowObject | null {
  if (!wallet || typeof wallet !== "object") return null;
  const candidate = wallet as { request?: unknown; on?: unknown; off?: unknown };
  if (typeof candidate.request !== "function") return null;
  if (typeof candidate.on !== "function") return null;
  if (typeof candidate.off !== "function") return null;
  return wallet as StarknetWindowObject;
}

function toWalletStandard(wallet: unknown): WalletWithStarknetFeatures {
  if (wallet && typeof wallet === "object" && "features" in wallet) {
    return wallet as WalletWithStarknetFeatures;
  }
  const swo = asStarknetWindowObject(wallet);
  if (!swo) {
    throw new Error("Ready connected but did not return a Starknet wallet object.");
  }
  return new StarknetInjectedWallet(swo);
}

export default function SelectWallet({ variant = "ctaBig" }: { variant?: "nav" | "ctaBig" }) {

  const setMyWallet = useStoreWallet(state => state.setMyStarknetWalletObject);

  const setMyWalletAccount = useStoreWallet(state => state.setMyWalletAccount);
  const myFrontendProviderIndex = useFrontendProvider(state => state.currentFrontendProviderIndex);
  const { setCurrentFrontendProviderIndex } = useFrontendProvider(state => state);

  const isConnected = useStoreWallet(state => state.isConnected);
  const setConnected = useStoreWallet(state => state.setConnected);
  const address = useStoreWallet(state => state.address);

  const setWalletApi = useStoreWallet(state => state.setWalletApiList);

  const setChain = useStoreWallet(state => state.setChain);
  const setAddressAccount = useStoreWallet(state => state.setAddressAccount);

  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string>("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [addrOpen, setAddrOpen] = useState(false);
  const [addrCopied, setAddrCopied] = useState(false);
  // Detected Starknet wallets, in render state so the picker updates as wallets register.
  const [wallets, setWallets] = useState<WalletWithStarknetFeatures[]>([]);
  const storeRef = useRef<Store | null>(null);

  // Create the discovery store once on mount so wallets have time to register
  // before the user opens the picker. eip1193Adapters:[] keeps MetaMask out entirely
  // (no EIP-6963 MetaMask bridging / Snap probing).
  useEffect(() => {
    const store: Store = createStore({ eip1193Adapters: [] });
    storeRef.current = store;
    setWallets(store.getWallets().slice() as WalletWithStarknetFeatures[]);
    const unsub = store.subscribe((next) => setWallets(next.slice() as WalletWithStarknetFeatures[]));
    return () => {
      storeRef.current = null;
      unsub();
    };
  }, []);

  // Show every detected wallet except MetaMask (its Snap probing spams an unlock popup)
  // and Braavos (excluded from this starter's picker).
  const pickable = wallets.filter((w) => {
    const id = normalizeId(w.name);
    return !id.includes("metamask") && !id.includes("braavos");
  });

  // Unchanged connection flow: takes the wallet-standard wallet and populates
  // the zustand store with a WalletAccountV6 + account/chain/permissions.
  async function handleSelectedWallet(selectedWallet: WalletWithStarknetFeatures) {
    setMyWallet(selectedWallet); // zustand
    console.log("Trying to connect wallet=", selectedWallet.name, selectedWallet);
    const myWA = await WalletAccountV6.connect(myFrontendProviders[2], selectedWallet);
    setMyWalletAccount(myWA);
    console.log("WalletAccount created=", myWA);
    const result = await walletV6.requestAccounts(selectedWallet);
    if (typeof (result) == "string") {
      console.log("This Wallet is not compatible.");
      return;
    }
    if (Array.isArray(result)) {
      const addr = validateAndParseAddress(result[0]);
      setAddressAccount(addr); // zustand
    }
    const isConnectedWallet: boolean = await walletV6.getPermissions(selectedWallet).then((res: any) => (res as WALLET_API.Permission[]).includes(WALLET_API.Permission.ACCOUNTS));
    setConnected(isConnectedWallet); // zustand
    if (isConnectedWallet) {
      const chainId = (await walletV6.requestChainId(selectedWallet)) as string;
      setChain(chainId);
      setCurrentFrontendProviderIndex(chainId === SNconstants.StarknetChainId.SN_MAIN ? 0 : 2);
      console.log("change Provider index to :", myFrontendProviderIndex);
    }
    setWalletApi(await walletV6.supportedSpecs(selectedWallet));
  }

  async function requireStrk20WalletApi(selectedWallet: WalletWithStarknetFeatures) {
    const versions = (await walletV6.supportedWalletApi(selectedWallet)).map(String);
    if (hasMinWalletApi(versions, "0.10.3")) return;
    setConnected(false);
    setAddressAccount("");
    throw new Error(
      "This Ready session does not expose Wallet API 0.10.3. Connect worked; private Pay cannot use this connector.",
    );
  }

  // Ready in-app explorer: npm starknetkit 3.4.3 still exports ArgentMobileConnector
  // (docs name: ReadyConnector). Desktop must not call this (MetaMask Snap spam).
  async function connectReadyInApp() {
    const { connect } = await import("starknetkit");
    const { ArgentMobileConnector } = await import("starknetkit/argentMobile");
    const projectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID?.trim();
    const { wallet } = await connect({
      modalMode: "canAsk",
      connectors: [
        ArgentMobileConnector.init({
          options: {
            dappName: "GhostDeal",
            url: window.location.hostname,
            ...(projectId ? { projectId } : {}),
          },
        }),
      ],
    });
    if (!wallet) {
      throw new Error("Ready in-app connect was cancelled.");
    }
    storeRef.current?._refreshInjectedWallets();
    const refreshed = (storeRef.current?.getWallets() ?? []).filter((w) => {
      const id = normalizeId(w.name);
      return !id.includes("metamask") && !id.includes("braavos");
    }) as WalletWithStarknetFeatures[];
    const selected = refreshed[0] ?? toWalletStandard(wallet);
    await handleSelectedWallet(selected);
    await requireStrk20WalletApi(selected);
  }

  // Open the wallet picker so the user can choose (Ready, Xverse, ...).
  // Inside Ready's explorer, skip the empty discovery picker and use StarknetKit.
  const openPicker = async () => {
    setError("");
    const { isInArgentMobileAppBrowser } = await import("starknetkit/argentMobile");
    if (isInArgentMobileAppBrowser()) {
      setConnecting(true);
      try {
        await connectReadyInApp();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Wallet connection failed.";
        console.log("Wallet connection failed.\n", err);
        setError(message);
        setPickerOpen(true);
      } finally {
        setConnecting(false);
      }
      return;
    }
    setPickerOpen(true);
  };

  // Connect the wallet the user picked from the modal.
  //
  // We deliberately do NOT use starknetkit's connect() here: it bundles
  // get-starknet-core, whose MetaMask detection (waitForMetaMaskProvider, retries:3)
  // repeatedly dispatches EIP-6963 discovery and probes MetaMask's Starknet Snap,
  // spamming its unlock popup. eip1193Adapters:[] above keeps MetaMask out of discovery
  // entirely, and only the picked wallet ever receives a request().
  async function selectWallet(w: WalletWithStarknetFeatures) {
    setError("");
    setConnecting(true);
    try {
      await handleSelectedWallet(w);
      setPickerOpen(false);
    } catch (err: any) {
      console.log("Wallet connection failed.\n", err);
      setError(err?.message ?? "Wallet connection failed.");
    } finally {
      setConnecting(false);
    }
  }

  const picker = pickerOpen ? (
    <div className={`${styles.modalOverlay} gdPickerOverlay`} onClick={() => !connecting && setPickerOpen(false)}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHead}>
          <span className={styles.modalTitle}>Connect a wallet</span>
          <button
            className={styles.modalClose}
            onClick={() => setPickerOpen(false)}
            aria-label="Close"
            disabled={connecting}
          >
            ×
          </button>
        </div>

        {pickable.length ? (
          <div className={styles.walletList}>
            {pickable.map((w) => (
              <button
                key={w.name}
                className={styles.walletRow}
                onClick={() => selectWallet(w)}
                disabled={connecting}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className={styles.walletIcon} src={w.icon} alt="" />
                <span className={styles.walletName}>{w.name}</span>
                <span className={styles.walletGo}>{connecting ? "…" : "→"}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className={styles.walletHint}>
            No Starknet wallet detected. Install{" "}
            <a href="https://www.ready.co/" target="_blank" rel="noreferrer">Ready</a> or{" "}
            <a href="https://www.xverse.app/" target="_blank" rel="noreferrer">Xverse</a>.
          </div>
        )}

        {error ? <div className={styles.errorText}>{error}</div> : null}
      </div>
    </div>
  ) : null;

  // Nav variant: Connect, or Disconnect plus an eye to reveal/copy the address.
  if (variant === "nav") {
    if (isConnected) {
      return (
        <div className="gdSession">
          <div className={styles.addrPill}>
            <span className={styles.addrDot} />
            <button
              type="button"
              className={styles.addrDisconnect}
              onClick={() => {
                setAddrOpen(false);
                setConnected(false);
              }}
            >
              Disconnect
            </button>
            {address ? (
              <button
                type="button"
                className={styles.addrIcon}
                aria-label={addrOpen ? "Hide address" : "Show address"}
                title={addrOpen ? "Hide address" : "Show address"}
                onClick={() => setAddrOpen((open) => !open)}
              >
                {addrOpen ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M3 3l18 18" />
                    <path d="M10.6 10.6A2 2 0 0 0 12 14a2 2 0 0 0 1.4-.6" />
                    <path d="M9.9 5.1A10.8 10.8 0 0 1 12 5c6.5 0 10 7 10 7a16.9 16.9 0 0 1-3.2 4.4" />
                    <path d="M6.1 6.1A16.8 16.8 0 0 0 2 12s3.5 7 10 7a10.4 10.4 0 0 0 4.2-.9" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            ) : null}
            {addrOpen && address ? (
              <button
                type="button"
                className={styles.addrIcon}
                aria-label={addrCopied ? "Address copied" : "Copy address"}
                title={addrCopied ? "Copied" : "Copy address"}
                onClick={async () => {
                  await navigator.clipboard.writeText(address);
                  setAddrCopied(true);
                  setTimeout(() => setAddrCopied(false), 2000);
                }}
              >
                {addrCopied ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M5 12l5 5L20 7" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="8" y="8" width="12" height="12" rx="2" />
                    <rect x="4" y="4" width="12" height="12" rx="2" />
                  </svg>
                )}
              </button>
            ) : null}
          </div>
          {addrOpen && address ? (
            <span className="gdAddrReveal">{address}</span>
          ) : null}
        </div>
      );
    }
    return (
      <>
        <button className={styles.connectPill} onClick={openPicker} disabled={connecting}>
          {connecting ? "Connecting…" : "Connect"}
        </button>
        {picker}
      </>
    );
  }

  // Default (ctaBig): the large solid connect CTA shown in the panel until a
  // wallet is connected.
  return (
    <>
      <button className={styles.btnCta} onClick={openPicker} disabled={connecting}>
        {connecting ? "Connecting…" : "Connect a Wallet"}
      </button>
      {picker}
    </>
  );
}
