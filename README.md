# Meridiany

AI chatbot that answers questions grounded in Meridian Analytics' curated research library. Powered by Claude, hosted on Render, with Supabase for storage and vector search.

## Features

- **RAG-powered chat** — Retrieves relevant paper excerpts via pgvector similarity search, then generates cited answers with Claude
- **Landing page** — Branded primary interface with streaming responses, citations, suggested questions, and feedback
- **Embeddable widget** — Drop-in script tag for other Meridian web properties
- **PDF ingestion pipeline** — Upload papers via CLI or admin API; automatic chunking and embedding
- **Data collection** — All interactions logged to Supabase for quality monitoring

## Architecture

```
User (landing page / widget)
        ↓
  Express API (Render)
        ↓
  ┌─────┴─────┐
  ↓           ↓
Supabase    Claude API
(pgvector)  (generation)
  +
Voyage AI
(embeddings)
```

## Quick Start

### Prerequisites

- Node.js 20+
- Supabase project with pgvector enabled
- Anthropic API key (Claude)
- Voyage API key (embeddings)

### 1. Set up Supabase

1. Create a new Supabase project
2. Run the migration in `supabase/migrations/001_initial_schema.sql` via the SQL Editor
3. Create a Storage bucket named `research-papers` (private)
4. Copy your project URL and service role key

### 2. Configure environment

```bash
cp .env.example .env
# Fill in your API keys and Supabase credentials
```

### 3. Install and run

```bash
npm install
npm run dev:server   # Terminal 1 – API on :3001
npm run dev:client   # Terminal 2 – UI on :5173
```

### 4. Ingest research papers

**CLI:**
```bash
npm run ingest -- ./path/to/paper.pdf --title "Paper Title" --authors "Author One, Author Two" --date "2024-06-01"
```

**Admin API:**
```bash
curl -X POST http://localhost:3001/api/admin/papers/upload \
  -H "X-Admin-Key: your-admin-key" \
  -F "pdf=@./paper.pdf" \
  -F "title=Paper Title" \
  -F "authors=Author One, Author Two"
```

### 5. Build for production

```bash
npm run build
npm start
```

## Deploy to Render

1. Connect this repo to Render
2. Render will use `render.yaml` for configuration
3. Set environment variables in the Render dashboard:
   - `ANTHROPIC_API_KEY`
   - `VOYAGE_API_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ADMIN_API_KEY`
   - `ALLOWED_ORIGINS` (comma-separated host origins for widget embeds, or `*`)

## Embeddable Widget

Add this snippet to any page:

```html
<script
  src="https://your-app.onrender.com/widget.js"
  data-auto-init
  data-api-url="https://your-app.onrender.com"
  data-accent-color="#1e4d3a"
  data-position="bottom-right"
></script>
```

Or initialize programmatically:

```html
<script src="https://your-app.onrender.com/widget.js"></script>
<script>
  MeridianWidget.init({
    apiUrl: 'https://your-app.onrender.com',
    accentColor: '#1e4d3a',
    position: 'bottom-left'
  });
</script>
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/chat` | Stream a chat response (SSE) |
| POST | `/api/feedback` | Submit thumbs up/down feedback |
| GET | `/api/papers` | List active papers (public) |
| GET | `/api/health` | Health check |
| POST | `/api/admin/papers/upload` | Upload PDF (requires `X-Admin-Key`) |
| GET | `/api/admin/papers` | List all papers (admin) |
| DELETE | `/api/admin/papers/:id` | Remove a paper (admin) |

## Project Structure

```
├── client/          React landing page (Vite)
├── server/          Express API + RAG pipeline
├── widget/          Embeddable chat widget (IIFE)
├── supabase/        Database migrations
├── render.yaml      Render deployment config
└── package.json     Monorepo root
```

## Data Collection

Every chat interaction is logged to the `interactions` table with:
- Question and answer
- Retrieved source passages
- Surface (landing or widget)
- Anonymized session ID
- Optional feedback (thumbs up/down)

## License

Proprietary – Meridian Analytics
