import { getSupabase } from './supabase.js';

export interface ChatDocument {
  id: string;
  session_id: string;
  filename: string;
  content: string;
  file_size: number | null;
  created_at: string;
}

export async function saveChatDocument(params: {
  sessionId: string;
  filename: string;
  content: string;
  fileSize: number;
}): Promise<ChatDocument> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('chat_documents')
    .insert({
      session_id: params.sessionId,
      filename: params.filename,
      content: params.content,
      file_size: params.fileSize,
    })
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(`Failed to save document: ${error?.message}`);
  }

  return data as ChatDocument;
}

export async function getChatDocument(
  documentId: string,
  sessionId: string
): Promise<ChatDocument | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('chat_documents')
    .select('*')
    .eq('id', documentId)
    .eq('session_id', sessionId)
    .single();

  if (error || !data) return null;
  return data as ChatDocument;
}

export async function getLatestChatDocument(sessionId: string): Promise<ChatDocument | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('chat_documents')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data as ChatDocument;
}
