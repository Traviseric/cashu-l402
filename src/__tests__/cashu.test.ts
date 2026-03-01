import { CashuClient } from '../cashu/client';
import { validateToken } from '../cashu/validation';
import { CashuMint, CashuWallet } from '@cashu/cashu-ts';

// Mock the cashu-ts library to avoid real network calls
jest.mock('@cashu/cashu-ts', () => ({
  CashuMint: jest.fn(),
  CashuWallet: jest.fn().mockImplementation(() => ({
    createMintQuote: jest.fn().mockResolvedValue({
      quote: 'test-quote-id-123',
      request: 'lnbc100n1pj...',
    }),
    mintProofs: jest.fn().mockResolvedValue([
      { id: 'keyset1', amount: 8, secret: 'secret1', C: 'point1' },
      { id: 'keyset1', amount: 2, secret: 'secret2', C: 'point2' },
    ]),
    receive: jest.fn().mockResolvedValue([
      { id: 'keyset1', amount: 10, secret: 'new_secret', C: 'new_point' },
    ]),
  })),
  getEncodedToken: jest.fn().mockReturnValue('cashuAeyJ0...'),
  getDecodedToken: jest.fn().mockReturnValue({
    mint: 'https://mint.example.com',
    proofs: [
      { id: 'keyset1', amount: 10, secret: 'secret1', C: 'point1' },
    ],
  }),
  getTokenMetadata: jest.fn().mockReturnValue({
    mint: 'https://mint.example.com',
    amount: 10,
    unit: 'sat',
  }),
}));

const MOCK_MINT_URL = 'https://mint.example.com';

describe('CashuClient', () => {
  let client: CashuClient;

  beforeEach(() => {
    jest.clearAllMocks();
    client = new CashuClient(MOCK_MINT_URL);
  });

  it('should instantiate with a mint URL', () => {
    expect(client).toBeInstanceOf(CashuClient);
    expect(client.mintUrl).toBe(MOCK_MINT_URL);
    expect(CashuMint).toHaveBeenCalledWith(MOCK_MINT_URL);
    expect(CashuWallet).toHaveBeenCalled();
  });

  describe('getMintQuote', () => {
    it('should request a mint quote and return a Lightning invoice', async () => {
      const result = await client.getMintQuote(10);

      expect(result).toHaveProperty('quote');
      expect(result).toHaveProperty('invoice');
      expect(result.quote).toBe('test-quote-id-123');
      expect(result.invoice).toBe('lnbc100n1pj...');
    });

    it('should pass the amount to createMintQuote', async () => {
      const walletInstance = (CashuWallet as jest.Mock).mock.results[0].value;
      await client.getMintQuote(100);
      expect(walletInstance.createMintQuote).toHaveBeenCalledWith(100);
    });
  });

  describe('mintTokens', () => {
    it('should mint proofs and return an encoded token', async () => {
      const token = await client.mintTokens(10, 'test-quote-id-123');
      expect(typeof token).toBe('string');
      expect(token).toBeTruthy();
    });
  });

  describe('redeemToken', () => {
    it('should redeem a valid token and return amount and proofs', async () => {
      const result = await client.redeemToken('cashuAeyJ0...');

      expect(result.valid).toBe(true);
      expect(result.amount).toBe(10);
      expect(result.proofs).toHaveLength(1);
    });

    it('should throw for a malformed token', async () => {
      const { getDecodedToken } = require('@cashu/cashu-ts');
      (getDecodedToken as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Invalid token format');
      });

      await expect(client.redeemToken('not-a-valid-token')).rejects.toThrow();
    });
  });

  describe('validateToken (offline)', () => {
    it('should validate a well-formed token', () => {
      const result = client.validateToken('cashuAeyJ0...');
      expect(result.valid).toBe(true);
      expect(result.amount).toBe(10);
      expect(result.mint).toBe(MOCK_MINT_URL);
    });

    it('should reject a token from an untrusted mint', () => {
      const result = client.validateToken('cashuAeyJ0...', ['https://other-mint.com']);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('not in the trusted mints list');
    });
  });
});

describe('validateToken (standalone)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const { getTokenMetadata, getDecodedToken } = require('@cashu/cashu-ts');
    (getTokenMetadata as jest.Mock).mockReturnValue({
      mint: 'https://mint.example.com',
      amount: 10,
      unit: 'sat',
    });
    (getDecodedToken as jest.Mock).mockReturnValue({
      mint: 'https://mint.example.com',
      proofs: [{ id: 'k', amount: 10, secret: 's', C: 'c' }],
    });
  });

  it('should reject an empty string', () => {
    const result = validateToken('');
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('should reject a token not starting with "cashu"', () => {
    const result = validateToken('lnbc1abc...');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('"cashu"');
  });

  it('should reject tokens from untrusted mints', () => {
    const result = validateToken('cashuAeyJ0...', ['https://trusted.mint.com']);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('not in the trusted mints list');
  });

  it('should accept tokens from trusted mints (trailing slash insensitive)', () => {
    const result = validateToken('cashuAeyJ0...', ['https://mint.example.com/']);
    expect(result.valid).toBe(true);
  });

  it('should reject when getTokenMetadata throws', () => {
    const { getTokenMetadata } = require('@cashu/cashu-ts');
    (getTokenMetadata as jest.Mock).mockImplementationOnce(() => {
      throw new Error('bad token');
    });
    const result = validateToken('cashuAinvalid');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('invalid format');
  });
});
