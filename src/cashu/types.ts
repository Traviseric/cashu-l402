// Cashu module type definitions

import type { Proof, Token } from '@cashu/cashu-ts';

export type { Proof, Token };

export interface CashuMintQuote {
  quote: string;
  invoice: string;
}

export interface CashuRedeemResult {
  amount: number;
  valid: boolean;
  proofs: Proof[];
}

export interface CashuMintConfig {
  url: string;
  unit?: string;
}

export interface CashuToken {
  token: string;
  mint: string;
  amount: number;
  unit: string;
}
