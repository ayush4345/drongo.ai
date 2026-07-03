"use client";

import {
  getAddress,
  getNetworkDetails,
  isConnected,
  requestAccess,
  signAuthEntry as freighterSignAuthEntry,
} from "@stellar/freighter-api";
import { xdr } from "@stellar/stellar-sdk";
import type { ClientStellarSigner } from "@x402/stellar";
import { STELLAR_TESTNET_CAIP2 } from "@x402/stellar";

function entryToXdr(entry: xdr.SorobanAuthorizationEntry | string): string {
  return typeof entry === "string" ? entry : entry.toXDR("base64");
}

/** Freighter-backed signer implementing the x402 Stellar client interface. */
export function createFreighterX402Signer(address: string, networkPassphrase: string): ClientStellarSigner {
  return {
    address,
    async signAuthEntry(authEntry, opts) {
      const entryXdr = entryToXdr(authEntry);
      const result = await freighterSignAuthEntry(entryXdr, {
        address: opts?.address ?? address,
        networkPassphrase: opts?.networkPassphrase ?? networkPassphrase,
      });
      if (result.error) {
        throw new Error(result.error.message ?? "Freighter rejected auth entry signing");
      }
      if (!result.signedAuthEntry) {
        throw new Error("Freighter returned no signed auth entry");
      }
      return {
        signedAuthEntry: result.signedAuthEntry,
        signerAddress: result.signerAddress || address,
      };
    },
  };
}

export async function connectFreighterWallet(): Promise<{
  address: string;
  networkPassphrase: string;
  signer: ClientStellarSigner;
}> {
  const connected = await isConnected();
  if (!connected.isConnected) {
    const access = await requestAccess();
    if (access.error) {
      throw new Error(access.error.message ?? "Freighter access denied");
    }
  }

  const { address, error: addressError } = await getAddress();
  if (addressError) throw new Error(addressError.message ?? "Failed to read Freighter address");
  if (!address) throw new Error("Freighter returned an empty address");

  const network = await getNetworkDetails();
  if (network.error) throw new Error(network.error.message ?? "Failed to read Freighter network");
  if (!network.networkPassphrase) {
    throw new Error("Switch Freighter to Stellar testnet before connecting");
  }

  return {
    address,
    networkPassphrase: network.networkPassphrase,
    signer: createFreighterX402Signer(address, network.networkPassphrase),
  };
}

export function shortenAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-6)}`;
}

export { STELLAR_TESTNET_CAIP2 };
