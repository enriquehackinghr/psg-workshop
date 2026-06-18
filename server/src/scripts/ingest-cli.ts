import '../lib/env.js';
import fs from 'fs';
import path from 'path';
import { ingestPaper } from '../lib/ingestion.js';

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log(`
Usage: npm run ingest -- <file-path> --title "Paper Title" [options]

Supported formats: PDF, Word, Excel (.xlsx/.xls), CSV, Markdown (.md), plain text (.txt)

Options:
  --title "Title"           Paper title (required)
  --authors "A, B, C"       Comma-separated author names
  --date "2024-01-15"       Publication date (YYYY-MM-DD)
  --url "https://..."       Source URL

Example:
  npm run ingest -- ./papers/study.pdf --title "Market Analysis 2024" --authors "Smith, Jones"
`);
    process.exit(1);
  }

  const filePath = args[0];
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  let title = '';
  let authors: string[] = [];
  let publicationDate: string | undefined;
  let sourceUrl: string | undefined;

  for (let i = 1; i < args.length; i++) {
    switch (args[i]) {
      case '--title':
        title = args[++i];
        break;
      case '--authors':
        authors = args[++i].split(',').map((a) => a.trim());
        break;
      case '--date':
        publicationDate = args[++i];
        break;
      case '--url':
        sourceUrl = args[++i];
        break;
    }
  }

  if (!title) {
    console.error('--title is required');
    process.exit(1);
  }

  const fileBuffer = fs.readFileSync(path.resolve(filePath));
  const filename = path.basename(filePath);

  console.log(`Ingesting: ${title}`);
  console.log(`File: ${filePath} (${(fileBuffer.length / 1024).toFixed(1)} KB)`);

  const result = await ingestPaper({
    title,
    authors,
    publicationDate,
    sourceUrl,
    fileBuffer,
    filename,
  });

  console.log(`Done! Paper ID: ${result.paperId}, Chunks: ${result.chunkCount}`);
}

main().catch((err) => {
  console.error('Ingestion failed:', err.message);
  process.exit(1);
});
