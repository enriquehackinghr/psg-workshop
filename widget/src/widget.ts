interface WidgetConfig {
  apiUrl: string;
  accentColor: string;
  position: 'bottom-right' | 'bottom-left';
}

interface Citation {
  paper_id: string;
  paper_title: string;
  page_number: number | null;
  section_title: string | null;
  source_url: string | null;
}

const DEFAULT_CONFIG: WidgetConfig = {
  apiUrl: '',
  accentColor: '#1e4d3a',
  position: 'bottom-right',
};

function getSessionId(): string {
  const key = 'meridian_widget_session';
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(key, id);
  }
  return id;
}

function injectStyles(config: WidgetConfig) {
  if (document.getElementById('meridian-widget-styles')) return;

  const style = document.createElement('style');
  style.id = 'meridian-widget-styles';
  style.textContent = `
    #meridian-widget-root { all: initial; font-family: 'DM Sans', system-ui, sans-serif; }
    #meridian-widget-root * { box-sizing: border-box; }

    .mw-launcher {
      position: fixed;
      ${config.position === 'bottom-left' ? 'left: 24px;' : 'right: 24px;'}
      bottom: 24px;
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: ${config.accentColor};
      color: white;
      border: none;
      cursor: pointer;
      box-shadow: 0 4px 20px rgba(0,0,0,0.2);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 99999;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .mw-launcher:hover { transform: scale(1.05); box-shadow: 0 6px 28px rgba(0,0,0,0.25); }
    .mw-launcher svg { width: 24px; height: 24px; }

    .mw-panel {
      position: fixed;
      ${config.position === 'bottom-left' ? 'left: 24px;' : 'right: 24px;'}
      bottom: 92px;
      width: 380px;
      max-width: calc(100vw - 48px);
      height: 520px;
      max-height: calc(100vh - 120px);
      background: #fff;
      border-radius: 16px;
      box-shadow: 0 8px 40px rgba(0,0,0,0.15);
      display: flex;
      flex-direction: column;
      z-index: 99998;
      overflow: hidden;
      border: 1px solid #e8e6e1;
      opacity: 0;
      transform: translateY(12px) scale(0.97);
      pointer-events: none;
      transition: opacity 0.2s, transform 0.2s;
    }
    .mw-panel.open {
      opacity: 1;
      transform: translateY(0) scale(1);
      pointer-events: all;
    }

    .mw-header {
      background: ${config.accentColor};
      color: white;
      padding: 14px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
    }
    .mw-header-title { font-size: 14px; font-weight: 600; }
    .mw-header-sub { font-size: 11px; opacity: 0.8; }
    .mw-close {
      background: rgba(255,255,255,0.15);
      border: none;
      color: white;
      width: 28px;
      height: 28px;
      border-radius: 6px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      line-height: 1;
    }
    .mw-close:hover { background: rgba(255,255,255,0.25); }

    .mw-messages {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      background: #f8f7f4;
    }

    .mw-welcome {
      text-align: center;
      color: #6b6b65;
      font-size: 12px;
      padding: 8px 4px;
      line-height: 1.5;
    }

    .mw-msg { display: flex; gap: 8px; align-items: flex-start; }
    .mw-msg.user { flex-direction: row-reverse; }
    .mw-msg-avatar {
      width: 26px; height: 26px; border-radius: 6px;
      display: flex; align-items: center; justify-content: center;
      font-size: 10px; font-weight: 600; flex-shrink: 0;
    }
    .mw-msg.user .mw-msg-avatar { background: ${config.accentColor}; color: white; }
    .mw-msg.assistant .mw-msg-avatar { background: #e8f2ed; color: ${config.accentColor}; }
    .mw-msg-body { max-width: 82%; }
    .mw-msg.user .mw-msg-body { text-align: right; }
    .mw-msg-content {
      padding: 8px 12px; border-radius: 10px; font-size: 13px; line-height: 1.5;
      white-space: pre-wrap;
    }
    .mw-msg.user .mw-msg-content { background: ${config.accentColor}; color: white; }
    .mw-msg.assistant .mw-msg-content { background: #f3f1ec; color: #1a1a18; }

    .mw-citations {
      margin-top: 6px; padding: 6px 8px; background: #fff;
      border-radius: 6px; font-size: 11px; border: 1px solid #e8e6e1;
    }
    .mw-citations-label { font-weight: 600; color: #6b6b65; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; }
    .mw-citations a { color: ${config.accentColor}; text-decoration: none; }
    .mw-citations a:hover { text-decoration: underline; }

    .mw-feedback { display: flex; align-items: center; gap: 4px; margin-top: 4px; }
    .mw-feedback span { font-size: 11px; color: #6b6b65; margin-right: 2px; }
    .mw-fb-btn {
      background: none; border: 1px solid #e8e6e1; border-radius: 4px;
      padding: 2px 6px; cursor: pointer; font-size: 12px; color: #6b6b65;
    }
    .mw-fb-btn:hover:not(:disabled) { border-color: ${config.accentColor}; color: ${config.accentColor}; }
    .mw-fb-btn.active { background: #e8f2ed; border-color: ${config.accentColor}; color: ${config.accentColor}; }
    .mw-fb-btn:disabled { cursor: default; }

    .mw-input-area {
      display: flex; gap: 6px; padding: 10px 12px;
      border-top: 1px solid #e8e6e1; background: white; flex-shrink: 0;
    }
    .mw-input {
      flex: 1; border: 1px solid #e8e6e1; border-radius: 8px;
      padding: 8px 10px; font-size: 13px; font-family: inherit;
      resize: none; outline: none; max-height: 80px; line-height: 1.4;
    }
    .mw-input:focus { border-color: ${config.accentColor}; }
    .mw-send {
      width: 36px; height: 36px; background: ${config.accentColor}; color: white;
      border: none; border-radius: 8px; cursor: pointer;
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    }
    .mw-send:disabled { opacity: 0.4; cursor: not-allowed; }
    .mw-send svg { width: 16px; height: 16px; }

    .mw-typing span {
      display: inline-block; width: 5px; height: 5px;
      background: #6b6b65; border-radius: 50%; margin: 0 2px;
      animation: mw-bounce 1.2s infinite;
    }
    .mw-typing span:nth-child(2) { animation-delay: 0.2s; }
    .mw-typing span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes mw-bounce {
      0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
      30% { transform: translateY(-3px); opacity: 1; }
    }

    @media (max-width: 480px) {
      .mw-panel { width: calc(100vw - 32px); ${config.position === 'bottom-left' ? 'left: 16px;' : 'right: 16px;'} bottom: 80px; }
      .mw-launcher { ${config.position === 'bottom-left' ? 'left: 16px;' : 'right: 16px;'} bottom: 16px; }
    }
  `;
  document.head.appendChild(style);
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  interactionId?: string | null;
  feedbackGiven?: boolean;
}

