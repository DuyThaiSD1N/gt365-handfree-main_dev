import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { classifyIntent } from '../llm/intentClassifier.js';
import { isLlmEnabled } from './intent-http.js';
import { commands, getFallbackSuggestions, getLlmCandidates } from '../voice/commands.js';
import { matchTranscript } from '../voice/matcher.js';
import { resolveAction } from '../voice/screenActions.js';
import {
  interpolate,
  pickConfirmPrompt,
  pickFeedback,
  type ReplyContext,
} from '../voice/replyPicker.js';
import type {
  ActionCode,
  IntentCode,
  ScreenAction,
  ScreenId,
} from '../voice/types.js';
import { getRadioChannels, formatChannelList, getNextChannel, getPrevChannel } from '../store/radioChannels.js';
import { normalizeVietnamese } from '../voice/normalizer.js';

const RADIO_STOPWORDS = new Set([
  'mo',
  'bat',
  'nghe',
  'phat',
  'radio',
  'dai',
  'kenh',
  'cho',
  'toi',
  'minh',
  'em',
  'anh',
  'chi',
  'giup',
  'nhe',
  'nha',
  'di',
  'len',
  'voi',
  'duoc',
  'cua',
  'sang',
  'chuyen',
  'doi',
  'muon',
  'va',
  'hay',
  'vao',
]);

function toTopicTokens(text: string): string[] {
  return normalizeVietnamese(text)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length > 0 && !RADIO_STOPWORDS.has(token));
}

function channelMatchScore(inputText: string, channelName: string): number {
  const normalizedInput = normalizeVietnamese(inputText);
  const normalizedChannel = normalizeVietnamese(channelName);

  // Exact substring match
  if (normalizedInput.includes(normalizedChannel)) {
    return 1;
  }

  const inputTokens = toTopicTokens(normalizedInput);
  const channelTokens = toTopicTokens(normalizedChannel);
  if (inputTokens.length === 0 || channelTokens.length === 0) {
    return 0;
  }

  const channelSet = new Set(channelTokens);
  let overlap = 0;

  for (const token of inputTokens) {
    if (channelSet.has(token)) {
      overlap += 1;
      continue;
    }

    // Cho phép khớp gần cho ASR thiếu/méo 1 phần từ dài.
    if (
      token.length >= 3 &&
      channelTokens.some((chToken) => {
        // Khớp nếu token là substring của chToken hoặc ngược lại
        if (chToken.includes(token) || token.includes(chToken)) return true;
        // Khớp nếu 2 token bắt đầu giống nhau >= 80% ký tự ĐẦU (prefix match)
        // Chỉ áp dụng khi độ dài gần bằng nhau (tránh "nhạc" match "nhân")
        const minLen = Math.min(token.length, chToken.length);
        const maxLen = Math.max(token.length, chToken.length);
        if (maxLen > minLen * 1.5) return false; // quá khác biệt về độ dài
        let commonChars = 0;
        for (let i = 0; i < minLen; i++) {
          if (token[i] === chToken[i]) commonChars++;
          else break; // prefix match — dừng khi gặp ký tự khác
        }
        return commonChars / maxLen >= 0.75;
      })
    ) {
      overlap += 0.6;
    }
  }

  if (overlap <= 0) {
    return 0;
  }

  const coverage = overlap / channelTokens.length;
  const precision = overlap / inputTokens.length;
  return coverage * 0.7 + precision * 0.3;
}

function findChannelByName(
  text: string,
  overrideChannels?: { id: string; name: string }[] | null,
): { id: string; name: string } | null {
  // Ưu tiên danh sách Android gửi lên, fallback về JSON nếu không có
  const channels = (overrideChannels && overrideChannels.length > 0)
    ? overrideChannels
    : getRadioChannels();
  if (channels.length === 0) return null;


  const inputTopicTokens = toTopicTokens(text);
  if (inputTopicTokens.length === 0) {
    return null;
  }

  let bestIndex = -1;
  let bestScore = 0;
  let secondBestScore = 0;

  channels.forEach((ch, idx) => {
    const score = channelMatchScore(text, ch.name);
    if (score > bestScore) {
      secondBestScore = bestScore;
      bestScore = score;
      bestIndex = idx;
    } else if (score > secondBestScore) {
      secondBestScore = score;
    }
  });

  // Giảm threshold từ 0.45 → 0.35 để dễ khớp hơn
  if (bestIndex < 0 || bestScore < 0.55) {
    return null;
  }

  /// Nếu input có nhiều token topic hơn tên kênh, yêu cầu score cao hơn
  // để tránh "nhạc cổ điển" (3 tokens) match "Nhạc Hàn" (2 tokens) chỉ vì có "nhạc"
  const channelTopicTokens = toTopicTokens(normalizeVietnamese(channels[bestIndex].name));
  if (inputTopicTokens.length > channelTopicTokens.length && bestScore < 0.75) {
    return null;
  }

  if (bestScore < 0.95 && bestScore - secondBestScore < 0.1) {
    return null;
  }

  return channels[bestIndex];
}

const NOOP_WINDOW_MS = 30_000;
const CACHE_TTL_MS = 5 * 60 * 1000;
const RATE_WINDOW_MS = 60 * 1000;
const RATE_LIMIT = 60;

type Pending = {
  intentCode: IntentCode;
  originalText: string;
};

type RecentActionItem = {
  actionCode: ActionCode;
  msAgo: number;
};

