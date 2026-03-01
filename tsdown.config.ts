import { defineConfig } from 'tsdown';

export default defineConfig({
	entry: ['src/index.ts'],
	format: ['esm', 'cjs'],
	outDir: 'dist',
	dts: true,
	sourcemap: true,
	clean: true,
	external: ['@cashu/cashu-ts', '@noble/curves', '@noble/hashes', 'zod'],
});
