"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ClientStellarSigner } from "@x402/stellar";
import { connectFreighterWallet, shortenAddress } from "./freighter";
import { buildWalletOpenPaymentHeader } from "./x402-open";

export interface SessionSettlement {
  settledAmount: string;
  refundedAmount: string;
  escrowAmount: string;
  settleTx: string;
  explorerUrl: string;
  tokenSymbol: string;
  sessionCalls: number;
  sessionBillable: string;
}

interface WalletState {
  address: string | null;
  shortAddress: string | null;
  signer: ClientStellarSigner | null;
  connecting: boolean;
  settling: boolean;
  sessionOpen: boolean;
  lastSettlement: SessionSettlement | null;
  error: string | null;
  connect: () => Promise<void>;
  openSession: () => Promise<void>;
  settleSession: () => Promise<SessionSettlement>;
}

const WalletContext = createContext<WalletState | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [signer, setSigner] = useState<ClientStellarSigner | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [settling, setSettling] = useState(false);
  const [sessionOpen, setSessionOpen] = useState(false);
  const [lastSettlement, setLastSettlement] = useState<SessionSettlement | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshSession = useCallback(async () => {
    try {
      const res = await fetch("/api/chat", { cache: "no-store" });
      const data = (await res.json()) as { ok?: boolean };
      setSessionOpen(Boolean(data.ok));
    } catch {
      setSessionOpen(false);
    }
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      const wallet = await connectFreighterWallet();
      setAddress(wallet.address);
      setSigner(wallet.signer);
      await refreshSession();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to connect wallet";
      setError(msg);
      setAddress(null);
      setSigner(null);
      throw err;
    } finally {
      setConnecting(false);
    }
  }, [refreshSession]);

  const openSession = useCallback(async () => {
    let activeSigner = signer;
    let activeAddress = address;
    if (!activeSigner || !activeAddress) {
      const wallet = await connectFreighterWallet();
      activeSigner = wallet.signer;
      activeAddress = wallet.address;
      setAddress(wallet.address);
      setSigner(wallet.signer);
    }

    const prepareRes = await fetch("/api/session/prepare", { cache: "no-store" });
    const prepared = (await prepareRes.json()) as {
      ok?: boolean;
      error?: string;
      providerUrl?: string;
      channelId?: string;
      consumerPublicKey?: { x: string; y: string };
      rate?: string;
      escrow?: string;
    };
    if (!prepareRes.ok || !prepared.ok || !prepared.providerUrl || !prepared.channelId) {
      throw new Error(prepared.error ?? "Failed to prepare metered channel");
    }

    const paymentHeader = await buildWalletOpenPaymentHeader(
      prepared.providerUrl,
      activeSigner,
      {
        channelId: prepared.channelId,
        consumerPublicKey: prepared.consumerPublicKey!,
        rate: prepared.rate!,
        escrow: prepared.escrow!,
      },
    );

    const res = await fetch("/api/session/open", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ paymentHeader, walletAddress: activeAddress }),
    });
    const data = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !data.ok) {
      throw new Error(data.error ?? `Failed to open session (${res.status})`);
    }
    setLastSettlement(null);
    setSessionOpen(true);
    await refreshSession();
  }, [address, refreshSession, signer]);

  const settleSession = useCallback(async (): Promise<SessionSettlement> => {
    setSettling(true);
    setError(null);
    try {
      const res = await fetch("/api/session/settle", { method: "POST" });
      const data = (await res.json()) as SessionSettlement & { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? `Settlement failed (${res.status})`);
      }
      const settlement: SessionSettlement = {
        settledAmount: data.settledAmount,
        refundedAmount: data.refundedAmount,
        escrowAmount: data.escrowAmount,
        settleTx: data.settleTx,
        explorerUrl: data.explorerUrl,
        tokenSymbol: data.tokenSymbol,
        sessionCalls: data.sessionCalls,
        sessionBillable: data.sessionBillable,
      };
      setLastSettlement(settlement);
      setSessionOpen(false);
      return settlement;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Settlement failed";
      setError(msg);
      throw err;
    } finally {
      setSettling(false);
    }
  }, []);

  const value = useMemo<WalletState>(
    () => ({
      address,
      shortAddress: address ? shortenAddress(address) : null,
      signer,
      connecting,
      settling,
      sessionOpen,
      lastSettlement,
      error,
      connect,
      openSession,
      settleSession,
    }),
    [
      address,
      connect,
      connecting,
      error,
      lastSettlement,
      openSession,
      sessionOpen,
      settleSession,
      settling,
      signer,
    ],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext);
  if (ctx === null) {
    throw new Error("useWallet must be used within WalletProvider");
  }
  return ctx;
}