// Metadata hướng dẫn client (Android/web) xử lý confirm flow
type ConfirmMeta = {
  maxSilenceRetries: number;      // số lần im lặng tối đa trước khi tự hủy
  retryPrompt: string;            // bot nói khi im lặng lần 1
  cancelMessage: string;          // bot nói khi hủy lệnh sau maxSilenceRetries
  silenceTimeoutSeconds: number;  // giây chờ trước khi coi là im lặng
};

const DEFAULT_CONFIRM_META: ConfirmMeta = {
  maxSilenceRetries: 2,
  retryPrompt: 'Mình chưa nghe rõ, bạn nói "đồng ý" hoặc "hủy" giúp mình nhé.',
  cancelMessage: 'Mình hủy lệnh vì không nhận được xác nhận, bạn cần gì cứ bảo mình nhé.',
  silenceTimeoutSeconds: 10,
};

// Metadata hướng dẫn client xử lý noop follow-up
// Khi đang ở đúng trang user yêu cầu → bot nói rồi mở mic chờ lệnh mới
type NoopMeta = {
  openMicAfterReply: boolean;     // true = mở mic lại sau khi bot nói xong
  silenceTimeoutSeconds: number;  // giây chờ mic trước khi đóng nếu không có lệnh
};

// ActionCode nào cần mở mic sau noop
const NOOP_OPEN_MIC_ACTIONS = new Set<ActionCode>([
  'OPEN_HOME_SCREEN',
  'OPEN_RADIO_SCREEN',
  'OPEN_UTILITIES_SCREEN',
  'OPEN_COMMUNITY_SCREEN',
  'OPEN_PROFILE_SCREEN',
  'OPEN_NOTIFICATIONS_SCREEN',
  'OPEN_ROUTE_SCREEN',
  'ENABLE_VIOLATION_ALERTS',
  'DISABLE_VIOLATION_ALERTS',
  'SHOW_HELP',
]);

function buildNoopMeta(actionCode: ActionCode): NoopMeta {
  return {
    openMicAfterReply: NOOP_OPEN_MIC_ACTIONS.has(actionCode),
    silenceTimeoutSeconds: 5,
  };
}

type ParsedBody = {
  text: string;
  screen: ScreenId;
  pending: Pending | null;
  context: ReplyContext;
  recentActions: RecentActionItem[];
  assistantState: string;
  currentChannelId?: string | null;
  currentGroupId?: string | null;
  radioPlaying?: boolean;
  speedAlertEnabled?: boolean;   // trạng thái cảnh báo tốc độ từ app
  hotspotAlertEnabled?: boolean; // trạng thái cảnh báo điểm nóng từ app
  consecutiveFallbacks?: number;
  channels?: { id: string; name: string }[] | null;
};

type HandfreeResponse =
  | {
    type: 'action';
    reply: string;
    action: { code: ActionCode; nextScreen?: ScreenId; channelId?: string; channelName?: string };
    meta: ResponseMeta;
  }
  | {
    type: 'confirm';
    reply: string;
    pending: Pending;
    confirmMeta: ConfirmMeta;
    meta: ResponseMeta;
  }
  | {
    type: 'clarification';
    reply: string;
    action: { code: ActionCode; nextScreen?: ScreenId };
    openMicAfterReply: boolean; // Tự động mở mic sau khi hỏi
    meta: ResponseMeta;
  }
  | {
    type: 'noop';
    reply: string;
    noopMeta: NoopMeta;
    meta: ResponseMeta;
  }
  | {
    type: 'fallback';
    reply: string;
    suggestions: string[];
    shouldCloseAssistant?: boolean; // Đóng trợ lý sau khi nói reply
    openMicAfterReply?: boolean; // Mở mic tự động sau khi bot nói xong
    consecutiveFallbacks: number; // Trả về để client track
    meta: ResponseMeta;
  };

type ResponseMeta = {
  intentCode: IntentCode | null;
  confidence: number;
  source: 'matcher' | 'llm' | 'confirm' | 'noop' | 'fallback';
  latencyMs: number;
};

const VALID_SCREENS: ReadonlySet<string> = new Set([
  'home',
  'radio',
  'radioOnAir',
  'utilities',
  'community',
  'profile',
  'notifications',
  'route',
  'fineLookup',
  'fineResult',
  'insurance',
  'displaySettings',
  'permissionSettings',
]);

const FALLBACK_REPLIES_FIRST = [
  'Mình chưa nghe rõ lệnh này, bạn nói lại giúp mình nhé.',
  'Hửm, mình chưa rõ ý bạn, bạn nói gọn lại giúp mình nha.',
  'Mình chưa hiểu lệnh đó, bạn thử nói lại cho mình nhé.',
];

const FALLBACK_REPLIES_SECOND = [
  'Mình vẫn chưa nghe rõ, thôi bạn dùng nút bấm cho nhanh nhé, mình tạm nghỉ đây.',
  'Mình chưa hiểu được ý bạn, bạn thao tác bằng tay cho tiện nha, mình đóng đây.',
  'Ui, mình không rõ lệnh này, bạn bấm trên màn hình cho nhanh nhé, mình tắt đây.',
];

const cache = new Map<string, { res: HandfreeResponse; expiresAt: number }>();
const rateMap = new Map<string, number[]>();

