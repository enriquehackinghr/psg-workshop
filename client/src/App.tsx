import { useEffect, useState, useCallback } from 'react';
import Chat from './components/Chat';
import DocumentUpload from './components/DocumentUpload';
import { API_BASE } from './lib/api';

export default function App() {
  const [paperCount, setPaperCount] = useState<number | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  const refreshPaperCount = useCallback(() => {
    fetch(`${API_BASE}/api/papers`)
      .then((r) => r.json())
      .then((data) => setPaperCount(data.count ?? 0))
      .catch(() => setPaperCount(null));
  }, []);

  useEffect(() => {
    refreshPaperCount();
  }, [refreshPaperCount]);

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <div className="brand">
            <div className="brand-mark">M</div>
            <div className="brand-text">
              <span className="brand-name">Meridiany</span>
              <span className="brand-sub">by Meridian Analytics</span>
            </div>
          </div>
          <div className="header-actions">
            {paperCount !== null && (
              <span className="corpus-badge">{paperCount} papers indexed</span>
            )}
            <button className="upload-btn" onClick={() => setUploadOpen(true)}>
              Upload research
            </button>
          </div>
        </div>
      </header>

      <main className="hero">
        <div className="hero-content">
          <h1 className="hero-title">
            Answers grounded in<br />
            <em>real research</em>
          </h1>
          <p className="hero-subtitle">
            Explore Meridian Analytics' curated research library with Meridiany.
            Every answer cites its source — no speculation, no guesswork.
          </p>
        </div>

        <div className="chat-container">
          <Chat surface="landing" onDocumentIndexed={refreshPaperCount} />
        </div>
      </main>

      <footer className="footer">
        <p>© {new Date().getFullYear()} Meridian Analytics. All rights reserved.</p>
        <p className="footer-note">Powered by Claude · Data stored securely in Supabase</p>
      </footer>

      <DocumentUpload
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUploaded={refreshPaperCount}
      />
    </div>
  );
}
