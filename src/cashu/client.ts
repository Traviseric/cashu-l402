import { CashuMint, CashuWallet, getEncodedToken, getDecodedToken } from '@cashu/cashu-ts';
import type { Proof } from '@cashu/cashu-ts';
import type { CashuMintQuote, CashuRedeemResult } from './types';
import { validateToken } from './validation';

/**
 * CashuClient wraps the cashu-ts wallet to provide a simplified interface
 * for mint quote creation, token minting, and token redemption.
 */
export class CashuClient {
  private wallet: CashuWallet;
  readonly mintUrl: string;

  constructor(mintUrl: string, unit = 'sat') {
    const mint = new CashuMint(mintUrl);
    this.wallet = new CashuWallet(mint, { unit });
    this.mintUrl = mintUrl;
  }

  /**
   * Request a Lightning invoice to mint tokens of the given amount.
   * The invoice must be paid before calling mintTokens().
   */
  async getMintQuote(amount: number): Promise<CashuMintQuote> {
    const quote = await this.wallet.createMintQuote(amount);
    return {
      quote: quote.quote,
      invoice: quote.request,
    };
  }

  /**
   * After the Lightning invoice from getMintQuote() has been paid,
   * mint proofs and return them as an encoded token string.
   */
  async mintTokens(amount: number, quoteId: string): Promise<string> {
    const proofs = await this.wallet.mintProofs(amount, quoteId);
    return getEncodedToken({
      mint: this.mintUrl,
      proofs,
    });
  }

  /**
   * Receive (redeem) a Cashu token by swapping the proofs with the mint.
   * This atomically invalidates the presented proofs (preventing double-spend)
   * and issues fresh proofs to this wallet.
   *
   * @throws if the token is malformed, the proofs are already spent, or the mint is unreachable
   */
  async redeemToken(encodedToken: string): Promise<CashuRedeemResult> {
    // Decode first to get amount before network call
    const decoded = getDecodedToken(encodedToken);
    const inputAmount = decoded.proofs.reduce((sum: number, p: Proof) => sum + p.amount, 0);

    // wallet.receive swaps the proofs — on success the originals are spent
    const newProofs = await this.wallet.receive(encodedToken);
    const receivedAmount = newProofs.reduce((sum: number, p: Proof) => sum + p.amount, 0);

    return {
      amount: receivedAmount || inputAmount,
      valid: true,
      proofs: newProofs,
    };
  }

  /**
   * Validates a token's format and optionally checks it against trusted mints.
   * Does NOT contact the mint — use redeemToken() for spend verification.
   */
  validateToken(encodedToken: string, trustedMints?: string[]) {
    return validateToken(encodedToken, trustedMints);
  }
}