function cacheKey(p: ParsedBody): string {
  const pendingKey = p.pending ? `:p=${p.pending.intentCode}` : '';
  const stateKey = p.assistantState !== 'idle' ? `:s=${p.assistantState}` : '';
  const channelKey = p.currentChannelId ? `:ch=${p.currentChannelId}` : '';
  return `${p.text.trim().toLowerCase()}|${p.screen}${pendingKey}${stateKey}${channelKey}`;
}

function getCached(key: string): HandfreeResponse | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.res;
}

function setCached(key: string, res: HandfreeResponse): void {
  cache.set(key, { res, expiresAt: Date.now() + CACHE_TTL_MS });
}

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

function parseBody(raw: any): ParsedBody | null {
  if (!raw || typeof raw !== 'object') return null;
  const text = typeof raw.text === 'string' ? raw.text.trim() : '';
  const screen = typeof raw.screen === 'string' ? raw.screen : '';
  const hasPending = raw.pending && typeof raw.pending === 'object';
  // Cho phép text rỗng nếu có pending (client báo hiệu im lặng khi đang confirm)
  if ((!text && !hasPending) || !screen || !VALID_SCREENS.has(screen)) return null;

  let pending: Pending | null = null;
  if (raw.pending && typeof raw.pending === 'object') {
    const ic = (raw.pending as any).intentCode;
    const ot = (raw.pending as any).originalText;
    if (typeof ic === 'string' && typeof ot === 'string') {
      pending = { intentCode: ic as IntentCode, originalText: ot };
    }
  }

  const context: ReplyContext = {};
  if (raw.context && typeof raw.context === 'object') {
    const c = raw.context as Record<string, unknown>;
    if (typeof c.plate === 'string') context.plate = c.plate;
    if (typeof c.channelName === 'string') context.channelName = c.channelName;
    if (typeof c.routeOrigin === 'string') context.routeOrigin = c.routeOrigin;
    if (typeof c.routeDest === 'string') context.routeDest = c.routeDest;
    if (typeof c.notificationCount === 'number') context.notificationCount = c.notificationCount;
    if (typeof c.nearestGasDistance === 'string') context.nearestGasDistance = c.nearestGasDistance;
    if (typeof c.topicName === 'string') context.topicName = c.topicName;
    if (typeof c.alertCount === 'number') context.alertCount = c.alertCount;
    if (typeof c.fineCount === 'number') context.fineCount = c.fineCount;
    if (typeof c.fineCountText === 'string') context.fineCountText = c.fineCountText;
  }

  const recentActions: RecentActionItem[] = [];
  if (Array.isArray(raw.recentActions)) {
    for (const item of raw.recentActions.slice(0, 3)) {
      if (
        item &&
        typeof item === 'object' &&
        typeof (item as any).actionCode === 'string' &&
        typeof (item as any).msAgo === 'number'
      ) {
        recentActions.push({
          actionCode: (item as any).actionCode as ActionCode,
          msAgo: (item as any).msAgo,
        });
      }
    }
  }

  const currentChannelId = typeof raw.currentChannelId === 'string' ? raw.currentChannelId : null;
  const radioPlaying = typeof raw.radioPlaying === 'boolean' ? raw.radioPlaying : undefined;
  const speedAlertEnabled = typeof raw.speedAlertEnabled === 'boolean' ? raw.speedAlertEnabled : undefined;
  const hotspotAlertEnabled = typeof raw.hotspotAlertEnabled === 'boolean' ? raw.hotspotAlertEnabled : undefined;
  const consecutiveFallbacks = typeof raw.consecutiveFallbacks === 'number' ? raw.consecutiveFallbacks : 0;
  // Parse danh sách kênh do Android gửi lên (override JSON fallback)
  // Validate: phải là array, mỗi phần tử có id (string) và name (string)
  let channels: { id: string; name: string }[] | null = null;
  if (Array.isArray(raw.channels) && raw.channels.length > 0) {
    const parsed = raw.channels.filter(
      (c: any) => c && typeof c.id === 'string' && c.id.trim() !== '' && typeof c.name === 'string' && c.name.trim() !== '',
    ).map((c: any) => ({ id: String(c.id).trim(), name: String(c.name).trim() }));
    if (parsed.length > 0) channels = parsed;
  }
  return {
    text,
    screen: screen as ScreenId,
    pending,
    context,
    recentActions,
    assistantState: typeof raw.assistantState === 'string' ? raw.assistantState : 'idle',
    currentChannelId,
    radioPlaying,
    speedAlertEnabled,
    hotspotAlertEnabled,
    consecutiveFallbacks,
    channels,
  };
}

