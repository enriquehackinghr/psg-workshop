import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import {
  retrieveChunks,
  generateAnswer,
  chunksToSources,
  logInteraction,
  submitFeedback,
  isCatalogQuestion,
  answerCatalogQuestion,
} from '../lib/rag.js';
import { extractTextFromFile, isSupportedDocument } from '../lib/text-extraction.js';
import {
  saveChatDocument,
  getChatDocument,
  getLatestChatDocument,
} from '../lib/chat-documents.js';
import {
  generateDocumentAnswer,
  indexChatDocument,
  wantsToIndexDocument,
  shouldUseDocumentContext,
} from '../lib/document-chat.js';

export const chatRouter = Router();

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

const DEFAULT_DOCUMENT_PROMPT =
  "I've attached a document. What can you do with it, and what would you recommend?";

function chatUpload(req: Request, res: Response, next: NextFunction) {
  if (req.is('multipart/form-data')) {
    upload.single('file')(req, res, next);
  } else {
    next();
  }
}

chatRouter.post('/chat', chatUpload, async (req: Request, res: Response) => {
  const body = req.body ?? {};
  let question = typeof body.question === 'string' ? body.question.trim() : '';
  const sessionId = body.sessionId;
  const surface = body.surface ?? 'landing';
  const documentId = body.documentId;

  if (question.length > 2000) {
    res.status(400).json({ error: 'Question too long (max 2000 characters)' });
    return;
  }

  const validSurface = surface === 'widget' ? 'widget' : 'landing';
  const sid = sessionId || uuidv4();

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const sendEvent = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    sendEvent('session', { sessionId: sid });

    let activeDocument = null;

    if (req.file) {
      const text = await extractTextFromFile(req.file.buffer, req.file.originalname);
      if (!text.trim()) {
        sendEvent('error', { message: 'No text could be extracted from the document.' });
        res.end();
        return;
      }
      activeDocument = await saveChatDocument({
        sessionId: sid,
        filename: req.file.originalname,
        content: text,
        fileSize: req.file.size,
      });
      sendEvent('document', {
        documentId: activeDocument.id,
        filename: activeDocument.filename,
      });
      if (!question) question = DEFAULT_DOCUMENT_PROMPT;
    } else if (documentId) {
      activeDocument = await getChatDocument(documentId, sid);
    }

    if (!question) {
      sendEvent('error', { message: 'Question is required' });
      res.end();
      return;
    }

    // Use session's latest document for follow-up document questions
    if (!activeDocument && shouldUseDocumentContext(question, true)) {
      activeDocument = documentId
        ? await getChatDocument(documentId, sid)
        : await getLatestChatDocument(sid);
    }

    if (activeDocument && wantsToIndexDocument(question)) {
      const result = await indexChatDocument(activeDocument);
      const answer =
        `**${result.title}** has been added to the knowledge base (${result.chunkCount} sections indexed). ` +
        'You can now ask Meridiany questions about it alongside your other research.';
      sendEvent('sources', { sources: [] });
      sendEvent('token', { text: answer });
      sendEvent('indexed', { paperId: result.paperId, title: result.title });

      let interactionId: string | null = null;
      try {
        interactionId = await logInteraction({
          sessionId: sid,
          question,
          answer,
          sources: [],
          surface: validSurface,
        });
      } catch (logErr) {
        console.error('Interaction logging failed:', logErr);
      }

      sendEvent('done', { interactionId });
      res.end();
      return;
    }

    if (activeDocument && (req.file || shouldUseDocumentContext(question, true))) {
      let fullAnswer = '';
      fullAnswer = await generateDocumentAnswer(question, activeDocument, {
        onToken: (text) => sendEvent('token', { text }),
        onSources: (s) => sendEvent('sources', { sources: s }),
        onDone: () => {},
      });

      let interactionId: string | null = null;
      try {
        interactionId = await logInteraction({
          sessionId: sid,
          question,
          answer: fullAnswer,
          sources: [],
          surface: validSurface,
        });
      } catch (logErr) {
        console.error('Interaction logging failed:', logErr);
      }

      sendEvent('done', { interactionId });
      res.end();
      return;
    }

    if (isCatalogQuestion(question)) {
      const answer = await answerCatalogQuestion(question);
      sendEvent('sources', { sources: [] });
      sendEvent('token', { text: answer });
      let interactionId: string | null = null;
      try {
        interactionId = await logInteraction({
          sessionId: sid,
          question,
          answer,
          sources: [],
          surface: validSurface,
        });
      } catch (logErr) {
        console.error('Interaction logging failed:', logErr);
      }
      sendEvent('done', { interactionId });
      res.end();
      return;
    }

    const chunks = await retrieveChunks(question);

    if (chunks.length === 0) {
      const noResultMessage =
        activeDocument
          ? "I couldn't find matching content in the indexed research library. Try asking directly about your attached document, or say \"add this to the knowledge base\" to index it."
          : "I don't have relevant research in the knowledge base to answer that question. " +
            'Attach a document to analyze it, or upload research via Upload research in the header.';
      sendEvent('sources', { sources: [] });
      sendEvent('token', { text: noResultMessage });
      sendEvent('done', { interactionId: null });
      res.end();
      return;
    }

    let fullAnswer = '';
    const sources = chunksToSources(chunks);

    fullAnswer = await generateAnswer(question, chunks, {
      onToken: (text) => sendEvent('token', { text }),
      onSources: (s) => sendEvent('sources', { sources: s }),
      onDone: () => {},
      onError: (err) => sendEvent('error', { message: err.message }),
    });

    let interactionId: string | null = null;
    try {
      interactionId = await logInteraction({
        sessionId: sid,
        question,
        answer: fullAnswer,
        sources,
        surface: validSurface,
      });
    } catch (logErr) {
      console.error('Interaction logging failed:', logErr);
    }

    sendEvent('done', { interactionId });
    res.end();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred';
    console.error('Chat error:', message);
    sendEvent('error', { message: 'Something went wrong. Please try again.' });
    res.end();
  }
});

chatRouter.post('/feedback', async (req: Request, res: Response) => {
  const { interactionId, rating, feedbackText } = req.body;

  if (!interactionId || !rating) {
    res.status(400).json({ error: 'interactionId and rating are required' });
    return;
  }

  if (rating !== 'up' && rating !== 'down') {
    res.status(400).json({ error: 'rating must be "up" or "down"' });
    return;
  }

  try {
    await submitFeedback(interactionId, rating, feedbackText);
    res.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to submit feedback';
    res.status(500).json({ error: message });
  }
});

chatRouter.get('/papers', async (_req: Request, res: Response) => {
  try {
    const { listPapers } = await import('../lib/ingestion.js');
    const papers = await listPapers();
    const active = papers?.filter((p) => p.status === 'active') ?? [];
    res.json({ papers: active, count: active.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch papers';
    res.status(500).json({ error: message });
  }
});

chatRouter.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
