import express from 'express';
import { cashuL402Middleware, loadConfig } from './integration';

const app = express();
const PORT = process.env['PORT'] ?? 3000;

app.use(express.json());

// ─── Health check ─────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'cashu-l402' });
});

// ─── Protected route (requires a valid Cashu ecash token) ─────────────────────

const config = loadConfig();

/**
 * GET /api/data
 *
 * Protected by Cashu ecash payment.
 *
 * Without credentials → 402 with payment instructions.
 * With `Authorization: Cashu <encoded_token>` → 200 on valid payment.
 *
 * Example:
 *   curl -H "Authorization: Cashu cashuA..." http://localhost:3000/api/data
 */
app.get(
  '/api/data',
  cashuL402Middleware(config),
  (_req, res) => {
    res.json({ data: 'Protected content', success: true });
  }
);

app.listen(PORT, () => {
  console.log(`cashu-l402 server running on port ${PORT}`);
  console.log(`  Mint: ${config.mintUrl}`);
  console.log(`  Required: ${config.requiredAmount} sats`);
});

export default app;