function buildActionResponse(
  action: ScreenAction,
  p: ParsedBody,
  meta: ResponseMeta,
): HandfreeResponse {
  // Inject availableChannels cho LIST_RADIO_CHANNELS từ file JSON
  if (action.actionCode === 'LIST_RADIO_CHANNELS') {
    const channels = (p.channels && p.channels.length > 0) ? p.channels : getRadioChannels();
    p.context.availableChannels = formatChannelList(channels);
  }

  // Tìm kênh theo tên cho PLAY_RADIO_BY_NAME — trả channelId/channelName để app tự chuyển
  if (action.actionCode === 'PLAY_RADIO_BY_NAME') {
    const found = findChannelByName(p.text, p.channels);
    if (found) {
      p.context.channelName = found.name;
      return {
        type: 'action',
        reply: `Đã chuyển sang kênh ${found.name}.`,
        action: {
          code: action.actionCode,
          nextScreen: action.nextScreen,
          channelId: found.id,
          channelName: found.name,
        },
        meta,
      };
    }
    // Không tìm được → nói tên kênh user hỏi, gợi ý 2 lệnh thay thế, mở mic lại
    const channels = (p.channels && p.channels.length > 0) ? p.channels : getRadioChannels();
    // Trích tên kênh user đang hỏi (bỏ stopwords như "mở kênh", "bật kênh"...)
    const topicTokens = toTopicTokens(p.text);
    const askedName = topicTokens.length > 0 ? topicTokens.join(' ') : p.text.trim();
    return {
      type: 'clarification',
      reply: channels.length > 0
        ? `Không tìm thấy chuyên mục "${askedName}". Bạn có thể nói "Chuyên mục tiếp theo" hoặc "Liệt kê chuyên mục cho tôi" để mình hỗ trợ tiếp nha.`
        : `Mình chưa có danh sách kênh nào, bạn vào màn Radio để xem nhé.`,
      action: { code: action.actionCode, nextScreen: action.nextScreen },
      openMicAfterReply: true,
      meta,
    };
  }

  // Xử lý chuyển kênh tiếp theo
  if (action.actionCode === 'SWITCH_NEXT_CHANNEL') {
    const nextChannel = getNextChannel(p.currentChannelId || null, p.channels);
    if (nextChannel) {
      p.context.channelName = nextChannel.name;
      return {
        type: 'action',
        reply: `Đã chuyển sang kênh ${nextChannel.name}.`,
        action: {
          code: action.actionCode,
          nextScreen: action.nextScreen,
          channelId: nextChannel.id,
          channelName: nextChannel.name,
        },
        meta,
      };
    }
    return {
      type: 'clarification',
      reply: 'Mình chưa biết danh sách kênh của bạn. Bạn thử hỏi "có những kênh nào" để xem nhé.',
      action: { code: action.actionCode },
      openMicAfterReply: true,
      meta,
    };
  }

  // Xử lý chuyển về kênh trước
  if (action.actionCode === 'SWITCH_PREV_CHANNEL') {
    const prevChannel = getPrevChannel(p.currentChannelId || null, p.channels);
    if (prevChannel) {
      p.context.channelName = prevChannel.name;
      return {
        type: 'action',
        reply: `Đã chuyển về kênh ${prevChannel.name}.`,
        action: {
          code: action.actionCode,
          nextScreen: action.nextScreen,
          channelId: prevChannel.id,
          channelName: prevChannel.name,
        },
        meta,
      };
    }
    return {
      type: 'clarification',
      reply: 'Mình chưa biết danh sách kênh của bạn. Bạn thử hỏi "có những kênh nào" để xem nhé.',
      action: { code: action.actionCode },
      openMicAfterReply: true,
      meta,
    };
  }

  const template = pickFeedback(action.feedback, p.text);
  const reply = interpolate(template, p.context);
  return {
    type: 'action',
    reply,
    action: {
      code: action.actionCode,
      ...(action.nextScreen ? { nextScreen: action.nextScreen } : {}),
    },
    meta,
  };
}

function buildConfirmResponse(
  action: ScreenAction,
  p: ParsedBody,
  intentCode: IntentCode,
  confidence: number,
  source: 'matcher' | 'llm',
  latencyMs: number,
): HandfreeResponse {
  const reply = interpolate(pickConfirmPrompt(action, p.screen, p.text), p.context);
  return {
    type: 'confirm',
    reply,
    pending: { intentCode, originalText: p.text },
    confirmMeta: DEFAULT_CONFIRM_META,
    meta: { intentCode, confidence, source, latencyMs },
  };
}

function buildClarificationResponse(
  action: ScreenAction,
  p: ParsedBody,
  clarificationPrompt: string,
  meta: ResponseMeta,
): HandfreeResponse {
  return {
    type: 'clarification',
    reply: clarificationPrompt,
    action: {
      code: action.actionCode,
      ...(action.nextScreen ? { nextScreen: action.nextScreen } : {}),
    },
    openMicAfterReply: true, // Tự động mở mic sau khi hỏi
    meta,
  };
}

function buildFallbackResponse(p: ParsedBody, latencyMs: number): HandfreeResponse {
  const fallbackCount = (p.consecutiveFallbacks || 0) + 1;

  console.log(`[buildFallbackResponse] input consecutiveFallbacks=${p.consecutiveFallbacks}, calculated fallbackCount=${fallbackCount}`);

  // Lần 1: Hỏi lại + mở mic tự động
  if (fallbackCount === 1) {
    return {
      type: 'fallback',
      reply: pickFeedback(FALLBACK_REPLIES_FIRST, p.text),
      suggestions: getFallbackSuggestions(p.screen).slice(0, 6),
      openMicAfterReply: true, // Tự động mở mic để user nói lại
      consecutiveFallbacks: fallbackCount,
      meta: { intentCode: null, confidence: 0, source: 'fallback', latencyMs },
    };
  }

  // Lần 2+: Bảo thôi, đóng trợ lý
  return {
    type: 'fallback',
    reply: pickFeedback(FALLBACK_REPLIES_SECOND, p.text),
    suggestions: [],
    shouldCloseAssistant: true,
    openMicAfterReply: false,
    consecutiveFallbacks: fallbackCount,
    meta: { intentCode: null, confidence: 0, source: 'fallback', latencyMs },
  };
}

