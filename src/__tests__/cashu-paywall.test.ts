import { describe, expect, it } from 'vitest';
import {
	buildCashuChallenge,
	buildDualChallenge,
	detectPaymentMethod,
	parseCashuAuthHeader,
} from '../cashu-paywall.js';

describe('parseCashuAuthHeader', () => {
	it('extracts token from valid Cashu header', () => {
		const result = parseCashuAuthHeader('Cashu cashuAeyJ0b2tlbi...');
		expect(result).toBe('cashuAeyJ0b2tlbi...');
	});

	it('is case-insensitive', () => {
		expect(parseCashuAuthHeader('CASHU abc123')).toBe('abc123');
		expect(parseCashuAuthHeader('cashu abc123')).toBe('abc123');
	});

	it('returns null for non-Cashu headers', () => {
		expect(parseCashuAuthHeader('Bearer token123')).toBeNull();
		expect(parseCashuAuthHeader('L402 mac:preimage')).toBeNull();
	});

	it('returns null for null/empty input', () => {
		expect(parseCashuAuthHeader(null)).toBeNull();
		expect(parseCashuAuthHeader('')).toBeNull();
	});

	it('returns null for Cashu prefix with no token', () => {
		expect(parseCashuAuthHeader('Cashu ')).toBeNull();
		expect(parseCashuAuthHeader('Cashu   ')).toBeNull();
	});

	it('trims whitespace', () => {
		expect(parseCashuAuthHeader('  Cashu   token123  ')).toBe('token123');
	});
});

describe('buildCashuChallenge', () => {
	it('builds correct challenge string', () => {
		const result = buildCashuChallenge({
			priceSats: 100,
			mintUrl: 'https://mint.example.com',
		});
		expect(result).toBe('Cashu mint="https://mint.example.com", amount="100", unit="sat"');
	});

	it('includes description when provided', () => {
		const result = buildCashuChallenge({
			priceSats: 50,
			mintUrl: 'https://mint.example.com',
			description: 'Premium API access',
		});
		expect(result).toContain('description="Premium API access"');
	});

	it('uses custom unit', () => {
		const result = buildCashuChallenge({
			priceSats: 1000,
			mintUrl: 'https://mint.example.com',
			unit: 'msat',
		});
		expect(result).toContain('unit="msat"');
	});
});

describe('detectPaymentMethod', () => {
	it('detects Cashu payment', () => {
		const result = detectPaymentMethod('Cashu cashuAtoken...');
		expect(result.method).toBe('cashu');
		expect(result.token).toBe('cashuAtoken...');
	});

	it('detects L402 payment', () => {
		const result = detectPaymentMethod('L402 macaroon:preimage');
		expect(result.method).toBe('l402');
		expect(result.token).toBe('macaroon:preimage');
	});

	it('returns none for unrecognized', () => {
		expect(detectPaymentMethod('Bearer xyz')).toEqual({ method: 'none', token: null });
		expect(detectPaymentMethod(null)).toEqual({ method: 'none', token: null });
	});
});

describe('buildDualChallenge', () => {
	it('includes Cashu challenge', () => {
		const result = buildDualChallenge({ priceSats: 100, mintUrl: 'https://mint.example.com' });
		expect(result['WWW-Authenticate']).toContain('Cashu mint=');
	});

	it('includes both challenges when L402 provided', () => {
		const result = buildDualChallenge(
			{ priceSats: 100, mintUrl: 'https://mint.example.com' },
			'L402 macaroon="abc", invoice="lnbc..."',
		);
		expect(result['WWW-Authenticate']).toContain('Cashu mint=');
		expect(result['WWW-Authenticate']).toContain('L402 macaroon=');
	});
});
