"use client";

import { useWallet } from "../../lib/wallet-context";

export default function Topbar({ section }: { section: string }) {
  const wallet = useWallet();

  return (
    <header className="dash-top">
      <span className="crumbs">
        Dashboard / <b>{section}</b>
      </span>
      <span className="spacer" />
      <button
        type="button"
        className="dash-wallet"
        disabled={wallet.connecting}
        onClick={() => {
          if (wallet.address && !wallet.sessionOpen) {
            void wallet.openSession().catch(() => undefined);
            return;
          }
          if (!wallet.address) {
            void wallet.connect().catch(() => undefined);
          }
        }}
        title={
          wallet.sessionOpen
            ? "Metered channel open"
            : wallet.address
              ? "Pay x402 channel-open fee and start session"
              : "Connect Freighter wallet"
        }
      >
        <span className={`pip${wallet.sessionOpen ? " pip-live" : ""}`} />
        {wallet.connecting
          ? "Connecting…"
          : wallet.sessionOpen && wallet.shortAddress
            ? wallet.shortAddress
            : wallet.shortAddress
              ? `${wallet.shortAddress} · open channel`
              : "Connect wallet"}
      </button>
    </header>
  );
}
