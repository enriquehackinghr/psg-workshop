import pdf from 'pdf-parse';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';

export const SUPPORTED_EXTENSIONS = [
  'pdf',
  'md',
  'markdown',
  'txt',
  'docx',
  'csv',
  'xlsx',
  'xls',
] as const;

const EXTENSION_SET = new Set<string>(SUPPORTED_EXTENSIONS);

const SPREADSHEET_MIMES = new Set([
  'text/csv',
  'application/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

export const ACCEPTED_FILE_INPUT =
  '.pdf,.md,.markdown,.txt,.docx,.csv,.xlsx,.xls,' +
  'application/pdf,text/markdown,text/plain,' +
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document,' +
  'text/csv,application/csv,application/vnd.ms-excel,' +
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export function isSupportedDocument(filename: string, mimetype?: string): boolean {
  const ext = filename.toLowerCase().split('.').pop();
  if (ext && EXTENSION_SET.has(ext)) return true;
  if (mimetype && (SPREADSHEET_MIMES.has(mimetype) || mimetype === 'application/pdf')) return true;
  return false;
}

function escapeCell(value: unknown): string {
  return String(value ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\n/g, ' ');
}

function spreadsheetToText(buffer: Buffer): string {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const parts: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });

    if (!rows.length) continue;

    parts.push(`## Sheet: ${sheetName}\n`);

    const headers = rows[0].map((cell) => escapeCell(cell));
    if (headers.some((h) => h.length > 0)) {
      parts.push(`| ${headers.join(' | ')} |`);
      parts.push(`| ${headers.map(() => '---').join(' | ')} |`);

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i].map((cell) => escapeCell(cell));
        if (row.every((cell) => cell.length === 0)) continue;
        parts.push(`| ${row.join(' | ')} |`);
      }
    }

    parts.push('');
  }

  const text = parts.join('\n').trim();
  if (!text) {
    throw new Error('The spreadsheet appears to be empty');
  }

  return text;
}

export async function extractTextFromFile(buffer: Buffer, filename: string): Promise<string> {
  const ext = filename.toLowerCase().split('.').pop();

  if (ext === 'pdf') {
    const parsed = await pdf(buffer);
    return parsed.text;
  }
  if (ext === 'md' || ext === 'markdown' || ext === 'txt') {
    return buffer.toString('utf-8');
  }
  if (ext === 'docx') {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }
  if (ext === 'csv' || ext === 'xlsx' || ext === 'xls') {
    return spreadsheetToText(buffer);
  }

  throw new Error(
    `Unsupported file type: .${ext}. Supported: PDF, Word, Excel, CSV, Markdown, and text.`
  );
}

export function contentTypeFor(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop();
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (ext === 'xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (ext === 'xls') return 'application/vnd.ms-excel';
  if (ext === 'csv') return 'text/csv';
  if (ext === 'md' || ext === 'markdown') return 'text/markdown';
  return 'text/plain';
}

export function titleFromDocument(filename: string, content: string): string {
  const h1 = content.match(/^#\s+(.+)$/m);
  if (h1?.[1]) return h1[1].trim().slice(0, 200);
  return filename
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export const MAX_CHAT_DOCUMENT_CHARS = 120_000;

export function truncateForContext(text: string, max = MAX_CHAT_DOCUMENT_CHARS): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + '\n\n[Document truncated for length…]';
}
