// L402 module type definitions

export interface L402Challenge {
  macaroon: string;
  invoice: string;
  amount: number;
}

export interface L402Token {
  macaroon: string;
  preimage: string;
}

export interface L402Config {
  price: number;
  description?: string;
  expirySeconds?: number;
}
