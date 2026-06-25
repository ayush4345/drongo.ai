import type { X402PaymentTerms } from "@slate/protocol";

export type AgentCard = {
  name: string;
  description: string;
  url: string;
  skills: string[];
  extensions: Array<
    Pick<X402PaymentTerms, "network" | "scheme"> & {
      uri: string;
      paymentRequiredPath: string;
    }
  >;
};

export function buildAgentCard(baseUrl = "http://localhost:4021"): AgentCard {
  return {
    name: "ShadowMeter Provider",
    description: "Metered paid agent calls using x402 channel opening and vouchers.",
    url: baseUrl,
    skills: ["metered paid agent calls"],
    extensions: [
      {
        uri: "https://github.com/coinbase/x402",
        network: "stellar:testnet",
        scheme: "exact",
        paymentRequiredPath: "/agent/open",
      },
    ],
  };
}
