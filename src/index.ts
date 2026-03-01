import express from 'express';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'cashu-l402' });
});

app.listen(PORT, () => {
  console.log(`cashu-l402 server running on port ${PORT}`);
});

export default app;
