const TESTNET_KEY_URL = "https://channels.openzeppelin.com/testnet/gen";

/** Resolve the OpenZeppelin facilitator API key from env or the public testnet generator. */
export async function resolveFacilitatorApiKey(
  env: NodeJS.ProcessEnv = process.env,
): Promise<string | undefined> {
  const fromEnv = env.X402_FACILITATOR_API_KEY?.trim();
  if (fromEnv) return fromEnv;

  try {
    const response = await fetch(TESTNET_KEY_URL);
    if (!response.ok) return undefined;
    const body = (await response.json()) as { apiKey?: string };
    const apiKey = body.apiKey?.trim();
    return apiKey || undefined;
  } catch {
    return undefined;
  }
}
