-- Meridian Research Assistant – initial schema
-- Run in Supabase SQL Editor or via Supabase CLI

CREATE EXTENSION IF NOT EXISTS vector;

-- Papers metadata
CREATE TABLE IF NOT EXISTS papers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  authors TEXT[] DEFAULT '{}',
  publication_date DATE,
  source_url TEXT,
  upload_date TIMESTAMPTZ DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'processing'
    CHECK (status IN ('active', 'archived', 'processing', 'error')),
  storage_path TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Text chunks with vector embeddings (1024 dims for Voyage voyage-3)
CREATE TABLE IF NOT EXISTS document_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paper_id UUID NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  chunk_index INT NOT NULL,
  page_number INT,
  section_title TEXT,
  embedding vector(1024),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS document_chunks_paper_id_idx ON document_chunks(paper_id);
CREATE INDEX IF NOT EXISTS document_chunks_embedding_idx
  ON document_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Data collection bucket: conversation logs and feedback
CREATE TABLE IF NOT EXISTS interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  question TEXT NOT NULL,
  answer TEXT,
  retrieved_sources JSONB DEFAULT '[]',
  surface TEXT NOT NULL DEFAULT 'landing'
    CHECK (surface IN ('landing', 'widget')),
  feedback_rating TEXT CHECK (feedback_rating IN ('up', 'down')),
  feedback_text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS interactions_session_id_idx ON interactions(session_id);
CREATE INDEX IF NOT EXISTS interactions_created_at_idx ON interactions(created_at DESC);

-- Similarity search function
CREATE OR REPLACE FUNCTION match_document_chunks(
  query_embedding vector(1024),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 8
)
RETURNS TABLE (
  id UUID,
  paper_id UUID,
  content TEXT,
  chunk_index INT,
  page_number INT,
  section_title TEXT,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    dc.id,
    dc.paper_id,
    dc.content,
    dc.chunk_index,
    dc.page_number,
    dc.section_title,
    1 - (dc.embedding <=> query_embedding) AS similarity
  FROM document_chunks dc
  INNER JOIN papers p ON p.id = dc.paper_id
  WHERE p.status = 'active'
    AND dc.embedding IS NOT NULL
    AND 1 - (dc.embedding <=> query_embedding) > match_threshold
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- Row Level Security
ALTER TABLE papers ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE interactions ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS; anon can read active papers metadata only
CREATE POLICY "Public read active papers"
  ON papers FOR SELECT
  USING (status = 'active');

CREATE POLICY "Service role full access papers"
  ON papers FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access chunks"
  ON document_chunks FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access interactions"
  ON interactions FOR ALL
  USING (auth.role() = 'service_role');

-- Storage bucket for original PDFs (create via Supabase dashboard or API)
-- Bucket name: research-papers (private, service role access only)
