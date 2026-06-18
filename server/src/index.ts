import './lib/env.js';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { chatRouter } from './routes/chat.js';
import { adminRouter } from './routes/admin.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim());

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    credentials: true,
  })
);

app.use(express.json({ limit: '1mb' }));

app.use('/api', chatRouter);
app.use('/api/admin', adminRouter);

const publicDir = path.join(__dirname, '../public');
app.use('/admin', express.static(publicDir));

const clientDist = path.join(__dirname, '../../client/dist');
const widgetDist = path.join(__dirname, '../../widget/dist');

app.use('/widget', express.static(widgetDist));
app.use(express.static(clientDist));

app.get('/widget.js', (_req, res) => {
  res.sendFile(path.join(widgetDist, 'meridian-widget.js'));
});

app.get('/admin', (_req, res) => {
  res.sendFile(path.join(publicDir, 'admin.html'));
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Meridiany server running on port ${PORT}`);
});