function buildNoopResponse(
  p: ParsedBody,
  intentCode: IntentCode,
  actionCode: ActionCode,
  latencyMs: number,
): HandfreeResponse {
  const reply = interpolate(noopReplyFor(actionCode, p.context), p.context);
  return {
    type: 'noop',
    reply,
    noopMeta: buildNoopMeta(actionCode),
    meta: { intentCode, confidence: 1, source: 'noop', latencyMs },
  };
}

function noopReplyFor(actionCode: ActionCode, ctx: ReplyContext): string {
  switch (actionCode) {
    case 'PLAY_RADIO':
      return ctx.channelName
        ? 'Đài đang phát {channelName} rồi mà, bạn muốn đổi kênh khác không?'
        : 'Đài đang phát rồi mà, bạn muốn đổi kênh khác không?';
    case 'PAUSE_RADIO':
      return 'Đài đang tắt rồi đó, cần nghe lại bạn cứ bảo mình nhé.';
    case 'OPEN_RADIO_SCREEN':
      return 'Mình đang ở màn Radio rồi mà, bạn cần gì cứ nói nhé.';
    case 'OPEN_HOME_SCREEN':
      return 'Mình đang ở trang chủ rồi đó, bạn cần gì nữa cứ bảo.';
    case 'OPEN_UTILITIES_SCREEN':
      return 'Mình đang ở Tiện ích rồi mà, bạn cần dùng mục nào cứ nói nha.';
    case 'OPEN_COMMUNITY_SCREEN':
      return 'Mình đang ở Cộng đồng rồi đó, bạn cần gì cứ bảo nhé.';
    case 'OPEN_PROFILE_SCREEN':
      return 'Mình đang ở Tài khoản rồi nhé, bạn cần gì cứ nói.';
    case 'OPEN_NOTIFICATIONS_SCREEN':
      return 'Mình đang ở màn Thông báo rồi đó, bạn cần gì cứ bảo.';
    case 'OPEN_ROUTE_SCREEN':
      return 'Mình đang ở màn Lộ trình rồi mà, bạn cần chỉnh gì cứ nói nhé.';
    case 'OPEN_INSURANCE_SCREEN':
      return 'Mình đang ở màn Bảo hiểm rồi đó, bạn cần gì cứ bảo.';
    case 'OPEN_FINE_LOOKUP':
      return 'Mình đang ở màn Tra cứu phạt nguội rồi mà, bạn cần gì cứ nói.';
    case 'OPEN_DISPLAY_SETTINGS':
      return 'Mình đang ở Cài đặt hiển thị rồi đó, bạn cần chỉnh gì cứ bảo nhé.';
    case 'OPEN_PERMISSION_SETTINGS':
      return 'Mình đang ở Quản lý quyền rồi nhé, bạn cần cấp quyền gì cứ nói.';
    case 'ENABLE_VIOLATION_ALERTS':
      return 'Cảnh báo đang bật rồi, bạn có muốn mình hỗ trợ gì cứ nói nhé.';
    case 'DISABLE_VIOLATION_ALERTS':
      return 'Cảnh báo đang tắt rồi, bạn có muốn mình hỗ trợ gì cứ nói nhé.';
    case 'MUTE_MIC':
      return 'Mic đang tắt rồi mà, cần bật lại bạn cứ bảo mình.';
    case 'UNMUTE_MIC':
      return 'Mic đang bật rồi nhé, bạn cứ nói thoải mái.';
    case 'SHOW_HELP':
      return 'Mình vừa hướng dẫn rồi mà, bạn muốn nghe lại hay cần hỗ trợ gì khác không?';
    default:
      return 'Mình thấy bạn vừa làm rồi mà, không cần làm lại đâu nha.';
  }
}

// Map: actionCode → screen mà action đó là noop (đang ở đúng màn rồi)
const SCREEN_NOOP_MAP: Partial<Record<ActionCode, ScreenId>> = {
  'OPEN_HOME_SCREEN': 'home',
  'OPEN_RADIO_SCREEN': 'radio',
  'OPEN_UTILITIES_SCREEN': 'utilities',
  'OPEN_COMMUNITY_SCREEN': 'community',
  'OPEN_PROFILE_SCREEN': 'profile',
  'OPEN_NOTIFICATIONS_SCREEN': 'notifications',
  'OPEN_ROUTE_SCREEN': 'route',
  'OPEN_INSURANCE_SCREEN': 'insurance',
  'OPEN_FINE_LOOKUP': 'fineLookup',
  'OPEN_DISPLAY_SETTINGS': 'displaySettings',
  'OPEN_PERMISSION_SETTINGS': 'permissionSettings',
  'OPEN_VEHICLE_MANAGEMENT': 'profile',
};

function isScreenNoop(actionCode: ActionCode, screen: ScreenId): boolean {
  const noopScreen = SCREEN_NOOP_MAP[actionCode];
  return noopScreen !== undefined && noopScreen === screen;
}

function isRecentSameAction(action: ScreenAction, recent: RecentActionItem[]): boolean {
  if (recent.length === 0) return false;
  const last = recent[recent.length - 1]; // phần tử mới nhất
  return last.actionCode === action.actionCode && last.msAgo < NOOP_WINDOW_MS;
}

function getCommandByIntent(intentCode: IntentCode) {
  return commands.find((c) => c.intentCode === intentCode);
}

