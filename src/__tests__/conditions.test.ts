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

	it('returns null for secrets longer than 10,000 characters', () => {
		const oversized = JSON.stringify([
			'P2PK',
			{ nonce: 'a', data: 'b'.repeat(10_000), tags: [] },
		]);
		expect(oversized.length).toBeGreaterThan(10_000);
		expect(parseNut10Secret(oversized)).toBeNull();
	});

	it('filters out tag entries that are not arrays', () => {
		const secret = JSON.stringify([
			'P2PK',
			{
				nonce: 'a',
				data: 'b',
				tags: [
					['sigflag', 'SIG_ALL'], // valid
					'not-an-array', // invalid — not array
					123, // invalid — not array
					null, // invalid — not array
				],
			},
		]);
		const result = parseNut10Secret(secret);
		expect(result).not.toBeNull();
		expect(result!.tags).toHaveLength(1);
		expect(result!.tags[0]).toEqual(['sigflag', 'SIG_ALL']);
	});

	it('filters out tag arrays containing non-string elements', () => {
		const secret = JSON.stringify([
			'P2PK',
			{
				nonce: 'a',
				data: 'b',
				tags: [
					['sigflag', 'SIG_ALL'], // valid
					[123, null, {}], // invalid — elements not strings
					['n_sigs', 2], // invalid — element is number not string
				],
			},
		]);
		const result = parseNut10Secret(secret);
		expect(result).not.toBeNull();
		expect(result!.tags).toHaveLength(1);
		expect(result!.tags[0]).toEqual(['sigflag', 'SIG_ALL']);
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

	it('correctly handles locktime=0 (already expired, not undefined)', () => {
		const secret = JSON.stringify([
			'P2PK',
			{ nonce: 'n', data: 'd', tags: [['locktime', '0']] },
		]);
		const result = detectConditions({ secret });
		expect(result).not.toBeNull();
		expect(result!.locktime).toBe(0);
	});

	it('returns undefined locktime for negative or NaN values', () => {
		const negSecret = JSON.stringify([
			'P2PK',
			{ nonce: 'n', data: 'd', tags: [['locktime', '-1']] },
		]);
		expect(detectConditions({ secret: negSecret })!.locktime).toBeUndefined();

		const nanSecret = JSON.stringify([
			'P2PK',
			{ nonce: 'n', data: 'd', tags: [['locktime', 'notanumber']] },
		]);
		expect(detectConditions({ secret: nanSecret })!.locktime).toBeUndefined();
	});

	it('returns undefined n_sigs for zero (not meaningful)', () => {
		const secret = JSON.stringify([
			'P2PK',
			{ nonce: 'n', data: 'd', tags: [['n_sigs', '0']] },
		]);
		expect(detectConditions({ secret })!.nSigs).toBeUndefined();
	});

	it('correctly handles n_sigs=1', () => {
		const secret = JSON.stringify([
			'P2PK',
			{ nonce: 'n', data: 'd', tags: [['n_sigs', '1']] },
		]);
		expect(detectConditions({ secret })!.nSigs).toBe(1);
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

describe('detectConditions — HTLC', () => {
	const htlcHash = 'a'.repeat(64); // 64-char hex hash

	it('detects HTLC kind and stores hash in data field', () => {
		const secret = JSON.stringify([
			'HTLC',
			{
				nonce: 'abc123',
				data: htlcHash,
				tags: [],
			},
		]);

		const result = detectConditions({ secret });
		expect(result).not.toBeNull();
		expect(result!.kind).toBe('HTLC');
		expect(result!.data).toBe(htlcHash);
	});

	it('extracts locktime from HTLC timelock tag', () => {
		const locktime = Math.floor(Date.now() / 1000) + 7200;
		const secret = JSON.stringify([
			'HTLC',
			{
				nonce: 'nonce1',
				data: htlcHash,
				tags: [['locktime', String(locktime)]],
			},
		]);

		const result = detectConditions({ secret });
		expect(result).not.toBeNull();
		expect(result!.kind).toBe('HTLC');
		expect(result!.locktime).toBe(locktime);
	});

	it('extracts refund keys from HTLC refund tag', () => {
		const secret = JSON.stringify([
			'HTLC',
			{
				nonce: 'nonce2',
				data: htlcHash,
				tags: [['refund', '02refundkey1', '02refundkey2']],
			},
		]);

		const result = detectConditions({ secret });
		expect(result).not.toBeNull();
		expect(result!.refundKeys).toEqual(['02refundkey1', '02refundkey2']);
	});
});

describe('extractConditionCaveats — HTLC', () => {
	const htlcHash = 'b'.repeat(64);

	it('includes condition_kind caveat for HTLC', () => {
		const secret = JSON.stringify([
			'HTLC',
			{ nonce: 'n1', data: htlcHash, tags: [] },
		]);
		const conditions = detectConditions({ secret })!;
		const caveats = extractConditionCaveats(conditions);

		expect(caveats.find((c) => c.key === 'condition_kind')?.value).toBe('HTLC');
	});

	it('adds locktime and max_ttl_seconds caveats when HTLC has timelock', () => {
		const futureTime = Math.floor(Date.now() / 1000) + 3600;
		const secret = JSON.stringify([
			'HTLC',
			{
				nonce: 'n2',
				data: htlcHash,
				tags: [['locktime', String(futureTime)]],
			},
		]);
		const conditions = detectConditions({ secret })!;
		const caveats = extractConditionCaveats(conditions);

		expect(caveats.find((c) => c.key === 'locktime')).toBeTruthy();
		expect(caveats.find((c) => c.key === 'max_ttl_seconds')).toBeTruthy();
	});

	it('does not add locktime caveats when HTLC has no timelock', () => {
		const secret = JSON.stringify([
			'HTLC',
			{ nonce: 'n3', data: htlcHash, tags: [] },
		]);
		const conditions = detectConditions({ secret })!;
		const caveats = extractConditionCaveats(conditions);

		expect(caveats.find((c) => c.key === 'locktime')).toBeUndefined();
		expect(caveats.find((c) => c.key === 'max_ttl_seconds')).toBeUndefined();
	});
});

describe('prevalidateCondition — HTLC', () => {
	const htlcHash = 'c'.repeat(64);

	it('returns valid for HTLC with future locktime', () => {
		const futureTime = Math.floor(Date.now() / 1000) + 3600;
		const secret = JSON.stringify([
			'HTLC',
			{
				nonce: 'n4',
				data: htlcHash,
				tags: [['locktime', String(futureTime)]],
			},
		]);

		const result = prevalidateCondition({ secret });
		expect(result.valid).toBe(true);
		expect(result.expired).toBe(false);
		expect(result.remainingSeconds).toBeGreaterThan(3500);
	});

	it('returns invalid for HTLC with expired locktime', () => {
		const pastTime = Math.floor(Date.now() / 1000) - 600;
		const secret = JSON.stringify([
			'HTLC',
			{
				nonce: 'n5',
				data: htlcHash,
				tags: [['locktime', String(pastTime)]],
			},
		]);

		const result = prevalidateCondition({ secret });
		expect(result.valid).toBe(false);
		expect(result.expired).toBe(true);
		expect(result.error).toContain('expired');
	});

	it('returns valid for HTLC without locktime (hash-only lock)', () => {
		const secret = JSON.stringify([
			'HTLC',
			{ nonce: 'n6', data: htlcHash, tags: [] },
		]);

		const result = prevalidateCondition({ secret });
		expect(result.valid).toBe(true);
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
