import { describe, expect, it } from 'vitest';
import {
	detectConditions,
	extractConditionCaveats,
	parseNut10Secret,
	prevalidateCondition,
} from '../conditions.js';

describe('parseNut10Secret', () => {
	it('parses a valid P2PK secret', () => {
		const secret = JSON.stringify([
			'P2PK',
			{
				nonce: 'abc123',
				data: '02deadbeef',
				tags: [
					['sigflag', 'SIG_ALL'],
					['n_sigs', '2'],
					['pubkeys', '03aabb', '03ccdd'],
				],
			},
		]);

		const result = parseNut10Secret(secret);
		expect(result).not.toBeNull();
		expect(result!.kind).toBe('P2PK');
		expect(result!.data).toBe('02deadbeef');
		expect(result!.nonce).toBe('abc123');
		expect(result!.tags).toHaveLength(3);
	});

	it('parses a PoS (proof-of-service) secret', () => {
		const secret = JSON.stringify([
			'PoS',
			{
				nonce: 'xyz789',
				data: 'sha256hashofexpectedoutput',
				tags: [
					['pubkey', '02provider'],
					['deadline', '1709337600'],
					['refund', '02agent'],
				],
			},
		]);

		const result = parseNut10Secret(secret);
		expect(result).not.toBeNull();
		expect(result!.kind).toBe('PoS');
		expect(result!.data).toBe('sha256hashofexpectedoutput');
	});

	it('returns null for plain string secrets', () => {
		expect(parseNut10Secret('randomsecretbytes')).toBeNull();
	});

	it('returns null for invalid JSON', () => {
		expect(parseNut10Secret('not json at all')).toBeNull();
	});

	it('returns null for non-array JSON', () => {
		expect(parseNut10Secret('{"kind": "P2PK"}')).toBeNull();
	});

	it('returns null for array with wrong structure', () => {
		expect(parseNut10Secret('[123, "data"]')).toBeNull(); // kind not string
		expect(parseNut10Secret('["P2PK"]')).toBeNull(); // missing body
		expect(parseNut10Secret('["P2PK", "not-object"]')).toBeNull(); // body not object
	});

	it('handles missing tags gracefully', () => {
		const secret = JSON.stringify(['P2PK', { nonce: 'a', data: 'b' }]);
		const result = parseNut10Secret(secret);
		expect(result).not.toBeNull();
		expect(result!.tags).toEqual([]);
	});
});

describe('detectConditions', () => {
	it('detects P2PK with multisig and locktime', () => {
		const secret = JSON.stringify([
			'P2PK',
			{
				nonce: 'test',
				data: '02buyer',
				tags: [
					['pubkeys', '02seller', '02arbitrator'],
					['n_sigs', '2'],
					['locktime', '1709337600'],
					['refund', '02buyer'],
					['sigflag', 'SIG_ALL'],
				],
			},
		]);

		const result = detectConditions({ secret });
		expect(result).not.toBeNull();
		expect(result!.kind).toBe('P2PK');
		expect(result!.nSigs).toBe(2);
		expect(result!.pubkeys).toEqual(['02seller', '02arbitrator']);
		expect(result!.locktime).toBe(1709337600);
		expect(result!.refundKeys).toEqual(['02buyer']);
		expect(result!.sigAll).toBe(true);
	});

	it('detects PoS condition', () => {
		const secret = JSON.stringify([
			'PoS',
			{
				nonce: 'test',
				data: 'outputhash',
				tags: [['deadline', '1709337600']],
			},
		]);

		const result = detectConditions({ secret });
		expect(result).not.toBeNull();
		expect(result!.kind).toBe('PoS');
		expect(result!.data).toBe('outputhash');
	});

	it('returns null for unconditional proofs', () => {
		expect(detectConditions({ secret: 'plaintext-secret' })).toBeNull();
	});
});

describe('extractConditionCaveats', () => {
	it('extracts caveats from P2PK with locktime', () => {
		const conditions = detectConditions({
			secret: JSON.stringify([
				'P2PK',
				{
					nonce: 'test',
					data: '02key',
					tags: [
						['locktime', String(Math.floor(Date.now() / 1000) + 3600)],
						['n_sigs', '2'],
					],
				},
			]),
		})!;

		const caveats = extractConditionCaveats(conditions);
		expect(caveats.find((c) => c.key === 'condition_kind')?.value).toBe('P2PK');
		expect(caveats.find((c) => c.key === 'locktime')).toBeTruthy();
		expect(caveats.find((c) => c.key === 'max_ttl_seconds')).toBeTruthy();
		expect(caveats.find((c) => c.key === 'n_sigs')?.value).toBe('2');
	});

	it('extracts PoS-specific caveats', () => {
		const conditions = detectConditions({
			secret: JSON.stringify([
				'PoS',
				{
					nonce: 'test',
					data: 'servicehash123',
					tags: [['deadline', '1709337600']],
				},
			]),
		})!;

		const caveats = extractConditionCaveats(conditions);
		expect(caveats.find((c) => c.key === 'service_hash')?.value).toBe('servicehash123');
		expect(caveats.find((c) => c.key === 'deadline')?.value).toBe('1709337600');
	});
});

describe('prevalidateCondition', () => {
	it('returns valid for unconditional proofs', () => {
		const result = prevalidateCondition({ secret: 'plain-secret' });
		expect(result.valid).toBe(true);
	});

	it('returns valid for future locktime', () => {
		const futureTime = Math.floor(Date.now() / 1000) + 3600;
		const secret = JSON.stringify([
			'P2PK',
			{
				nonce: 'test',
				data: '02key',
				tags: [['locktime', String(futureTime)]],
			},
		]);

		const result = prevalidateCondition({ secret });
		expect(result.valid).toBe(true);
		expect(result.expired).toBe(false);
		expect(result.remainingSeconds).toBeGreaterThan(3500);
	});

	it('returns invalid for expired locktime', () => {
		const pastTime = Math.floor(Date.now() / 1000) - 3600;
		const secret = JSON.stringify([
			'P2PK',
			{
				nonce: 'test',
				data: '02key',
				tags: [['locktime', String(pastTime)]],
			},
		]);

		const result = prevalidateCondition({ secret });
		expect(result.valid).toBe(false);
		expect(result.expired).toBe(true);
		expect(result.error).toContain('expired');
	});

	it('accepts custom currentTime for mint time calibration', () => {
		const locktime = 1709337600;
		const secret = JSON.stringify([
			'P2PK',
			{
				nonce: 'test',
				data: '02key',
				tags: [['locktime', String(locktime)]],
			},
		]);

		// Before locktime
		const beforeResult = prevalidateCondition({ secret }, locktime - 100);
		expect(beforeResult.valid).toBe(true);
		expect(beforeResult.remainingSeconds).toBe(100);

		// After locktime
		const afterResult = prevalidateCondition({ secret }, locktime + 100);
		expect(afterResult.valid).toBe(false);
		expect(afterResult.expired).toBe(true);
	});

	it('returns valid for conditions without locktime', () => {
		const secret = JSON.stringify([
			'P2PK',
			{
				nonce: 'test',
				data: '02key',
				tags: [['sigflag', 'SIG_ALL']],
			},
		]);

		const result = prevalidateCondition({ secret });
		expect(result.valid).toBe(true);
	});
});
