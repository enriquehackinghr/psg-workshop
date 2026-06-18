export interface Citation {
  paper_id: string;
  paper_title: string;
  chunk_id: string;
  page_number: number | null;
  section_title: string | null;
  excerpt: string;
  source_url: string | null;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  interactionId?: string | null;
  feedbackGiven?: 'up' | 'down';
  attachmentName?: string;
}

export interface ChatDocumentRef {
  id: string;
  filename: string;
}

export const SUGGESTED_QUESTIONS = [
  'What is the new agency equation described in the Work Trend Index?',
  'How are Frontier Firms different from other organizations?',
  'What human skills matter most as AI takes on more work?',
  'Summarize the attached document and suggest next steps',
];

export const API_BASE = import.meta.env.VITE_API_URL || '';

export function getSessionId(): string {
  const key = 'meridian_session_id';
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(key, id);
  }
  return id;
}

export async function streamChat(
  question: string,
  callbacks: {
    onToken: (text: string) => void;
    onSources: (sources: Citation[]) => void;
    onSession: (sessionId: string) => void;
    onDocument: (doc: ChatDocumentRef) => void;
    onIndexed: (paper: { paperId: string; title: string }) => void;
    onDone: (interactionId: string | null) => void;
    onError: (message: string) => void;
  },
  surface: 'landing' | 'widget' = 'landing',
  options?: { file?: File; documentId?: string }
): Promise<void> {
  const sessionId = getSessionId();
  let response: Response;

  if (options?.file) {
    const formData = new FormData();
    formData.append('file', options.file);
    formData.append('question', question);
    formData.append('sessionId', sessionId);
    formData.append('surface', surface);
    if (options.documentId) formData.append('documentId', options.documentId);

    response = await fetch(`${API_BASE}/api/chat`, {
      method: 'POST',
      body: formData,
    });
  } else {
    response = await fetch(`${API_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question,
        sessionId,
        surface,
        documentId: options?.documentId,
      }),
    });
  }

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Request failed' }));
    callbacks.onError(err.error || 'Request failed');
    return;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    callbacks.onError('No response stream');
    return;
  }

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() ?? '';

    for (const part of parts) {
      const lines = part.split('\n');
      let event = 'message';
      let data = '';

      for (const line of lines) {
        if (line.startsWith('event: ')) event = line.slice(7);
        if (line.startsWith('data: ')) data = line.slice(6);
      }

      if (!data) continue;

      try {
        const parsed = JSON.parse(data);
        switch (event) {
          case 'token':
            callbacks.onToken(parsed.text);
            break;
          case 'sources':
            callbacks.onSources(parsed.sources);
            break;
          case 'session':
            callbacks.onSession(parsed.sessionId);
            break;
          case 'document':
            callbacks.onDocument({
              id: parsed.documentId,
              filename: parsed.filename,
            });
            break;
          case 'indexed':
            callbacks.onIndexed(parsed);
            break;
          case 'done':
            callbacks.onDone(parsed.interactionId);
            break;
          case 'error':
            callbacks.onError(parsed.message);
            break;
        }
      } catch {
        // skip malformed events
      }
    }
  }
}

export async function submitFeedback(
  interactionId: string,
  rating: 'up' | 'down',
  feedbackText?: string
): Promise<boolean> {
  const response = await fetch(`${API_BASE}/api/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ interactionId, rating, feedbackText }),
  });
  return response.ok;
}

export interface Paper {
  id: string;
  title: string;
  authors: string[];
  publication_date: string | null;
  source_url: string | null;
  status: string;
  upload_date: string;
}

export interface UploadResult {
  paperId: string;
  chunkCount: number;
  title: string;
}

export async function uploadDocument(
  adminKey: string,
  params: {
    file: File;
    title: string;
    authors?: string;
    publicationDate?: string;
    sourceUrl?: string;
  }
): Promise<UploadResult> {
  const formData = new FormData();
  formData.append('file', params.file);
  formData.append('title', params.title);
  if (params.authors) formData.append('authors', params.authors);
  if (params.publicationDate) formData.append('publicationDate', params.publicationDate);
  if (params.sourceUrl) formData.append('sourceUrl', params.sourceUrl);

  const response = await fetch(`${API_BASE}/api/admin/papers/upload`, {
    method: 'POST',
    headers: { 'X-Admin-Key': adminKey },
    body: formData,
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Upload failed');
  }
  return data;
}

export async function listAdminPapers(adminKey: string): Promise<Paper[]> {
  const response = await fetch(`${API_BASE}/api/admin/papers`, {
    headers: { 'X-Admin-Key': adminKey },
  });
  if (!response.ok) throw new Error('Could not load papers');
  const data = await response.json();
  return data.papers ?? [];
}

export async function deletePaper(adminKey: string, paperId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/admin/papers/${paperId}`, {
    method: 'DELETE',
    headers: { 'X-Admin-Key': adminKey },
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Delete failed');
  }
}