async function classifyViaLlm(
  text: string,
  screen: ScreenId,
  recentActions: RecentActionItem[],
  overrideChannels?: { id: string; name: string }[] | null,
): Promise<{ intentCode: IntentCode | null; confidence: number; latencyMs: number; reason: string }> {
  const baseCandidates = getLlmCandidates(screen, 'idle');

  // Inject dynamic RADIO_PLAY_BY_NAME phrases — ưu tiên danh sách Android gửi lên
  const channels = (overrideChannels && overrideChannels.length > 0)
    ? overrideChannels
    : getRadioChannels();
  const dynamicCandidates = channels.length > 0
    ? [
      ...baseCandidates.filter((c) => c.intentCode !== 'RADIO_PLAY_BY_NAME'),
      {
        intentCode: 'RADIO_PLAY_BY_NAME' as IntentCode,
        phrases: channels.flatMap((ch) => {
          const name = ch.name.toLowerCase();
          return [
            `mở kênh ${name}`,
            `bật kênh ${name}`,
            `nghe kênh ${name}`,
            `phát kênh ${name}`,
            `chuyển kênh ${name}`,
            `đổi kênh ${name}`,
            `mở ${name}`,
            `bật ${name}`,
            `nghe ${name}`,
            `cho tôi nghe ${name}`,
            `cho nghe ${name}`,
            `mở kênh ${name} cho tôi`,
            `bật kênh ${name} cho tôi`,
            `cho tôi kênh ${name}`,
            `bật cho tôi kênh ${name}`,
            `chuyển sang kênh ${name}`,
            `đổi sang kênh ${name}`,
            `vào kênh ${name}`,
          ];
        }).slice(0, 40), // Tăng từ 30 → 40 để cover nhiều biến thể hơn
      },
    ]
    : baseCandidates;

  if (dynamicCandidates.length === 0) {
    return { intentCode: null, confidence: 0, latencyMs: 0, reason: 'no-candidates' };
  }
  try {
    const result = await classifyIntent({
      transcript: text,
      screen,
      assistantState: 'idle',
      candidates: dynamicCandidates,
      recentActions,
    });
    return {
      intentCode: result.intentCode as IntentCode | null,
      confidence: result.confidence,
      latencyMs: result.latencyMs,
      reason: result.reason,
    };
  } catch (e: any) {
    console.error('[handfree] llm error:', e?.message || e);
    return { intentCode: null, confidence: 0, latencyMs: 0, reason: 'llm-error' };
  }
}

