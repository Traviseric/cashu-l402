// Cashu module type definitions

export interface CashuToken {
  token: string;
  mint: string;
  amount: number;
  unit: string;
}

export interface CashuMintConfig {
  url: string;
  unit?: string;
}
