import type {
  AssistantState,
  IntentActionKind,
  IntentCode,
  LlmCandidatePayload,
  LlmIntentResult,
  LlmRecentAction,
  ScreenId,
} from './types';

const ENDPOINT = '/api/intent-llm';
const DEFAULT_TIMEOUT_MS = 15000;

export const INFO_READBACK_INTENTS = new Set<IntentCode>([
  'NAV_NOTIFICATIONS',
  'FINE_CHECK_NOW',
  'FINE_OPEN_DETAIL',
  'FINE_PAYMENT_GUIDE',
  'INSURANCE_VIEW_TNDS',
  'INSURANCE_VIEW_PHYSICAL',
  'UTILITY_GAS_OPEN',
]);

export const VISUAL_REQUIRED_INTENTS = new Set<IntentCode>([
  'INSURANCE_BUY',
  'UTILITY_REGISTRATION_OPEN',
]);

export function getIntentActionKind(intentCode: IntentCode): IntentActionKind {
  if (VISUAL_REQUIRED_INTENTS.has(intentCode)) return 'visual_required';
  if (INFO_READBACK_INTENTS.has(intentCode)) return 'info_readback';
  return 'exec';
}

export type ClassifyIntentRemoteInput = {
  transcript: string;
  screen: ScreenId;
  assistantState: AssistantState;
  candidates: LlmCandidatePayload[];
  recentActions?: LlmRecentAction[];
  timeoutMs?: number;
  signal?: AbortSignal;
};

export type LlmFailureReason =
  | 'no-candidates'
  | 'http-error'
  | 'bad-payload'
  | 'aborted'
  | 'network'
  | 'timeout';

export type ClassifyIntentRemoteOutcome =
  | { ok: true; result: LlmIntentResult }
  | { ok: false; reason: LlmFailureReason; detail?: string };

export async function classifyIntentRemote(
  input: ClassifyIntentRemoteInput,
): Promise<ClassifyIntentRemoteOutcome> {
  if (!input.candidates.length) {
    return { ok: false, reason: 'no-candidates' };
  }

  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  let timedOut = false;
  const timer = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  if (input.signal) {
    if (input.signal.aborted) {
      controller.abort();
    } else {
      input.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
  }

  const startedAt = performance.now();
  console.debug('[llm] → POST', ENDPOINT, {
    transcript: input.transcript,
    screen: input.screen,
    assistantState: input.assistantState,
    candidateCount: input.candidates.length,
    recentActions: input.recentActions,
  });

  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transcript: input.transcript,
        screen: input.screen,
        assistantState: input.assistantState,
        candidates: input.candidates,
        recentActions: input.recentActions,
      }),
      signal: controller.signal,
    });

    const elapsed = Math.round(performance.now() - startedAt);

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      console.warn('[llm] ✗ HTTP', response.status, body, `(${elapsed}ms)`);
      return { ok: false, reason: 'http-error', detail: `HTTP ${response.status} ${body}` };
    }

    const data = (await response.json()) as LlmIntentResult & { error?: string };
    if (data?.error) {
      console.warn('[llm] ✗ server error', data.error, `(${elapsed}ms)`);
      return { ok: false, reason: 'bad-payload', detail: data.error };
    }
    if (!data || typeof data.confidence !== 'number') {
      console.warn('[llm] ✗ bad payload', data, `(${elapsed}ms)`);
      return { ok: false, reason: 'bad-payload', detail: 'missing confidence' };
    }

    const result: LlmIntentResult = {
      intentCode: typeof data.intentCode === 'string' ? data.intentCode : null,
      confidence: data.confidence,
      reason: typeof data.reason === 'string' ? data.reason : undefined,
      latencyMs: typeof data.latencyMs === 'number' ? data.latencyMs : undefined,
      cacheHit: Boolean(data.cacheHit),
    };
    console.debug(
      `[llm] ← ${result.intentCode ?? 'null'} conf=${result.confidence.toFixed(2)} reason="${result.reason ?? ''}" (${elapsed}ms, cache=${result.cacheHit})`,
    );
    return { ok: true, result };
  } catch (error: any) {
    const elapsed = Math.round(performance.now() - startedAt);
    if (timedOut) {
      console.warn('[llm] ✗ timeout', `(${elapsed}ms)`);
      return { ok: false, reason: 'timeout', detail: `${timeoutMs}ms` };
    }
    if (error?.name === 'AbortError') {
      console.warn('[llm] ✗ aborted', `(${elapsed}ms)`);
      return { ok: false, reason: 'aborted' };
    }
    console.warn('[llm] ✗ network', error?.message || error, `(${elapsed}ms)`);
    return { ok: false, reason: 'network', detail: error?.message || String(error) };
  } finally {
    window.clearTimeout(timer);
  }
}
