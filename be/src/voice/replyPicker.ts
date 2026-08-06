import type { ScreenAction, ScreenId } from './types.js';

export type ReplyContext = {
  plate?: string;
  channelName?: string;
  availableChannels?: string;
  routeOrigin?: string;
  routeDest?: string;
  notificationCount?: number | string;
  nearestGasDistance?: string;
  topicName?: string;
  alertCount?: number | string;
  fineCount?: number | string;
  fineCountText?: string;
};

const FALLBACK_TOKENS: Record<string, string> = {
  '{plate}': 'biển số của bạn',
  '{channelName}': 'kênh hiện tại',
  '{availableChannels}': 'các kênh radio',
  '{routeOrigin}': 'điểm xuất phát',
  '{routeDest}': 'điểm đến',
  '{notificationCount}': 'một vài',
  '{nearestGasDistance}': 'gần đây',
  '{topicName}': 'chủ đề này',
  '{alertCount}': 'vài',
  '{fineCount}': 'vài',
  '{fineCountText}': 'vài',
};

export function interpolate(template: string, context: ReplyContext | undefined): string {
  let out = template;
  if (context) {
    for (const [key, value] of Object.entries(context)) {
      if (value === undefined || value === null) continue;
      out = out.replaceAll(`{${key}}`, String(value));
    }
  }
  for (const [token, fallback] of Object.entries(FALLBACK_TOKENS)) {
    if (out.includes(token)) {
      out = out.replaceAll(token, fallback);
    }
  }
  return out;
}

export function pickFeedback(feedback: string | string[], seed?: string): string {
  if (typeof feedback === 'string') return feedback;
  if (feedback.length === 0) return '';
  if (feedback.length === 1) return feedback[0];
  const idx = seed ? hashStr(seed) % feedback.length : Math.floor(Math.random() * feedback.length);
  return feedback[idx];
}

export function pickConfirmPrompt(
  action: ScreenAction,
  screen: ScreenId,
  seed?: string,
): string {
  const byScreen = action.confirmPromptByScreen?.[screen];
  if (byScreen) return pickFeedback(byScreen, seed);
  if (action.confirmPrompt) return pickFeedback(action.confirmPrompt, seed);
  return 'Mình thực hiện lệnh này cho bạn nhé?';
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}
