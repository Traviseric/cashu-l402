import { describe, expect, it } from 'vitest';
import { routePayment } from '../spend-router.js';

describe('routePayment', () => {
	it('routes small amounts to cashu', () => {
		const route = routePayment({ amount: 500 });
		expect(route.backend).toBe('cashu');
		expect(route.estimatedFee).toBe(0);
	});

	it('routes large amounts to lightning', () => {
		const route = routePayment({ amount: 50_000 });
		expect(route.backend).toBe('lightning');
		expect(route.estimatedFee).toBe(500); // 1%
	});

	it('routes maximum privacy to fedimint when available', () => {
		const route = routePayment({
			amount: 1000,
			privacyLevel: 'maximum',
			availableBackends: ['cashu', 'lightning', 'fedimint'],
		});
		expect(route.backend).toBe('fedimint');
	});

	it('routes maximum privacy to cashu when fedimint unavailable', () => {
		const route = routePayment({
			amount: 1000,
			privacyLevel: 'maximum',
			availableBackends: ['cashu', 'lightning'],
		});
		expect(route.backend).toBe('cashu');
	});

	it('routes enhanced privacy to cashu', () => {
		const route = routePayment({
			amount: 50_000,
			privacyLevel: 'enhanced',
		});
		expect(route.backend).toBe('cashu');
	});

	it('falls back to lightning for standard large payments', () => {
		const route = routePayment({
			amount: 100_000,
			privacyLevel: 'standard',
		});
		expect(route.backend).toBe('lightning');
	});

	it('falls back to only available backend', () => {
		const route = routePayment({
			amount: 100,
			availableBackends: ['fedimint'],
		});
		expect(route.backend).toBe('fedimint');
	});
});