export function handfreeCommandHandler(): RequestHandler {
  return async (req: Request, res: Response, _next: NextFunction) => {
    const startedAt = Date.now();

    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip ||
      'unknown';

    if (!rateAllow(ip)) {
      res.status(429).json({ error: 'rate-limited' });
      return;
    }

    const parsed = parseBody(req.body);
    if (!parsed) {
      res.status(400).json({ error: 'invalid-body' });
      return;
    }

    const key = cacheKey(parsed);
    const cached = getCached(key);
    if (cached) {
      console.log(`[handfree] ✓ cache "${parsed.text}" screen=${parsed.screen} type=${cached.type}`);
      res.json(cached);
      return;
    }

    // ── Branch 1: pending confirm flow ────────────────────────────────────
    if (parsed.pending) {
      const pending = parsed.pending;

      // Silence signal: client gửi text rỗng + pending → đang im lặng khi confirming
      // BE trả lại confirm với retryPrompt để client hỏi lại
      if (!parsed.text) {
        const silenceRetryResponse: HandfreeResponse = {
          type: 'confirm',
          reply: DEFAULT_CONFIRM_META.retryPrompt,
          pending: parsed.pending,
          confirmMeta: DEFAULT_CONFIRM_META,
          meta: {
            intentCode: parsed.pending.intentCode,
            confidence: 1,
            source: 'confirm',
            latencyMs: Date.now() - startedAt,
          },
        };
        console.log(`[handfree] ✓ confirm-silence-retry ${pending.intentCode}`);
        res.json(silenceRetryResponse);
        return;
      }

      // Strict YES/NO validation: confidence ≥ 0.85 và input ≤ 4 từ
      // Tránh câu dài bị match nhầm vào CONFIRM_YES/NO
      // Giảm từ 0.9 → 0.85 để cover các từ tiếng Việt có dấu như "ừ", "đồng ý"
      const inputWordCount = parsed.text.trim().split(/\s+/).length;
      const matchResult = matchTranscript(parsed.text, parsed.screen, 'confirming');
      const isStrictYes =
        matchResult.type === 'matched' &&
        matchResult.candidate.command.intentCode === 'CONFIRM_YES' &&
        matchResult.candidate.confidence >= 0.85 &&
        inputWordCount <= 4;
      const isStrictNo =
        matchResult.type === 'matched' &&
        matchResult.candidate.command.intentCode === 'CONFIRM_NO' &&
        matchResult.candidate.confidence >= 0.85 &&
        inputWordCount <= 4;

      if (isStrictYes) {
        const action = resolveAction(pending.intentCode, parsed.screen, false);
        if (action) {
          const response = buildActionResponse(action, parsed, {
            intentCode: pending.intentCode,
            confidence: 1,
            source: 'confirm',
            latencyMs: Date.now() - startedAt,
          });
          setCached(key, response);
          console.log(`[handfree] ✓ confirm-yes ${pending.intentCode} (${response.meta.latencyMs}ms)`);
          res.json(response);
          return;
        }
      }
      if (isStrictNo) {
        const cancelAction = resolveAction('CONFIRM_NO', parsed.screen, true);
        const reply = cancelAction
          ? interpolate(pickFeedback(cancelAction.feedback, parsed.text), parsed.context)
          : 'Oke, mình bỏ qua cho bạn nhé.';
        const response: HandfreeResponse = {
          type: 'action',
          reply,
          action: { code: 'CANCEL_PENDING' },
          meta: {
            intentCode: 'CONFIRM_NO',
            confidence: 1,
            source: 'confirm',
            latencyMs: Date.now() - startedAt,
          },
        };
        setCached(key, response);
        console.log(`[handfree] ✓ confirm-no (${response.meta.latencyMs}ms)`);
        res.json(response);
        return;
      }
      // Pending nhưng user nói lệnh khác → nhắc lại yêu cầu xác nhận, không xử lý lệnh mới.
      const CONFIRM_ONLY_REPLIES = [
        'Bạn trả lời "đồng ý" hoặc "hủy" giúp mình trước nhé.',
        'Mình đang chờ bạn xác nhận, bạn nói "đồng ý" hoặc "hủy" nhé.',
        'Cho mình xin xác nhận trước: nói "đồng ý" hoặc "hủy" giúp mình nha.',
      ];
      const confirmOnlyReply = CONFIRM_ONLY_REPLIES[Math.floor(Math.random() * CONFIRM_ONLY_REPLIES.length)];
      const confirmOnlyResponse: HandfreeResponse = {
        type: 'confirm',
        reply: confirmOnlyReply,
        pending: parsed.pending,
        confirmMeta: DEFAULT_CONFIRM_META,
        meta: {
          intentCode: parsed.pending.intentCode,
          confidence: 1,
          source: 'confirm',
          latencyMs: Date.now() - startedAt,
        },
      };
      res.json(confirmOnlyResponse);
      return;
    }

    // ── Branch 2: normal flow ─────────────────────────────────────────────
    const match = matchTranscript(parsed.text, parsed.screen, 'idle');

    let intentCode: IntentCode | null = null;
    let confidence = 0;
    let source: 'matcher' | 'llm' = 'matcher';
    let llmLatency = 0;

    if (match.type === 'matched') {
      intentCode = match.candidate.command.intentCode;
      confidence = Math.min(1, match.candidate.confidence);
      source = 'matcher';
      console.log(`[handfree] matcher: "${parsed.text}" → ${intentCode} (conf=${confidence.toFixed(2)}, phrase="${match.candidate.phrase}")`);
    } else if (isLlmEnabled()) {
      const llm = await classifyViaLlm(parsed.text, parsed.screen, parsed.recentActions, parsed.channels);
      llmLatency = llm.latencyMs;
      if (llm.intentCode && llm.confidence >= 0.5) {
        intentCode = llm.intentCode;
        confidence = llm.confidence;
        source = 'llm';
        console.log(`[handfree] llm: "${parsed.text}" → ${intentCode} (conf=${confidence.toFixed(2)})`);
      }
    }

    if (!intentCode) {
      // Heuristic fallback: nếu có từ "kênh"/"chuyên mục"/"channel" → ưu tiên RADIO_PLAY_BY_NAME
      const normalizedText = normalizeVietnamese(parsed.text);
      if (normalizedText.includes('kenh') || normalizedText.includes('chuyen muc') || normalizedText.includes('channel')) {
        // Ưu tiên danh sách Android gửi lên, fallback JSON
        const channels = (parsed.channels && parsed.channels.length > 0)
          ? parsed.channels
          : getRadioChannels();

        // Tìm kênh khớp với tên — dùng normalize để tránh miss do dấu
        const foundChannel = channels.find(ch =>
          normalizedText.includes(normalizeVietnamese(ch.name))
        );

        if (foundChannel) {
          // Force match RADIO_PLAY_BY_NAME
          intentCode = 'RADIO_PLAY_BY_NAME';
          confidence = 0.80;
          source = 'matcher';
          console.log(`[handfree] ✓ heuristic match RADIO_PLAY_BY_NAME for channel="${foundChannel.name}"`);
        } else {
          // Có từ khóa kênh nhưng không match kênh nào → cũng xử lý như RADIO_PLAY_BY_NAME
          // để buildActionResponse trả reply "không tìm thấy kênh X" thay vì fallback chung
          intentCode = 'RADIO_PLAY_BY_NAME';
          confidence = 0.75;
          source = 'matcher';
          console.log(`[handfree] ✓ heuristic match RADIO_PLAY_BY_NAME (channel keyword, no match found)`);
        }
      }
    }

    if (!intentCode) {
      const response = buildFallbackResponse(parsed, Date.now() - startedAt);
      // KHÔNG cache fallback - cần phản hồi dynamic theo consecutiveFallbacks
      console.log(`[handfree] ✗ fallback "${parsed.text}" screen=${parsed.screen} (${response.meta.latencyMs}ms, llm=${llmLatency}ms, count=${(parsed.consecutiveFallbacks || 0) + 1})`);
      res.json(response);
      return;
    }

    const command = getCommandByIntent(intentCode);
    const action = resolveAction(intentCode, parsed.screen, false);

    if (!command || !action) {
      const response = buildFallbackResponse(parsed, Date.now() - startedAt);
      // KHÔNG cache fallback - cần phản hồi dynamic theo consecutiveFallbacks
      console.log(`[handfree] ✗ no-action ${intentCode} screen=${parsed.screen} (count=${(parsed.consecutiveFallbacks || 0) + 1})`);
      res.json(response);
      return;
    }

    // No-op nếu đang ở đúng màn hình rồi (screen-based noop)
    if (isScreenNoop(action.actionCode, parsed.screen)) {
      const response = buildNoopResponse(
        parsed,
        intentCode,
        action.actionCode,
        Date.now() - startedAt,
      );
      setCached(key, response);
      console.log(`[handfree] ✓ screen-noop ${intentCode} action=${action.actionCode} screen=${parsed.screen}`);
      res.json(response);
      return;
    }

    // No-op nếu vừa thực hiện cùng action gần đây.
    if (isRecentSameAction(action, parsed.recentActions)) {
      const response = buildNoopResponse(
        parsed,
        intentCode,
        action.actionCode,
        Date.now() - startedAt,
      );
      setCached(key, response);
      console.log(`[handfree] ✓ noop ${intentCode} action=${action.actionCode}`);
      res.json(response);
      return;
    }

    // No-op cảnh báo: dùng state thật từ Android nếu có (chính xác hơn recentActions)
    if (action.actionCode === 'ENABLE_VIOLATION_ALERTS') {
      const bothOn = parsed.speedAlertEnabled === true && parsed.hotspotAlertEnabled === true;
      if (bothOn) {
        const response = buildNoopResponse(parsed, intentCode, action.actionCode, Date.now() - startedAt);
        setCached(key, response);
        console.log(`[handfree] ✓ alert-noop ENABLE (both already on)`);
        res.json(response);
        return;
      }
    }

    if (action.actionCode === 'DISABLE_VIOLATION_ALERTS') {
      const bothOff = parsed.speedAlertEnabled === false && parsed.hotspotAlertEnabled === false;
      if (bothOff) {
        const response = buildNoopResponse(parsed, intentCode, action.actionCode, Date.now() - startedAt);
        setCached(key, response);
        console.log(`[handfree] ✓ alert-noop DISABLE (both already off)`);
        res.json(response);
        return;
      }
    }

    if (action.actionCode === 'ENABLE_SPEED_ALERT' && parsed.speedAlertEnabled === true) {
      const response = buildNoopResponse(parsed, intentCode, action.actionCode, Date.now() - startedAt);
      setCached(key, response);
      console.log(`[handfree] ✓ alert-noop ENABLE_SPEED (already on)`);
      res.json(response);
      return;
    }

    if (action.actionCode === 'DISABLE_SPEED_ALERT' && parsed.speedAlertEnabled === false) {
      const response = buildNoopResponse(parsed, intentCode, action.actionCode, Date.now() - startedAt);
      setCached(key, response);
      console.log(`[handfree] ✓ alert-noop DISABLE_SPEED (already off)`);
      res.json(response);
      return;
    }

    if (action.actionCode === 'ENABLE_HOTSPOT_ALERT' && parsed.hotspotAlertEnabled === true) {
      const response = buildNoopResponse(parsed, intentCode, action.actionCode, Date.now() - startedAt);
      setCached(key, response);
      console.log(`[handfree] ✓ alert-noop ENABLE_HOTSPOT (already on)`);
      res.json(response);
      return;
    }

    // Clarification nếu state invalid: bật radio khi đã bật (chỉ cho PLAY_RADIO chung chung,
    // KHÔNG áp dụng cho PLAY_RADIO_BY_NAME vì đó là yêu cầu đổi kênh cụ thể → thực thi bình thường)
    if (
      (action.actionCode === 'PLAY_RADIO' || action.actionCode === 'PLAY_ROAD_STORY' || action.actionCode === 'PLAY_FRIENDS_CONTENT') &&
      parsed.radioPlaying === true
    ) {
      const channels = (parsed.channels && parsed.channels.length > 0) ? parsed.channels : getRadioChannels();
      const channelNames = channels.map(c => c.name).join(', ');
      const clarificationPrompt = `Đài đang phát rồi mà, bạn muốn đổi kênh khác không? Hiện có ${channels.length} kênh: ${channelNames}.`;
      const response = buildClarificationResponse(
        action,
        parsed,
        clarificationPrompt,
        { intentCode, confidence, source, latencyMs: Date.now() - startedAt },
      );
      console.log(`[handfree] ✓ clarification ${intentCode} (radio already playing)`);
      res.json(response);
      return;
    }

    if (action.actionCode === 'PAUSE_RADIO' && parsed.radioPlaying === false) {
      const clarificationPrompt = 'Đài đang tắt sẵn rồi đó, bạn muốn mình mở lại không?';
      const response = buildClarificationResponse(
        action,
        parsed,
        clarificationPrompt,
        { intentCode, confidence, source, latencyMs: Date.now() - startedAt },
      );
      console.log(`[handfree] ✓ clarification ${intentCode} (radio already paused)`);
      res.json(response);
      return;
    }

    // Confirm nếu lệnh nguy hiểm.
    if (action.requiresConfirmation || command.dangerLevel === 'confirm') {
      const response = buildConfirmResponse(
        action,
        parsed,
        intentCode,
        confidence,
        source,
        Date.now() - startedAt,
      );
      setCached(key, response);
      console.log(`[handfree] ✓ confirm ${intentCode} (source=${source})`);
      res.json(response);
      return;
    }

    const response = buildActionResponse(action, parsed, {
      intentCode,
      confidence,
      source,
      latencyMs: Date.now() - startedAt,
    });
    setCached(key, response);
    console.log(
      `[handfree] ✓ action ${intentCode}→${action.actionCode} conf=${confidence.toFixed(2)} src=${source} (${response.meta.latencyMs}ms)`,
    );
    res.json(response);
  };
}
