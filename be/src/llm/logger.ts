import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

export type LlmLogEntry = {
  transcript: string;
  screen: string;
  intentCode: string | null;
  confidence: number;
  latencyMs: number;
  cacheHit: boolean;
  error?: string;
};

const LOG_DIR = path.resolve(process.cwd(), 'logs');
const LOG_FILE = path.join(LOG_DIR, 'llm-intent.jsonl');

let dirReady = false;
async function ensureDir(): Promise<void> {
  if (dirReady) return;
  await mkdir(LOG_DIR, { recursive: true });
  dirReady = true;
}

function logEnabled(): boolean {
  return (process.env.LLM_INTENT_LOG || 'true').toLowerCase() !== 'false';
}

export function appendLog(entry: LlmLogEntry): void {
  if (!logEnabled()) return;
  const line = JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n';
  ensureDir()
    .then(() => appendFile(LOG_FILE, line, 'utf8'))
    .catch((err) => {
      console.error('[intent-llm] log write failed:', err?.message || err);
    });
}
