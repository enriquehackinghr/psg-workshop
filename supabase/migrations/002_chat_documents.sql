-- Chat session documents (uploaded in conversation, not yet in knowledge base)
CREATE TABLE IF NOT EXISTS chat_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  content TEXT NOT NULL,
  file_size INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS chat_documents_session_id_idx ON chat_documents(session_id);
CREATE INDEX IF NOT EXISTS chat_documents_created_at_idx ON chat_documents(created_at DESC);

ALTER TABLE chat_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access chat_documents"
  ON chat_documents FOR ALL
  USING (auth.role() = 'service_role');
