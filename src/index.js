require('dotenv').config();

const express = require('express');
const { adapter } = require('./bot');
const zammadRouter = require('./routes/zammad');
const approveRouter = require('./routes/approve');

const app = express();
const port = process.env.PORT || 3000;

process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled promise rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[FATAL] Uncaught exception:', error);
});

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    }
  })
);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/messages', (req, res) => {
  adapter
    .process(req, res, async (context) => {
      const bot = require('./bot').bot;
      await bot.run(context);
    })
    .catch((error) => {
      console.error('[ERROR] /api/messages processing failed:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Bot processing failed' });
      }
    });
});

app.use('/api/zammad', zammadRouter);
app.use('/api/approve', approveRouter);

app.use((err, _req, res, _next) => {
  console.error('[ERROR] Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(port, () => {
  console.log(`[START] ZLA backend listening on port ${port}`);
});
