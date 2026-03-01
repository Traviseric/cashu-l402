// L402 module type definitions

export interface L402Challenge {
  macaroon: string;
  invoice: string;
  amount: number;
}

export interface L402Credentials {
  macaroon: string;
  preimage: string;
}

export interface MacaroonData {
  paymentHash: string;
  amount: number;
  expiry: number;  // Unix timestamp
}

export interface L402Token {
  macaroon: string;
  preimage: string;
}

export interface L402Config {
  price: number;  // sats
  description?: string;
  expirySeconds?: number;
  /** Server secret used to sign/verify macaroons. Falls back to L402_SECRET env var. */
  secret?: string;
  /** Async function to generate a Lightning invoice and return its payment hash. */
  generateInvoice: (amount: number, description?: string) => Promise<{ invoice: string; paymentHash: string }>;
  /** Async function to verify that preimage satisfies paymentHash (sha256(preimage) == paymentHash). */
  verifyPayment?: (paymentHash: string, preimage: string) => Promise<boolean>;
}
