import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabase: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!supabase) {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
    }
    supabase = createClient(url, key);
  }
  return supabase;
}

export interface Paper {
  id: string;
  title: string;
  authors: string[];
  publication_date: string | null;
  source_url: string | null;
  status: string;
}

export interface RetrievedChunk {
  id: string;
  paper_id: string;
  content: string;
  chunk_index: number;
  page_number: number | null;
  section_title: string | null;
  similarity: number;
  paper?: Paper;
}

export interface InteractionSource {
  paper_id: string;
  paper_title: string;
  chunk_id: string;
  page_number: number | null;
  section_title: string | null;
  excerpt: string;
  source_url: string | null;
}
