const TESTNET_PASSPHRASE = "Test SDF Network ; September 2015";
const PUBLIC_PASSPHRASE = "Public Global Stellar Network ; September 2015";

export type StellarExplorerNetwork = "testnet" | "public";

/** Map a Stellar network passphrase to the slug StellarExpert uses in URLs. */
export function stellarExplorerNetwork(
  networkPassphrase: string,
): StellarExplorerNetwork | undefined {
  if (networkPassphrase === TESTNET_PASSPHRASE) return "testnet";
  if (networkPassphrase === PUBLIC_PASSPHRASE) return "public";
  return undefined;
}

/** Link to a transaction on StellarExpert (undefined for unknown networks). */
export function stellarExplorerTxUrl(
  txHash: string,
  networkPassphrase: string,
): string | undefined {
  const network = stellarExplorerNetwork(networkPassphrase);
  if (!network) return undefined;
  return `https://stellar.expert/explorer/${network}/tx/${txHash}`;
}

/** Link to a Soroban contract on StellarExpert (undefined for unknown networks). */
export function stellarExplorerContractUrl(
  contractId: string,
  networkPassphrase: string,
): string | undefined {
  const network = stellarExplorerNetwork(networkPassphrase);
  if (!network) return undefined;
  return `https://stellar.expert/explorer/${network}/contract/${contractId}`;
}

/** Link to a classic or Soroban account on StellarExpert (undefined for unknown networks). */
export function stellarExplorerAccountUrl(
  address: string,
  networkPassphrase: string,
): string | undefined {
  const network = stellarExplorerNetwork(networkPassphrase);
  if (!network) return undefined;
  return `https://stellar.expert/explorer/${network}/account/${address}`;
}
