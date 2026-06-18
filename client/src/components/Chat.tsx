import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Message,
  Citation,
  ChatDocumentRef,
  SUGGESTED_QUESTIONS,
  streamChat,
  submitFeedback,
} from '../lib/api';
import { ACCEPTED_DOCUMENT_TYPES } from '../lib/documents';

function CitationList({ citations }: { citations: Citation[] }) {
  if (!citations.length) return null;

  const unique = citations.reduce<Citation[]>((acc, c) => {
    if (!acc.find((a) => a.paper_id === c.paper_id)) acc.push(c);
    return acc;
  }, []);

  return (
    <div className="citations">
      <span className="citations-label">Sources</span>
      <ul>
        {unique.map((c) => (
          <li key={c.paper_id}>
            {c.source_url ? (
              <a href={c.source_url} target="_blank" rel="noopener noreferrer">
                {c.paper_title}
              </a>
            ) : (
              <span>{c.paper_title}</span>
            )}
            {c.page_number && <span className="citation-meta"> · p. {c.page_number}</span>}
            {c.section_title && <span className="citation-meta"> · {c.section_title}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function FeedbackControls({
  interactionId,
  feedbackGiven,
  onFeedback,
}: {
  interactionId?: string | null;
  feedbackGiven?: 'up' | 'down';
  onFeedback: (rating: 'up' | 'down') => void;
}) {
  if (!interactionId) return null;

  return (
    <div className="feedback">
      <span className="feedback-label">Was this helpful?</span>
      <button
        className={`feedback-btn ${feedbackGiven === 'up' ? 'active' : ''}`}
        onClick={() => onFeedback('up')}
        disabled={!!feedbackGiven}
        aria-label="Thumbs up"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M7 10v12M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
        </svg>
      </button>
      <button
        className={`feedback-btn ${feedbackGiven === 'down' ? 'active' : ''}`}
        onClick={() => onFeedback('down')}
        disabled={!!feedbackGiven}
        aria-label="Thumbs down"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M17 14V2M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" />
        </svg>
      </button>
    </div>
  );
}

interface ChatProps {
  surface?: 'landing' | 'widget';
  compact?: boolean;
  onDocumentIndexed?: () => void;
}

export default function Chat({ surface = 'landing', compact = false, onDocumentIndexed }: ChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [activeDocument, setActiveDocument] = useState<ChatDocumentRef | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const sendMessage = async (text: string, fileOverride?: File | null) => {
    const question = text.trim();
    const fileToSend = fileOverride !== undefined ? fileOverride : pendingFile;

    if ((!question && !fileToSend) || isLoading) return;

    const displayContent = question || `📎 ${fileToSend?.name}`;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: displayContent,
      attachmentName: fileToSend?.name,
    };

    const assistantId = crypto.randomUUID();
    const assistantMsg: Message = {
      id: assistantId,
      role: 'assistant',
      content: '',
      citations: [],
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput('');
    setPendingFile(null);
    setIsLoading(true);

    try {
      await streamChat(
        question,
        {
          onToken: (token) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: m.content + token } : m
              )
            );
          },
          onSources: (sources) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, citations: sources } : m
              )
            );
          },
          onSession: () => {},
          onDocument: (doc) => setActiveDocument(doc),
          onIndexed: () => onDocumentIndexed?.(),
          onDone: (interactionId) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, interactionId } : m
              )
            );
            setIsLoading(false);
          },
          onError: (message) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, content: message || 'Something went wrong. Please try again.' }
                  : m
              )
            );
            setIsLoading(false);
          },
        },
        surface,
        {
          file: fileToSend ?? undefined,
          documentId: fileToSend ? undefined : activeDocument?.id,
        }
      );
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: 'Connection error. Please check your network and try again.' }
            : m
        )
      );
      setIsLoading(false);
    }
  };

  const handleFeedback = async (messageId: string, rating: 'up' | 'down') => {
    const msg = messages.find((m) => m.id === messageId);
    if (!msg?.interactionId || msg.feedbackGiven) return;

    const ok = await submitFeedback(msg.interactionId, rating);
    if (ok) {
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, feedbackGiven: rating } : m))
      );
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const pickFile = (file: File) => {
    setPendingFile(file);
    setActiveDocument(null);
    inputRef.current?.focus();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) pickFile(file);
  };

  const clearAttachment = () => {
    setPendingFile(null);
    setActiveDocument(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const showSuggestions = messages.length === 0 && !compact;
  const attachmentLabel = pendingFile?.name ?? activeDocument?.filename;

  return (
    <div
      className={`chat ${compact ? 'chat--compact' : ''} ${dragOver ? 'chat--drag-over' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <div className="chat-messages">
        {showSuggestions && (
          <div className="chat-welcome">
            <p className="chat-welcome-text">
              Ask Meridiany about the research library, or attach a document to summarize, analyze, compare, or add to the knowledge base.
            </p>
            <div className="suggestions">
              {SUGGESTED_QUESTIONS.map((q) => (
                <button
                  key={q}
                  className="suggestion-chip"
                  onClick={() => sendMessage(q)}
                  disabled={isLoading}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`message message--${msg.role}`}>
            <div className="message-avatar">
              {msg.role === 'user' ? 'You' : 'My'}
            </div>
            <div className="message-body">
              {msg.attachmentName && (
                <div className="message-attachment">📎 {msg.attachmentName}</div>
              )}
              <div className="message-content">
                {msg.content}
                {msg.role === 'assistant' && isLoading && msg === messages[messages.length - 1] && !msg.content && (
                  <span className="typing-indicator">
                    <span /><span /><span />
                  </span>
                )}
              </div>
              {msg.role === 'assistant' && msg.citations && msg.citations.length > 0 && (
                <CitationList citations={msg.citations} />
              )}
              {msg.role === 'assistant' && msg.content && !isLoading && (
                <FeedbackControls
                  interactionId={msg.interactionId}
                  feedbackGiven={msg.feedbackGiven}
                  onFeedback={(rating) => handleFeedback(msg.id, rating)}
                />
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {attachmentLabel && (
        <div className="chat-attachment-bar">
          <span className="chat-attachment-chip">📎 {attachmentLabel}</span>
          <button type="button" className="chat-attachment-clear" onClick={clearAttachment}>
            Remove
          </button>
        </div>
      )}

      <div className="chat-input-area">
        <button
          type="button"
          className="chat-attach"
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading}
          aria-label="Attach document"
          title="Attach document"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          hidden
          accept={ACCEPTED_DOCUMENT_TYPES}
          onChange={(e) => e.target.files?.[0] && pickFile(e.target.files[0])}
        />
        <textarea
          ref={inputRef}
          className="chat-input"
          placeholder={attachmentLabel ? 'What should Meridiany do with this document?' : 'Ask a research question or attach a document…'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
          rows={1}
        />
        <button
          className="chat-send"
          onClick={() => sendMessage(input)}
          disabled={isLoading || (!input.trim() && !pendingFile)}
          aria-label="Send message"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m5 12 7-7 7 7M12 5v14" />
          </svg>
        </button>
      </div>
    </div>
  );
}
