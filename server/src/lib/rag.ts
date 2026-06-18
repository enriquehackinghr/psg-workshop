import Anthropic from '@anthropic-ai/sdk';
import { getSupabase, RetrievedChunk, InteractionSource } from './supabase.js';
import { embedText } from './embeddings.js';

const SYSTEM_PROMPT = `You are Meridiany, a professional research analyst built by Meridian Analytics.

Your role is to answer questions using ONLY the research paper excerpts provided in the context below. Follow these rules strictly:

1. Ground every substantive claim in the provided excerpts. Do not speculate or use outside knowledge.
2. Cite sources inline using [Paper Title, p. X] or [Paper Title, Section Name] format when referencing specific findings.
3. If the provided context does not contain enough information to answer the question, say so clearly. Do not guess or fabricate.
4. Use a professional, declarative tone aligned with Meridian Analytics' voice.
5. Structure longer answers with clear paragraphs. Be concise when the question is narrow.
6. When multiple papers address the question, synthesize across sources and cite each one.`;

let anthropic: Anthropic | null = null;

function getAnthropic(): Anthropic {
  if (!anthropic) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is required');
    }
    anthropic = new Anthropic({ apiKey });
  }
  return anthropic;
}

export async function retrieveChunks(question: string, matchCount = 8): Promise<RetrievedChunk[]> {
  const supabase = getSupabase();
  const queryEmbedding = await embedText(question);

  const { data: chunks, error } = await supabase.rpc('match_document_chunks', {
    query_embedding: queryEmbedding,
    match_threshold: 0.25,
    match_count: matchCount,
  });

  if (error) {
    throw new Error(`Retrieval failed: ${error.message}`);
  }

  if (!chunks || chunks.length === 0) {
    return [];
  }

  const paperIds = [...new Set(chunks.map((c: RetrievedChunk) => c.paper_id))];
  const { data: papers } = await supabase
    .from('papers')
    .select('id, title, authors, publication_date, source_url, status')
    .in('id', paperIds);

  const paperMap = new Map(papers?.map((p) => [p.id, p]) ?? []);

  return chunks.map((chunk: RetrievedChunk) => ({
    ...chunk,
    paper: paperMap.get(chunk.paper_id),
  }));
}

function buildContext(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) {
    return 'No relevant research excerpts were found in the knowledge base.';
  }

  return chunks
    .map((chunk, i) => {
      const title = chunk.paper?.title ?? 'Unknown Paper';
      const page = chunk.page_number ? ` (Page ${chunk.page_number})` : '';
      const section = chunk.section_title ? ` [${chunk.section_title}]` : '';
      return `--- Excerpt ${i + 1}: "${title}"${page}${section} ---\n${chunk.content}`;
    })
    .join('\n\n');
}

export function chunksToSources(chunks: RetrievedChunk[]): InteractionSource[] {
  return chunks.map((chunk) => ({
    paper_id: chunk.paper_id,
    paper_title: chunk.paper?.title ?? 'Unknown Paper',
    chunk_id: chunk.id,
    page_number: chunk.page_number,
    section_title: chunk.section_title,
    excerpt: chunk.content.slice(0, 300),
    source_url: chunk.paper?.source_url ?? null,
  }));
}

export interface StreamCallbacks {
  onToken: (text: string) => void;
  onSources: (sources: InteractionSource[]) => void;
  onDone: () => void;
  onError: (error: Error) => void;
}

export async function generateAnswer(
  question: string,
  chunks: RetrievedChunk[],
  callbacks: StreamCallbacks
): Promise<string> {
  const client = getAnthropic();
  const context = buildContext(chunks);
  const sources = chunksToSources(chunks);

  callbacks.onSources(sources);

  const userMessage = `Research excerpts:\n\n${context}\n\n---\n\nQuestion: ${question}`;

  let fullAnswer = '';

  const stream = client.messages.stream({
    model: getModel(),
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  });

  for await (const event of stream) {
    if (
      event.type === 'content_block_delta' &&
      event.delta.type === 'text_delta'
    ) {
      const text = event.delta.text;
      fullAnswer += text;
      callbacks.onToken(text);
    }
  }

  callbacks.onDone();
  return fullAnswer;
}

export async function logInteraction(params: {
  sessionId: string;
  question: string;
  answer: string;
  sources: InteractionSource[];
  surface: 'landing' | 'widget';
}): Promise<string> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('interactions')
    .insert({
      session_id: params.sessionId,
      question: params.question,
      answer: params.answer,
      retrieved_sources: params.sources,
      surface: params.surface,
    })
    .select('id')
    .single();

  if (error) {
    console.error('Failed to log interaction:', error.message);
    throw new Error('Failed to log interaction');
  }

  return data.id;
}

const DEFAULT_MODEL = 'claude-sonnet-4-6';

function getModel(): string {
  return process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
}

export function isCatalogQuestion(question: string): boolean {
  return /\b(papers?|documents?|corpus|library|knowledge base|database)\b/i.test(question) &&
    /\b(how many|what|which|list|title|titles|name|names|contain|have|indexed|available)\b/i.test(question);
}

export async function answerCatalogQuestion(question: string): Promise<string> {
  const { listPapers } = await import('./ingestion.js');
  const papers = (await listPapers())?.filter((p) => p.status === 'active') ?? [];

  if (papers.length === 0) {
    return 'The knowledge base does not contain any active research papers yet.';
  }

  const catalog = papers
    .map((p) => {
      const authors = p.authors?.length ? p.authors.join(', ') : 'Unknown author';
      const date = p.publication_date ? `, published ${p.publication_date}` : '';
      return `- **${p.title}** (${authors}${date})`;
    })
    .join('\n');

  if (/\btitle\b/i.test(question) && papers.length === 1) {
    return `The knowledge base contains one paper: **${papers[0].title}**.`;
  }

  return `The knowledge base currently contains ${papers.length} paper${papers.length === 1 ? '' : 's'}:\n\n${catalog}`;
}

export async function submitFeedback(
  interactionId: string,
  rating: 'up' | 'down',
  feedbackText?: string
): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('interactions')
    .update({
      feedback_rating: rating,
      feedback_text: feedbackText ?? null,
    })
    .eq('id', interactionId);

  if (error) {
    throw new Error(`Failed to submit feedback: ${error.message}`);
  }
}
