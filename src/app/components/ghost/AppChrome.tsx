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
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/tokens/strk20.png" alt="" />
            GhostDeal
          </Link>
          <ThemeToggle />
          <div className="gdWallet">
            <SelectWallet variant="nav" />
          </div>
        </header>
        <div className="gdMain">{children}</div>
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
