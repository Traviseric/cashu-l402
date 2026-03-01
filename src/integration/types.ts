// Integration layer type definitions

export interface IntegrationConfig {
  mintUrl: string;
  price: number;
  unit?: string;
}

export interface CashuPaymentChallenge {
  error: string;
  paymentMethods: {
    cashu: {
      mintUrl: string;
      amount: number;
    };
  };
}