async function streamChat(
  apiUrl: string,
  question: string,
  callbacks: {
    onToken: (text: string) => void;
    onSources: (sources: Citation[]) => void;
    onDone: (interactionId: string | null) => void;
    onError: (message: string) => void;
  }
) {
  const response = await fetch(`${apiUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, sessionId: getSessionId(), surface: 'widget' }),
  });

  if (!response.ok) {
    callbacks.onError('Request failed');
    return;
  }

  const reader = response.body?.getReader();
  if (!reader) { callbacks.onError('No stream'); return; }

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() ?? '';

    for (const part of parts) {
      const lines = part.split('\n');
      let event = 'message';
      let data = '';
      for (const line of lines) {
        if (line.startsWith('event: ')) event = line.slice(7);
        if (line.startsWith('data: ')) data = line.slice(6);
      }
      if (!data) continue;
      try {
        const parsed = JSON.parse(data);
        if (event === 'token') callbacks.onToken(parsed.text);
        if (event === 'sources') callbacks.onSources(parsed.sources);
        if (event === 'done') callbacks.onDone(parsed.interactionId);
        if (event === 'error') callbacks.onError(parsed.message);
      } catch { /* skip */ }
    }
  }
}

function renderCitations(citations: Citation[]): string {
  const unique = citations.reduce<Citation[]>((acc, c) => {
    if (!acc.find((a) => a.paper_id === c.paper_id)) acc.push(c);
    return acc;
  }, []);

  const items = unique.map((c) => {
    const title = c.source_url
      ? `<a href="${c.source_url}" target="_blank" rel="noopener">${escapeHtml(c.paper_title)}</a>`
      : escapeHtml(c.paper_title);
    const meta = c.page_number ? ` · p. ${c.page_number}` : '';
    return `<div>${title}${meta}</div>`;
  }).join('');

  return `<div class="mw-citations"><div class="mw-citations-label">Sources</div>${items}</div>`;
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function createWidget(config: WidgetConfig) {
  injectStyles(config);

  const root = document.createElement('div');
  root.id = 'meridian-widget-root';
  document.body.appendChild(root);

  let isOpen = false;
  let isLoading = false;
  const messages: Message[] = [];

  const launcher = document.createElement('button');
  launcher.className = 'mw-launcher';
  launcher.setAttribute('aria-label', 'Open Meridiany');
  launcher.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;

  const panel = document.createElement('div');
  panel.className = 'mw-panel';
  panel.innerHTML = `
    <div class="mw-header">
      <div>
        <div class="mw-header-title">Meridiany</div>
        <div class="mw-header-sub">Grounded in published research</div>
      </div>
      <button class="mw-close" aria-label="Close">×</button>
    </div>
    <div class="mw-messages"></div>
    <div class="mw-input-area">
      <textarea class="mw-input" placeholder="Ask a research question..." rows="1"></textarea>
      <button class="mw-send" aria-label="Send">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m5 12 7-7 7 7M12 5v14"/></svg>
      </button>
    </div>
  `;

  root.appendChild(launcher);
  root.appendChild(panel);

  const messagesEl = panel.querySelector('.mw-messages') as HTMLDivElement;
  const inputEl = panel.querySelector('.mw-input') as HTMLTextAreaElement;
  const sendBtn = panel.querySelector('.mw-send') as HTMLButtonElement;
  const closeBtn = panel.querySelector('.mw-close') as HTMLButtonElement;

  function renderMessages() {
    if (messages.length === 0) {
      messagesEl.innerHTML = `<div class="mw-welcome">Ask Meridiany anything about the research library. Every answer includes source citations.</div>`;
      return;
    }

    messagesEl.innerHTML = messages.map((msg, i) => {
      const isLast = i === messages.length - 1;
      const typing = isLast && isLoading && msg.role === 'assistant' && !msg.content
        ? '<span class="mw-typing"><span></span><span></span><span></span></span>'
        : '';

      const citations = msg.citations?.length ? renderCitations(msg.citations) : '';

      let feedback = '';
      if (msg.role === 'assistant' && msg.content && !isLoading && msg.interactionId) {
        const upActive = msg.feedbackGiven ? 'active' : '';
        feedback = `<div class="mw-feedback" data-idx="${i}">
          <span>Helpful?</span>
          <button class="mw-fb-btn mw-fb-up ${upActive}" data-idx="${i}" data-rating="up" ${msg.feedbackGiven ? 'disabled' : ''}>👍</button>
          <button class="mw-fb-btn mw-fb-down" data-idx="${i}" data-rating="down" ${msg.feedbackGiven ? 'disabled' : ''}>👎</button>
        </div>`;
      }

      return `<div class="mw-msg ${msg.role}">
        <div class="mw-msg-avatar">${msg.role === 'user' ? 'You' : 'My'}</div>
        <div class="mw-msg-body">
          <div class="mw-msg-content">${escapeHtml(msg.content)}${typing}</div>
          ${citations}
          ${feedback}
        </div>
      </div>`;
    }).join('');

    messagesEl.scrollTop = messagesEl.scrollHeight;

    messagesEl.querySelectorAll('.mw-fb-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const idx = parseInt((btn as HTMLElement).dataset.idx ?? '0');
        const rating = (btn as HTMLElement).dataset.rating as 'up' | 'down';
        const msg = messages[idx];
        if (!msg?.interactionId || msg.feedbackGiven) return;

        await fetch(`${config.apiUrl}/api/feedback`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ interactionId: msg.interactionId, rating }),
        });
        msg.feedbackGiven = true;
        renderMessages();
      });
    });
  }

  async function sendMessage() {
    const question = inputEl.value.trim();
    if (!question || isLoading) return;

    messages.push({ role: 'user', content: question });
    const assistantMsg: Message = { role: 'assistant', content: '', citations: [] };
    messages.push(assistantMsg);
    inputEl.value = '';
    isLoading = true;
    sendBtn.disabled = true;
    renderMessages();

    await streamChat(config.apiUrl, question, {
      onToken: (text) => {
        assistantMsg.content += text;
        renderMessages();
      },
      onSources: (sources) => {
        assistantMsg.citations = sources;
        renderMessages();
      },
      onDone: (interactionId) => {
        assistantMsg.interactionId = interactionId;
        isLoading = false;
        sendBtn.disabled = false;
        renderMessages();
      },
      onError: (message) => {
        assistantMsg.content = message;
        isLoading = false;
        sendBtn.disabled = false;
        renderMessages();
      },
    });
  }

  launcher.addEventListener('click', () => {
    isOpen = !isOpen;
    panel.classList.toggle('open', isOpen);
    if (isOpen) inputEl.focus();
  });

  closeBtn.addEventListener('click', () => {
    isOpen = false;
    panel.classList.remove('open');
  });

  sendBtn.addEventListener('click', sendMessage);
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  renderMessages();
}

function init(userConfig: Partial<WidgetConfig> = {}) {
  const script = document.currentScript as HTMLScriptElement | null;
  const apiUrl = userConfig.apiUrl
    || script?.getAttribute('data-api-url')
    || window.location.origin;

  const config: WidgetConfig = {
    ...DEFAULT_CONFIG,
    ...userConfig,
    apiUrl,
    accentColor: userConfig.accentColor || script?.getAttribute('data-accent-color') || DEFAULT_CONFIG.accentColor,
    position: (userConfig.position || script?.getAttribute('data-position') || DEFAULT_CONFIG.position) as WidgetConfig['position'],
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => createWidget(config));
  } else {
    createWidget(config);
  }
}

// Global API
declare global {
  interface Window {
    MeridianWidget: { init: typeof init };
  }
}

window.MeridianWidget = { init };

// Auto-init when loaded via script tag with data-auto-init
const autoScript = document.currentScript as HTMLScriptElement | null;
if (autoScript?.hasAttribute('data-auto-init')) {
  init();
}

export { init };
