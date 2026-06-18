import Anthropic from '@anthropic-ai/sdk';
import { ingestTextContent } from './ingestion.js';
import { ChatDocument } from './chat-documents.js';
import { retrieveChunks, chunksToSources } from './rag.js';
import { InteractionSource } from './supabase.js';
import { titleFromDocument, truncateForContext } from './text-extraction.js';

const DOCUMENT_SYSTEM_PROMPT = `You are Meridiany, a professional research analyst built by Meridian Analytics.

The user has shared a document in this chat. Help them decide what to do with it and carry out their instructions.

You can:
- Summarize key findings or specific sections
- Extract themes, data points, or recommendations they ask for
- Suggest whether the document fits the research library and what metadata to use
- Compare the document with indexed research when excerpts from the library are provided
- Confirm when they ask you to add/index/save the document to the knowledge base

When the user shares a document without a specific request, briefly describe what it appears to cover and offer 3–4 concrete next steps they can ask for.

When they explicitly ask to add, index, or save the document to the knowledge base or library, acknowledge that indexing will proceed and confirm the title you are using.

Rules:
- Ground claims in the attached document and any library excerpts provided
- Do not fabricate content not present in the materials
- Use a professional, declarative tone
- Cite the attached document as [Attached: filename] and library papers by title`;

let anthropic: Anthropic | null = null;

function getAnthropic(): Anthropic {
  if (!anthropic) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is required');
    anthropic = new Anthropic({ apiKey });
  }
  return anthropic;
}

function getModel(): string {
  return process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
}

export function wantsToIndexDocument(question: string): boolean {
  return (
    /\b(add|index|save|store|upload|include)\b[\s\S]{0,40}\b(knowledge base|research library|library|corpus|database)\b/i.test(
      question
    ) || /\b(add|index|save) (this|it|the document)\b/i.test(question)
  );
}

export function shouldUseDocumentContext(question: string, hasDocument: boolean): boolean {
  if (!hasDocument) return false;
  return (
    wantsToIndexDocument(question) ||
    /\b(this document|the document|attached|uploaded|the file|the paper)\b/i.test(question) ||
    /\b(summarize|summary|compare|extract|review|analyze|analyse|what can you do|what should|recommend)\b/i.test(
      question
    )
  );
}

export interface DocumentStreamCallbacks {
  onToken: (text: string) => void;
  onSources: (sources: InteractionSource[]) => void;
  onDone: () => void;
}

export async function generateDocumentAnswer(
  question: string,
  document: ChatDocument,
  callbacks: DocumentStreamCallbacks,
  options?: { includeLibraryContext?: boolean }
): Promise<string> {
  const client = getAnthropic();
  const docContent = truncateForContext(document.content);
  let libraryContext = '';
  let sources: InteractionSource[] = [];

  if (options?.includeLibraryContext !== false) {
    const chunks = await retrieveChunks(question, 5);
    sources = chunksToSources(chunks);
    callbacks.onSources(sources);

    if (chunks.length > 0) {
      libraryContext =
        '\n\n--- Related excerpts from the indexed research library ---\n\n' +
        chunks
          .map((c, i) => {
            const title = c.paper?.title ?? 'Unknown';
            return `Excerpt ${i + 1} from "${title}":\n${c.content}`;
          })
          .join('\n\n');
    } else {
      callbacks.onSources([]);
    }
  } else {
    callbacks.onSources([]);
  }

  const userMessage = `Attached document: "${document.filename}"

${docContent}
${libraryContext}

---

User request: ${question}`;

  let fullAnswer = '';
  const stream = client.messages.stream({
    model: getModel(),
    max_tokens: 2048,
    system: DOCUMENT_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  });

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      fullAnswer += event.delta.text;
      callbacks.onToken(event.delta.text);
    }
  }

  callbacks.onDone();
  return fullAnswer;
}

export async function indexChatDocument(document: ChatDocument): Promise<{
  paperId: string;
  chunkCount: number;
  title: string;
}> {
  const title = titleFromDocument(document.filename, document.content);

  return ingestTextContent({
    title,
    text: document.content,
    filename: document.filename,
  });
}
