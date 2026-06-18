import { useState, useRef, useCallback, useEffect } from 'react';
import {
  uploadDocument,
  listAdminPapers,
  deletePaper,
  type Paper,
} from '../lib/api';
import { ACCEPTED_DOCUMENT_TYPES } from '../lib/documents';

const ADMIN_KEY_STORAGE = 'meridiany_admin_key';

interface DocumentUploadProps {
  open: boolean;
  onClose: () => void;
  onUploaded: () => void;
}

function titleFromFilename(name: string): string {
  return name
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export default function DocumentUpload({ open, onClose, onUploaded }: DocumentUploadProps) {
  const [adminKey, setAdminKey] = useState(() => sessionStorage.getItem(ADMIN_KEY_STORAGE) ?? '');
  const [title, setTitle] = useState('');
  const [authors, setAuthors] = useState('');
  const [publicationDate, setPublicationDate] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [papers, setPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingPapers, setLoadingPapers] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadPapers = useCallback(async (key: string) => {
    if (!key) return;
    setLoadingPapers(true);
    try {
      const data = await listAdminPapers(key);
      setPapers(data);
    } catch {
      setPapers([]);
    } finally {
      setLoadingPapers(false);
    }
  }, []);

  useEffect(() => {
    if (open && adminKey) loadPapers(adminKey);
  }, [open, adminKey, loadPapers]);

  const saveAdminKey = (key: string) => {
    setAdminKey(key);
    sessionStorage.setItem(ADMIN_KEY_STORAGE, key);
    if (key) loadPapers(key);
  };

  const pickFile = (f: File) => {
    setFile(f);
    if (!title) setTitle(titleFromFilename(f.name));
    setStatus(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) pickFile(dropped);
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminKey) {
      setStatus({ type: 'error', message: 'Admin key is required.' });
      return;
    }
    if (!file) {
      setStatus({ type: 'error', message: 'Please select a document to upload.' });
      return;
    }
    if (!title.trim()) {
      setStatus({ type: 'error', message: 'Title is required.' });
      return;
    }

    setLoading(true);
    setStatus(null);

    try {
      const result = await uploadDocument(adminKey, {
        file,
        title: title.trim(),
        authors: authors.trim() || undefined,
        publicationDate: publicationDate || undefined,
        sourceUrl: sourceUrl.trim() || undefined,
      });
      setStatus({
        type: 'success',
        message: `"${result.title}" added to the knowledge base (${result.chunkCount} chunks indexed).`,
      });
      setFile(null);
      setTitle('');
      setAuthors('');
      setPublicationDate('');
      setSourceUrl('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      await loadPapers(adminKey);
      onUploaded();
    } catch (err) {
      setStatus({
        type: 'error',
        message: err instanceof Error ? err.message : 'Upload failed',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (paperId: string, paperTitle: string) => {
    if (!adminKey || !confirm(`Remove "${paperTitle}" from the knowledge base?`)) return;
    try {
      await deletePaper(adminKey, paperId);
      await loadPapers(adminKey);
      onUploaded();
    } catch (err) {
      setStatus({
        type: 'error',
        message: err instanceof Error ? err.message : 'Delete failed',
      });
    }
  };

  if (!open) return null;

  return (
    <div className="upload-overlay" onClick={onClose}>
      <div className="upload-panel" onClick={(e) => e.stopPropagation()}>
        <div className="upload-header">
          <div>
            <h2>Upload research</h2>
            <p>Add documents to Meridiany's knowledge base</p>
          </div>
          <button className="upload-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <form className="upload-form" onSubmit={handleUpload}>
          <label className="upload-label">Admin key</label>
          <input
            type="password"
            className="upload-input"
            placeholder="Enter admin key (see .env.local)"
            value={adminKey}
            onChange={(e) => saveAdminKey(e.target.value)}
            required
          />

          <div
            className={`upload-dropzone ${dragOver ? 'upload-dropzone--active' : ''} ${file ? 'upload-dropzone--has-file' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              hidden
              accept={ACCEPTED_DOCUMENT_TYPES}
              onChange={(e) => e.target.files?.[0] && pickFile(e.target.files[0])}
            />
            {file ? (
              <>
                <span className="upload-file-name">{file.name}</span>
                <span className="upload-file-hint">{(file.size / 1024).toFixed(1)} KB · click to change</span>
              </>
            ) : (
              <>
                <span className="upload-drop-title">Drop a document here</span>
                <span className="upload-file-hint">PDF, Word, Excel, CSV, Markdown, or text · up to 50 MB</span>
              </>
            )}
          </div>

          <label className="upload-label">Title *</label>
          <input
            className="upload-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Research paper title"
            required
          />

          <div className="upload-row">
            <div>
              <label className="upload-label">Authors</label>
              <input
                className="upload-input"
                value={authors}
                onChange={(e) => setAuthors(e.target.value)}
                placeholder="Smith, Jones"
              />
            </div>
            <div>
              <label className="upload-label">Publication date</label>
              <input
                type="date"
                className="upload-input"
                value={publicationDate}
                onChange={(e) => setPublicationDate(e.target.value)}
              />
            </div>
          </div>

          <label className="upload-label">Source URL</label>
          <input
            type="url"
            className="upload-input"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="https://..."
          />

          {status && (
            <div className={`upload-status upload-status--${status.type}`}>{status.message}</div>
          )}

          <button type="submit" className="upload-submit" disabled={loading}>
            {loading ? 'Indexing document…' : 'Upload & index'}
          </button>
        </form>

        <div className="upload-library">
          <h3>Knowledge base</h3>
          {loadingPapers ? (
            <p className="upload-library-empty">Loading…</p>
          ) : papers.length === 0 ? (
            <p className="upload-library-empty">No documents yet.</p>
          ) : (
            <ul className="upload-library-list">
              {papers.map((p) => (
                <li key={p.id} className="upload-library-item">
                  <div>
                    <strong>{p.title}</strong>
                    <span className={`upload-badge upload-badge--${p.status}`}>{p.status}</span>
                  </div>
                  <button
                    type="button"
                    className="upload-delete"
                    onClick={() => handleDelete(p.id, p.title)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
