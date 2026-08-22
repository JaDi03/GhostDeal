"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import SelectWallet from "../client/WalletHandle/SelectWallet";
import ThemeToggle from "./ThemeToggle";
import { useStoreWallet } from "../Wallet/walletContext";

const GUEST_TABS = [{ href: "/", label: "Home" }];

const CONNECTED_TABS = [
  { href: "/", label: "Home" },
  { href: "/sell", label: "Sell" },
  { href: "/deals", label: "Deals" },
];

export default function AppChrome({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const isConnected = useStoreWallet((s) => s.isConnected);
  const tabs = isConnected ? CONNECTED_TABS : GUEST_TABS;

  return (
    <div className="gd">
      <div className="gdShell">
        <header className="gdHeader">
          <Link href="/" className="gdBrand">
            Ghost<span className="gdBrandAccent">Deal</span>
          </Link>
          <ThemeToggle />
          <div className="gdWallet">
            <SelectWallet variant="nav" />
          </div>
        </header>
        <div className="gdMain">{children}</div>
        <a
          className="gdPowered"
          href="https://strk20.starknet.io"
          target="_blank"
          rel="noreferrer"
        >
          Powered by
          <span className="gdStrk20Mark" aria-label="STRK20">
            STRK<span className="gdBrandAccent">[20]</span>
          </span>
        </a>
        <nav className="gdBottom" aria-label="Primary">
          {tabs.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className={path === t.href ? "gdTab gdTabOn" : "gdTab"}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
