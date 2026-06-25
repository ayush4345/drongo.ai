"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string; icon: React.ReactNode };

const ICON = {
  overview: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  ),
  agents: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19a5.5 5.5 0 0111 0" />
      <path d="M16 6.5a3 3 0 010 5.8M17 19a5.5 5.5 0 00-3-4.9" />
    </svg>
  ),
  usage: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12h3l2.5 6 4-13L17 12h4" />
    </svg>
  ),
  channels: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="6" cy="7" r="2.5" />
      <circle cx="18" cy="17" r="2.5" />
      <path d="M6 9.5V14a3 3 0 003 3h6" />
    </svg>
  ),
};

const ITEMS: Item[] = [
  { href: "/dashboard", label: "Overview", icon: ICON.overview },
  { href: "/dashboard/agents", label: "Agents", icon: ICON.agents },
  { href: "/dashboard/usage", label: "Live usage", icon: ICON.usage },
  { href: "/dashboard/channels", label: "Channels", icon: ICON.channels },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="dash-side">
      <Link href="/" className="dash-brand">
        <span className="mark" />
        Drongo <span className="x">AI</span>
      </Link>

      <nav className="dash-nav">
        {ITEMS.map((it) => {
          const active =
            it.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(it.href);
          return (
            <Link key={it.href} href={it.href} className={active ? "active" : ""}>
              {it.icon}
              {it.label}
            </Link>
          );
        })}
      </nav>

      <div className="dash-side-foot">
        <span className="dash-net">
          <span className="pip" />
          Stellar testnet
        </span>
        <Link href="/" className="dash-back">
          ← Back to site
        </Link>
      </div>
    </aside>
  );
}
