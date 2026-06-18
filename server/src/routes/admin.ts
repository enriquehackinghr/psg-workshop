import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { ingestPaper, listPapers, deletePaper } from '../lib/ingestion.js';
import { isSupportedDocument } from '../lib/text-extraction.js';

export const adminRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (isSupportedDocument(file.originalname, file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Supported formats: PDF, Word, Excel, CSV, Markdown, and text'));
    }
  },
});

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.headers['x-admin-key'] || req.headers.authorization?.replace('Bearer ', '');
  const expected = process.env.ADMIN_API_KEY;

  if (!expected) {
    res.status(503).json({ error: 'Upload is not configured. Set ADMIN_API_KEY on the server.' });
    return;
  }

  if (apiKey !== expected) {
    res.status(401).json({ error: 'Invalid admin key' });
    return;
  }
  next();
}

adminRouter.use(requireAdmin);

adminRouter.post('/papers/upload', (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) return next(err);
    if (!req.file) {
      upload.single('pdf')(req, res, next);
    } else {
      next();
    }
  });
}, async (req: Request, res: Response) => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: 'File is required – PDF, Word, Excel, CSV, Markdown, or text' });
    return;
  }
  const { title, authors, publicationDate, sourceUrl } = req.body;

  if (!title) {
    res.status(400).json({ error: 'title is required' });
    return;
  }

  const authorList = authors
    ? (typeof authors === 'string' ? authors.split(',').map((a: string) => a.trim()) : authors)
    : [];

  try {
    const result = await ingestPaper({
      title,
      authors: authorList,
      publicationDate: publicationDate || undefined,
      sourceUrl: sourceUrl || undefined,
      fileBuffer: file.buffer,
      filename: file.originalname,
    });

    res.status(201).json({
      message: 'Paper ingested successfully',
      ...result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Ingestion failed';
    console.error('Ingestion error:', message);
    res.status(500).json({ error: message });
  }
});

adminRouter.get('/papers', async (_req: Request, res: Response) => {
  try {
    const papers = await listPapers();
    res.json({ papers });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to list papers';
    res.status(500).json({ error: message });
  }
});

adminRouter.delete('/papers/:id', async (req: Request, res: Response) => {
  try {
    const paperId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    await deletePaper(paperId);
    res.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete paper';
    res.status(500).json({ error: message });
  }
});
