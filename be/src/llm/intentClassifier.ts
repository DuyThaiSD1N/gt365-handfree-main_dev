import OpenAI from 'openai';
import {
  buildSystemPrompt,
  buildUserPrompt,
  type BuildPromptInput,
  type LlmCandidate,
} from './promptBuilder.js';

export type ClassifyInput = BuildPromptInput;

export type ClassifyResult = {
  intentCode: string | null;
  confidence: number;
  reason: string;
  latencyMs: number;
};

function normalizeOpenAiCompatibleBaseUrl(baseURL: string): string {
  const trimmed = baseURL.replace(/\/$/, '');
  return trimmed.endsWith('/v1') ? trimmed : `${trimmed}/v1`;
}

function getIntentTimeoutMs(): number {
  return Number(process.env.LLM_INTENT_TIMEOUT_MS || process.env.LLM_TIMEOUT_MS || 60000);
}

// ── Qwen (vLLM primary) client ────────────────────────────────────────────────
let cachedQwenClient: OpenAI | null = null;
function getQwenClient(): OpenAI | null {
  const baseURL = process.env.LLM_BASE_URL;
  if (!baseURL) return null;
  if (cachedQwenClient) return cachedQwenClient;
  cachedQwenClient = new OpenAI({
    apiKey: process.env.LLM_API_KEY || 'none',
    baseURL: normalizeOpenAiCompatibleBaseUrl(baseURL),
  });
  return cachedQwenClient;
}

// ── OpenLLM fallback client ───────────────────────────────────────────────────
let cachedOpenLlmClient: OpenAI | null = null;
function getOpenLlmClient(): OpenAI | null {
  const baseURL = process.env.OPENLLM_BASE_URL;
  if (!baseURL) return null;
  if (cachedOpenLlmClient) return cachedOpenLlmClient;
  cachedOpenLlmClient = new OpenAI({
    apiKey: process.env.OPENLLM_API_KEY || 'none',
    baseURL: normalizeOpenAiCompatibleBaseUrl(baseURL),
  });
  return cachedOpenLlmClient;
}

function clampConfidence(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function validateIntent(
  intentCode: string | null | undefined,
  candidates: LlmCandidate[],
): string | null {
  if (!intentCode) return null;
  const ok = candidates.some((c) => c.intentCode === intentCode);
  return ok ? intentCode : null;
}

/** Bóc JSON từ content (hỗ trợ ```json ... ``` và <think>...</think>) */
function extractJson(content: string): any {
  // Bỏ khối <think>...</think> (Qwen3 reasoning)
  const stripped = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  // Ưu tiên ```json ... ```
  const fenced = stripped.match(/```json\s*([\s\S]*?)```/i);
  const jsonStr = fenced ? fenced[1] : stripped.match(/\{[\s\S]*\}/)?.[0] ?? '';
  return JSON.parse(jsonStr);
}

async function callQwen(
  messages: { role: string; content: string }[],
): Promise<string> {
  const client = getQwenClient()!;
  const model = process.env.LLM_MODEL || 'Qwen/Qwen3.6-35B-A3B';
  const timeoutMs = getIntentTimeoutMs();

  const completion = await client.chat.completions.create({
    model,
    messages: messages as any,
    temperature: 0.1,
    max_tokens: 200,
    response_format: { type: 'json_object' },
  }, { timeout: timeoutMs });

  const content = completion.choices[0]?.message?.content ?? '';
  if (!content) throw new Error('Qwen primary trả content rỗng');
  console.log('[llm] raw content:', content.slice(0, 300));
  return content;
}

async function callOpenLlmFallback(
  messages: { role: string; content: string }[],
): Promise<string> {
  const client = getOpenLlmClient();
  if (!client) throw new Error('Không có OPENLLM_BASE_URL để fallback');
  const model = process.env.OPENLLM_MODEL || 'gpt-4o-mini';
  const timeoutMs = getIntentTimeoutMs();

  const completion = await client.chat.completions.create({
    model,
    messages: messages as any,
    response_format: { type: 'json_object' },
    max_completion_tokens: 200,
  }, { timeout: timeoutMs });

  return completion.choices[0]?.message?.content ?? '{}';
}

export async function classifyIntent(input: ClassifyInput): Promise<ClassifyResult> {
  const start = Date.now();
  const system = buildSystemPrompt();
  const user = buildUserPrompt(input);
  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];

  let rawContent: string;

  // ── Primary: Qwen vLLM ────────────────────────────────────────────────────
  const qwenClient = getQwenClient();
  if (qwenClient) {
    try {
      rawContent = await callQwen(messages);
      console.log('[llm] primary=qwen ok');
    } catch (primaryErr: any) {
      console.warn('[llm] primary=qwen lỗi:', primaryErr?.message || primaryErr, '→ thử fallback OpenLLM');
      // ── Fallback: OpenLLM ─────────────────────────────────────────────────
      try {
        rawContent = await callOpenLlmFallback(messages);
        console.log('[llm] fallback=openllm ok');
      } catch (fallbackErr: any) {
        const latencyMs = Date.now() - start;
        console.error('[llm] fallback=openllm lỗi:', fallbackErr?.message || fallbackErr);
        return { intentCode: null, confidence: 0, reason: 'llm-both-failed', latencyMs };
      }
    }
  } else {
    // Không có LLM_BASE_URL → chỉ dùng OpenLLM fallback
    try {
      rawContent = await callOpenLlmFallback(messages);
      console.log('[llm] primary=openllm ok (no LLM_BASE_URL)');
    } catch (err: any) {
      const latencyMs = Date.now() - start;
      console.error('[llm] openllm lỗi:', err?.message || err);
      return { intentCode: null, confidence: 0, reason: 'llm-error', latencyMs };
    }
  }

  const latencyMs = Date.now() - start;

  let parsed: any;
  try {
    parsed = extractJson(rawContent!);
  } catch {
    return { intentCode: null, confidence: 0, reason: 'parse-error', latencyMs };
  }

  const intentCode = validateIntent(parsed.intentCode, input.candidates);
  const confidence = intentCode ? clampConfidence(parsed.confidence) : 0;
  const reason = typeof parsed.reason === 'string' ? parsed.reason.slice(0, 200) : '';

  return { intentCode, confidence, reason, latencyMs };
}
