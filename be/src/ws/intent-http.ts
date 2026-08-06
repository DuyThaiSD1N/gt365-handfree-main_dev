import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { classifyIntent, type ClassifyResult } from '../llm/intentClassifier.js';
import type { LlmCandidate, RecentAction } from '../llm/promptBuilder.js';
import { appendLog } from '../llm/logger.js';

type CacheEntry = {
  result: ClassifyResult;
  expiresAt: number;
};

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

function cacheKey(transcript: string, screen: string): string {
  return `${transcript.trim().toLowerCase()}|${screen}`;
}

function getCached(key: string): ClassifyResult | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.result;
}

function setCached(key: string, result: ClassifyResult): void {
  cache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS });
}

const RATE_WINDOW_MS = 60 * 1000;
const RATE_LIMIT = 30;
const rateMap = new Map<string, number[]>();

function rateAllow(ip: string): boolean {
  const now = Date.now();
  const arr = rateMap.get(ip) || [];
  const fresh = arr.filter((ts) => now - ts < RATE_WINDOW_MS);
  if (fresh.length >= RATE_LIMIT) {
    rateMap.set(ip, fresh);
    return false;
  }
  fresh.push(now);
  rateMap.set(ip, fresh);
  return true;
}

type IntentLlmRequestBody = {
  transcript?: unknown;
  screen?: unknown;
  assistantState?: unknown;
  candidates?: unknown;
  recentActions?: unknown;
};

function isCandidateArray(value: unknown): value is LlmCandidate[] {
  if (!Array.isArray(value)) return false;
  return value.every(
    (c) =>
      c &&
      typeof c === 'object' &&
      typeof (c as any).intentCode === 'string' &&
      Array.isArray((c as any).phrases) &&
      (c as any).phrases.every((p: unknown) => typeof p === 'string'),
  );
}

function isRecentActionArray(value: unknown): value is RecentAction[] {
  if (!Array.isArray(value)) return false;
  return value.every(
    (a) =>
      a &&
      typeof a === 'object' &&
      typeof (a as any).actionCode === 'string' &&
      typeof (a as any).msAgo === 'number',
  );
}

export function isLlmEnabled(): boolean {
  if ((process.env.LLM_INTENT_ENABLED || 'true').toLowerCase() === 'false') return false;
  const hasQwenPrimary = Boolean(process.env.LLM_BASE_URL);
  const hasOpenLlmFallback = Boolean(process.env.OPENLLM_BASE_URL);
  if (!hasQwenPrimary && !hasOpenLlmFallback) return false;
  return true;
}

export function intentLlmHandler(): RequestHandler {
  return async (req: Request, res: Response, _next: NextFunction) => {
    if (!isLlmEnabled()) {
      res.status(503).json({ error: 'llm-disabled' });
      return;
    }

    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'unknown';
    if (!rateAllow(ip)) {
      res.status(429).json({ error: 'rate-limited' });
      return;
    }

    const body = (req.body || {}) as IntentLlmRequestBody;
    const transcript = typeof body.transcript === 'string' ? body.transcript.trim() : '';
    const screen = typeof body.screen === 'string' ? body.screen : '';
    const assistantState = typeof body.assistantState === 'string' ? body.assistantState : '';
    const candidates = isCandidateArray(body.candidates) ? body.candidates : null;
    const recentActions = isRecentActionArray(body.recentActions) ? body.recentActions : undefined;

    if (!transcript || !screen || !candidates || candidates.length === 0) {
      res.status(400).json({ error: 'invalid-body' });
      return;
    }

    console.log(`[intent-llm] ← "${transcript}" screen=${screen} state=${assistantState} candidates=${candidates.length}`);

    const key = cacheKey(transcript, screen);
    const cached = getCached(key);
    if (cached) {
      console.log(`[intent-llm] ✓ cache ${cached.intentCode ?? 'null'} conf=${cached.confidence.toFixed(2)} (${cached.latencyMs}ms)`);
      appendLog({
        transcript,
        screen,
        intentCode: cached.intentCode,
        confidence: cached.confidence,
        latencyMs: cached.latencyMs,
        cacheHit: true,
      });
      res.json({ ...cached, cacheHit: true });
      return;
    }

    try {
      const result = await classifyIntent({
        transcript,
        screen,
        assistantState,
        candidates,
        recentActions,
      });
      setCached(key, result);
      console.log(`[intent-llm] ✓ ${result.intentCode ?? 'null'} conf=${result.confidence.toFixed(2)} (${result.latencyMs}ms) reason="${result.reason}"`);
      appendLog({
        transcript,
        screen,
        intentCode: result.intentCode,
        confidence: result.confidence,
        latencyMs: result.latencyMs,
        cacheHit: false,
      });
      res.json({ ...result, cacheHit: false });
    } catch (error: any) {
      const message = error?.message || 'llm-error';
      const status = error?.status || error?.code || '';
      console.error(`[intent-llm] ✗ error: ${message} ${status}`);
      appendLog({
        transcript,
        screen,
        intentCode: null,
        confidence: 0,
        latencyMs: 0,
        cacheHit: false,
        error: message,
      });
      res.status(500).json({ error: 'llm-error', detail: message });
    }
  };
}
