import { getSupabase } from './supabase.js';
import { embedTexts } from './embeddings.js';
import {
  extractTextFromFile,
  contentTypeFor,
} from './text-extraction.js';

const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;

interface ChunkResult {
  content: string;
  chunkIndex: number;
  pageNumber: number | null;
  sectionTitle: string | null;
}

function splitIntoChunks(text: string): ChunkResult[] {
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim().length > 50);
  const chunks: ChunkResult[] = [];
  let current = '';
  let chunkIndex = 0;

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (current.length + trimmed.length > CHUNK_SIZE && current.length > 0) {
      chunks.push({
        content: current.trim(),
        chunkIndex: chunkIndex++,
        pageNumber: null,
        sectionTitle: detectSection(current),
      });
      const words = current.split(/\s+/);
      const overlapWords = words.slice(-Math.floor(CHUNK_OVERLAP / 5));
      current = overlapWords.join(' ') + '\n\n' + trimmed;
    } else {
      current += (current ? '\n\n' : '') + trimmed;
    }
  }

  if (current.trim().length > 50) {
    chunks.push({
      content: current.trim(),
      chunkIndex: chunkIndex,
      pageNumber: null,
      sectionTitle: detectSection(current),
    });
  }

  return chunks;
}

function detectSection(text: string): string | null {
  const firstLine = text.split('\n')[0]?.trim() ?? '';
  if (firstLine.startsWith('## ')) return firstLine.replace(/^#+\s*/, '');
  if (firstLine.length < 80 && /^[A-Z\d]/.test(firstLine) && !firstLine.endsWith('.')) {
    return firstLine;
  }
  return null;
}

export interface IngestPaperParams {
  title: string;
  authors?: string[];
  publicationDate?: string;
  sourceUrl?: string;
  fileBuffer: Buffer;
  filename: string;
}

export interface IngestResult {
  paperId: string;
  chunkCount: number;
  title: string;
}

export async function ingestPaper(params: IngestPaperParams): Promise<IngestResult> {
  const text = await extractTextFromFile(params.fileBuffer, params.filename);
  return ingestTextContent({
    title: params.title,
    authors: params.authors,
    publicationDate: params.publicationDate,
    sourceUrl: params.sourceUrl,
    text,
    filename: params.filename,
    fileBuffer: params.fileBuffer,
  });
}

export async function ingestTextContent(params: {
  title: string;
  text: string;
  filename: string;
  authors?: string[];
  publicationDate?: string;
  sourceUrl?: string;
  fileBuffer?: Buffer;
}): Promise<IngestResult> {
  const supabase = getSupabase();

  const { data: paper, error: paperError } = await supabase
    .from('papers')
    .insert({
      title: params.title,
      authors: params.authors ?? [],
      publication_date: params.publicationDate ?? null,
      source_url: params.sourceUrl ?? null,
      status: 'processing',
    })
    .select('id')
    .single();

  if (paperError || !paper) {
    throw new Error(`Failed to create paper record: ${paperError?.message}`);
  }

  const paperId = paper.id;
  const storagePath = `${paperId}/${params.filename}`;

  try {
    if (params.fileBuffer) {
      const { error: uploadError } = await supabase.storage
        .from('research-papers')
        .upload(storagePath, params.fileBuffer, {
          contentType: contentTypeFor(params.filename),
          upsert: true,
        });

      if (uploadError) {
        console.warn('Storage upload failed (bucket may not exist):', uploadError.message);
      }

      await supabase
        .from('papers')
        .update({ storage_path: storagePath })
        .eq('id', paperId);
    }

    const chunks = splitIntoChunks(params.text);

    if (chunks.length === 0) {
      throw new Error('No text could be extracted from the file');
    }

    const embeddings = await embedTexts(chunks.map((c) => c.content));

    const chunkRecords = chunks.map((chunk, i) => ({
      paper_id: paperId,
      content: chunk.content,
      chunk_index: chunk.chunkIndex,
      page_number: chunk.pageNumber,
      section_title: chunk.sectionTitle,
      embedding: embeddings[i],
    }));

    const batchSize = 50;
    for (let i = 0; i < chunkRecords.length; i += batchSize) {
      const batch = chunkRecords.slice(i, i + batchSize);
      const { error: chunkError } = await supabase.from('document_chunks').insert(batch);
      if (chunkError) {
        throw new Error(`Failed to insert chunks: ${chunkError.message}`);
      }
    }

    await supabase
      .from('papers')
      .update({ status: 'active', updated_at: new Date().toISOString() })
      .eq('id', paperId);

    return { paperId, chunkCount: chunks.length, title: params.title };
  } catch (err) {
    await supabase
      .from('papers')
      .update({ status: 'error', updated_at: new Date().toISOString() })
      .eq('id', paperId);
    throw err;
  }
}

export async function listPapers() {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('papers')
    .select('id, title, authors, publication_date, source_url, status, upload_date')
    .order('upload_date', { ascending: false });

  if (error) throw new Error(error.message);
  return data;
}

export async function deletePaper(paperId: string): Promise<void> {
  const supabase = getSupabase();

  const { data: paper } = await supabase
    .from('papers')
    .select('storage_path')
    .eq('id', paperId)
    .single();

  if (paper?.storage_path) {
    await supabase.storage.from('research-papers').remove([paper.storage_path]);
  }

  const { error } = await supabase.from('papers').delete().eq('id', paperId);
  if (error) throw new Error(error.message);
}
