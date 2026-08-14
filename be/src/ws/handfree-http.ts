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

// Kịch bản im lặng: app tự xử lý cục bộ khi mic mở mà không nghe thấy gì,
// KHÔNG cần gọi API thêm lần nữa. Câu thoại vẫn do server quyết định.
type SilenceMeta = {
  timeoutSeconds: number;   // im lặng quá bao lâu thì coi như user không nói gì
  message: string;          // câu bot đọc khi hết giờ
  closeAssistant: boolean;  // true = đọc xong thì đóng trợ lý
};

const SILENCE_MESSAGE =
  'Mình dừng lại đây, lúc nào cần bạn chạm nút trợ lý một cái là mình bật lại liền.';

const DEFAULT_SILENCE_META: SilenceMeta = {
  timeoutSeconds: 5,
  message: SILENCE_MESSAGE,
  closeAssistant: true,
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
  'ENABLE_HOTSPOT_ALERT',
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
  hotspotAlertEnabled?: boolean; // trạng thái cảnh báo điểm nóng từ app
  consecutiveFallbacks?: number;
  channels?: { id: string; name: string }[] | null;
};

type HandfreeResponse =
  | {
    type: 'action';
    reply: string;
    action: {
      code: ActionCode;
      nextScreen?: ScreenId;
      channelId?: string;
      channelName?: string;
      target?: 'hotspotAlertEnabled'; // toggle app cần ghi
      value?: boolean;                // giá trị cần ghi vào toggle đó
    };
    meta: ResponseMeta;
    state?: ResponseState;
    silenceMeta?: SilenceMeta;
  }
  | {
    type: 'confirm';
    reply: string;
    pending: Pending;
    confirmMeta: ConfirmMeta;
    meta: ResponseMeta;
    state?: ResponseState;
    silenceMeta?: SilenceMeta;
  }
  | {
    type: 'clarification';
    reply: string;
    action: { code: ActionCode; nextScreen?: ScreenId };
    openMicAfterReply: boolean; // Tự động mở mic sau khi hỏi
    meta: ResponseMeta;
    state?: ResponseState;
    silenceMeta?: SilenceMeta;
  }
  | {
    type: 'noop';
    reply: string;
    noopMeta: NoopMeta;
    meta: ResponseMeta;
    state?: ResponseState;
    silenceMeta?: SilenceMeta;
  }
  | {
    type: 'fallback';
    reply: string;
    suggestions: string[];
    shouldCloseAssistant?: boolean; // Đóng trợ lý sau khi nói reply
    openMicAfterReply?: boolean; // Mở mic tự động sau khi bot nói xong
    consecutiveFallbacks: number; // Trả về để client track
    meta: ResponseMeta;
    state?: ResponseState;
    silenceMeta?: SilenceMeta;
  };

type ResponseMeta = {
  intentCode: IntentCode | null;
  confidence: number;
  source: 'matcher' | 'llm' | 'confirm' | 'noop' | 'fallback';
  latencyMs: number;
};

// Trạng thái toggle cảnh báo điểm nóng app NÊN có SAU khi xử lý response này.
// Tên field trùng với tên request nhận vào để hai chiều đọc giống nhau.
type ResponseState = {
  hotspotAlertEnabled: boolean;
};

// Action nào ghi vào toggle cảnh báo điểm nóng, và ghi giá trị gì.
// Dùng chung cho: phát hiện no-op, sinh action.target/value, và field state.
const HOTSPOT_ACTION_VALUE: Partial<Record<ActionCode, boolean>> = {
  ENABLE_VIOLATION_ALERTS: true,
  ENABLE_HOTSPOT_ALERT: true,
  DISABLE_VIOLATION_ALERTS: false,
};

// Gắn `silenceMeta` để app tự xử lý im lặng tại chỗ, không phải gọi API thêm lần nữa.
// Riêng `confirm` đã có `confirmMeta` (retryPrompt/cancelMessage/maxSilenceRetries) điều khiển
// kịch bản im lặng riêng, gắn thêm sẽ mâu thuẫn nên bỏ qua.
function withSilenceMeta(response: HandfreeResponse): HandfreeResponse {
  if (response.type === 'confirm') return response;
  return { ...response, silenceMeta: DEFAULT_SILENCE_META };
}

// Gắn `state` vào mọi response để Android chỉ việc set toggle theo, không phải map tên action.
function withState(response: HandfreeResponse, p: ParsedBody): HandfreeResponse {
  const applied = response.type === 'action' ? HOTSPOT_ACTION_VALUE[response.action.code] : undefined;
  const hotspotAlertEnabled = applied ?? p.hotspotAlertEnabled;
  if (typeof hotspotAlertEnabled !== 'boolean') return response;
  return { ...response, state: { hotspotAlertEnabled } };
}

const VALID_SCREENS: readonly ScreenId[] = [
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
];

// Bỏ dấu gạch/underscore + hạ chữ thường để "radio_on_air", "RadioOnAir", "radioonair" đều khớp nhau.
function screenKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Tên màn hình client gửi lên không phải lúc nào cũng trùng tuyệt đối với ScreenId
// (số ít/số nhiều, snake_case, tên nội bộ của app). Chuẩn hoá thay vì trả 400 làm bot chết câm.
const SCREEN_ALIASES: Record<string, ScreenId> = {
  ...Object.fromEntries(VALID_SCREENS.map((screen) => [screenKey(screen), screen])),
  main: 'home',
  trangchu: 'home',
  utility: 'utilities',
  util: 'utilities',
  tienich: 'utilities',
  notification: 'notifications',
  thongbao: 'notifications',
  account: 'profile',
  taikhoan: 'profile',
  setting: 'displaySettings',
  settings: 'displaySettings',
  displaysetting: 'displaySettings',
  notificationsettings: 'displaySettings',
  permission: 'permissionSettings',
  permissionsetting: 'permissionSettings',
  onair: 'radioOnAir',
  radioroom: 'radioOnAir',
  finelookup: 'fineLookup',
  fineresult: 'fineResult',
  fine: 'fineLookup',
};

function normalizeScreen(raw: string): ScreenId | null {
  return SCREEN_ALIASES[screenKey(raw)] ?? null;
}

const FALLBACK_REPLIES_FIRST = [
  'Mình chưa nghe rõ lệnh này, bạn nói lại giúp mình nhé.',
  'Hửm, mình chưa rõ ý bạn, bạn nói gọn lại giúp mình nha.',
  'Mình chưa hiểu lệnh đó, bạn thử nói lại cho mình nhé.',
];

const FALLBACK_REPLIES_SECOND = [
  'Xin lỗi, mình vẫn không nghe rõ. Tạm thời mình sẽ dừng lại ở đây. Lúc nào cần bạn chạm nút trợ lý để mình trở lại nhé.',
];

const cache = new Map<string, { res: HandfreeResponse; expiresAt: number }>();
const rateMap = new Map<string, number[]>();

// Hash ngắn để nhét context/danh sách kênh vào cache key mà key không phình to.
function shortHash(value: string): string {
  let h = 0;
  for (let i = 0; i < value.length; i++) {
    h = ((h << 5) - h + value.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

function cacheKey(p: ParsedBody): string {
  const pendingKey = p.pending ? `:p=${p.pending.intentCode}` : '';
  const stateKey = p.assistantState !== 'idle' ? `:s=${p.assistantState}` : '';
  const channelKey = p.currentChannelId ? `:ch=${p.currentChannelId}` : '';
  // State-aware cache key để tránh trả response sai ngữ cảnh
  // (ví dụ: cùng câu "tắt cảnh báo" nhưng trạng thái alert ON/OFF khác nhau).
  const hotspotKey = typeof p.hotspotAlertEnabled === 'boolean' ? `:hot=${p.hotspotAlertEnabled ? 1 : 0}` : '';
  const radioKey = typeof p.radioPlaying === 'boolean' ? `:radio=${p.radioPlaying ? 1 : 0}` : '';
  // Reply có nội suy {plate}, {channelName}, {notificationCount}... nên context PHẢI nằm trong key,
  // nếu không user B sẽ nghe lại câu chứa biển số của user A trong 5 phút TTL.
  const contextEntries = Object.entries(p.context)
    .filter(([, value]) => value !== undefined && value !== null)
    .sort(([a], [b]) => a.localeCompare(b));
  const contextKey = contextEntries.length > 0 ? `:ctx=${shortHash(JSON.stringify(contextEntries))}` : '';
  // Danh sách kênh do app gửi lên quyết định kết quả tìm kênh theo tên / next / prev.
  const channelsKey = p.channels && p.channels.length > 0
    ? `:chs=${shortHash(p.channels.map((c) => c.id).join(','))}`
    : '';
  return `${p.text.trim().toLowerCase()}|${p.screen}${pendingKey}${stateKey}${channelKey}${hotspotKey}${radioKey}${contextKey}${channelsKey}`;
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

// Đọc boolean từ nhiều nguồn/alias khác nhau (Android, web, doc cũ).
// Chấp nhận cả string "true"/"false" cho chắc.
function readBool(...values: unknown[]): boolean | undefined {
  for (const value of values) {
    if (typeof value === 'boolean') return value;
    if (value === 'true') return true;
    if (value === 'false') return false;
  }
  return undefined;
}

function parseBody(raw: any): ParsedBody | null {
  if (!raw || typeof raw !== 'object') return null;
  const text = typeof raw.text === 'string' ? raw.text.trim() : '';
  const rawScreen = typeof raw.screen === 'string' ? raw.screen.trim() : '';

  const hasPending = raw.pending && typeof raw.pending === 'object';

  // ✅ CHO PHÉP text rỗng (im lặng) - sẽ xử lý ở handler
  // Thiếu hẳn screen mới reject; sai chính tả/khác quy ước thì chuẩn hoá rồi vẫn phục vụ,
  // vì trả 400 đồng nghĩa bot im lặng hoàn toàn trên màn đó.
  if (!rawScreen) return null;
  const screen = normalizeScreen(rawScreen);
  if (!screen) {
    console.warn(`[handfree] ⚠️ screen lạ "${rawScreen}" → tạm dùng "home". Client nên gửi đúng ScreenId.`);
  }

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

  // Trạng thái runtime có thể nằm ở top-level (web) hoặc trong context (Android).
  const rawContext: Record<string, unknown> =
    raw.context && typeof raw.context === 'object' ? (raw.context as Record<string, unknown>) : {};

  const currentChannelId =
    typeof raw.currentChannelId === 'string'
      ? raw.currentChannelId
      : (typeof rawContext.currentChannelId === 'string' ? (rawContext.currentChannelId as string) : null);
  const radioPlaying = readBool(raw.radioPlaying, rawContext.radioPlaying);
  // Cảnh báo điểm nóng: chấp nhận mọi alias top-level lẫn trong context
  // (Android đang gửi context.hotspotAlert — trước đây BE bỏ qua nên không phát hiện được no-op).
  const hotspotAlertEnabled = readBool(
    raw.hotspotAlertEnabled,
    raw.hotspotAlert,
    raw.violationAlertEnabled,
    raw.alertEnabled,
    rawContext.hotspotAlertEnabled,
    rawContext.hotspotAlert,
    rawContext.violationAlertEnabled,
    rawContext.alertEnabled,
  );
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
    screen: screen ?? 'home',
    pending,
    context,
    recentActions,
    assistantState: typeof raw.assistantState === 'string' ? raw.assistantState : 'idle',
    currentChannelId,
    radioPlaying,
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
  const hotspotValue = HOTSPOT_ACTION_VALUE[action.actionCode];
  return {
    type: 'action',
    reply,
    action: {
      code: action.actionCode,
      ...(action.nextScreen ? { nextScreen: action.nextScreen } : {}),
      // Nói thẳng toggle nào cần ghi để client không phải map action code sang tên field.
      ...(typeof hotspotValue === 'boolean'
        ? { target: 'hotspotAlertEnabled' as const, value: hotspotValue }
        : {}),
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
  const reply = interpolate(pickFeedback(noopReplyFor(actionCode, p.context), p.text), p.context);
  return {
    type: 'noop',
    reply,
    noopMeta: buildNoopMeta(actionCode),
    meta: { intentCode, confidence: 1, source: 'noop', latencyMs },
  };
}

function noopReplyFor(actionCode: ActionCode, ctx: ReplyContext): string | string[] {
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
    case 'ENABLE_HOTSPOT_ALERT':
    case 'ENABLE_VIOLATION_ALERTS':
      return [
        'Cảnh báo điểm nóng đã bật rồi mà, bạn cần gì nữa cứ nói nhé.',
        'Cảnh báo điểm nóng đang bật sẵn rồi đó, bạn cứ yên tâm lái, cần gì cứ bảo mình.',
      ];
    case 'DISABLE_VIOLATION_ALERTS':
      return [
        'Cảnh báo điểm nóng đã tắt rồi mà, bạn cần gì nữa cứ nói nhé.',
        'Cảnh báo điểm nóng đang tắt sẵn rồi đó, bạn cần bật lại thì bảo mình nha.',
      ];
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

// Lệnh bật/tắt cảnh báo là idempotent: nếu app đã ở đúng trạng thái rồi thì
// KHÔNG hỏi xác nhận, chỉ báo lại trạng thái hiện tại rồi mở mic chờ lệnh mới.
// Trả về undefined-safe: chỉ coi là no-op khi client thực sự gửi trạng thái lên.
function isAlertStateNoop(actionCode: ActionCode, hotspotAlertEnabled: boolean | undefined): boolean {
  if (typeof hotspotAlertEnabled !== 'boolean') return false;
  const wanted = HOTSPOT_ACTION_VALUE[actionCode];
  return typeof wanted === 'boolean' && wanted === hotspotAlertEnabled;
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

    // Mọi response đều đi qua đây để được gắn `state` (trạng thái toggle app nên có sau response)
    // và `silenceMeta` (kịch bản im lặng app tự chạy khi mic mở mà không nghe thấy gì).
    const send = (payload: HandfreeResponse): void => {
      res.json(withSilenceMeta(withState(payload, parsed)));
    };

    // ✅ DEBUG LOG: Track Android vs Web requests
    const userAgent = req.headers['user-agent'] || 'unknown';
    const isAndroid = userAgent.toLowerCase().includes('android');
    console.log(`[handfree] 📥 ${isAndroid ? 'ANDROID' : 'WEB'} request from IP=${ip}`);
    console.log(`  text="${parsed.text}" screen="${parsed.screen}" state="${parsed.assistantState}"`);
    console.log(`  pending=${parsed.pending ? JSON.stringify(parsed.pending) : 'null'}`);
    // Log trạng thái runtime để chẩn đoán no-op (client có gửi state lên hay không).
    const rawBody = (req.body || {}) as Record<string, unknown>;
    const rawCtx = (rawBody.context && typeof rawBody.context === 'object'
      ? rawBody.context
      : {}) as Record<string, unknown>;
    console.log(
      `  state: hotspotAlertEnabled=${parsed.hotspotAlertEnabled ?? 'MISSING'}` +
      ` radioPlaying=${parsed.radioPlaying ?? 'MISSING'}` +
      ` | bodyKeys=[${Object.keys(rawBody).join(',')}]` +
      ` contextKeys=[${Object.keys(rawCtx).join(',')}]`,
    );

    const key = cacheKey(parsed);
    const cached = getCached(key);
    if (cached) {
      console.log(`[handfree] ✓ cache "${parsed.text}" screen=${parsed.screen} type=${cached.type}`);
      send(cached);
      return;
    }

    // ── Silence handling (idle state) ─────────────────────────────────────
    // Khi user im lặng (không nói gì) → Đóng assistant với message thân thiện
    // Bao gồm: text rỗng HOẶC text quá ngắn (nhiễu âm thanh từ ASR)
    const normalizedText = parsed.text.length > 0 ? normalizeVietnamese(parsed.text) : '';
    const isLikelySilence = !parsed.text || normalizedText.length <= 2;

    if (isLikelySilence && !parsed.pending) {
      const silenceResponse: HandfreeResponse = {
        type: 'fallback',
        reply: SILENCE_MESSAGE,
        suggestions: [],
        shouldCloseAssistant: true,
        openMicAfterReply: false,
        consecutiveFallbacks: 0, // Reset vì đây là silence, không phải fallback thật
        meta: {
          intentCode: null,
          confidence: 0,
          source: 'fallback',
          latencyMs: Date.now() - startedAt,
        },
      };
      console.log(`[handfree] ✓ silence-idle (text="${parsed.text}", normalized="${normalizedText}") → closing assistant`);
      send(silenceResponse);
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
        send(silenceRetryResponse);
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
          // Pending cũ (client giữ lại từ turn trước) nhưng trạng thái đã đúng rồi
          // → không thực thi lại, chỉ báo trạng thái hiện tại.
          if (isAlertStateNoop(action.actionCode, parsed.hotspotAlertEnabled)) {
            const noopResponse = buildNoopResponse(
              parsed,
              pending.intentCode,
              action.actionCode,
              Date.now() - startedAt,
            );
            console.log(
              `[handfree] ✓ confirm-yes-alert-noop ${pending.intentCode} (hotspotAlertEnabled=${parsed.hotspotAlertEnabled})`,
            );
            send(noopResponse);
            return;
          }
          const response = buildActionResponse(action, parsed, {
            intentCode: pending.intentCode,
            confidence: 1,
            source: 'confirm',
            latencyMs: Date.now() - startedAt,
          });
          setCached(key, response);
          console.log(`[handfree] ✓ confirm-yes ${pending.intentCode} (${response.meta.latencyMs}ms)`);
          send(response);
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
        send(response);
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
      send(confirmOnlyResponse);
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
      send(response);
      return;
    }

    const command = getCommandByIntent(intentCode);
    const action = resolveAction(intentCode, parsed.screen, false);

    if (!command || !action) {
      const response = buildFallbackResponse(parsed, Date.now() - startedAt);
      // KHÔNG cache fallback - cần phản hồi dynamic theo consecutiveFallbacks
      console.log(`[handfree] ✗ no-action ${intentCode} screen=${parsed.screen} (count=${(parsed.consecutiveFallbacks || 0) + 1})`);
      send(response);
      return;
    }

    // No-op nếu đang ở đúng màn hình rồi (screen-based noop)
    if (isScreenNoop(action.actionCode, parsed.screen)) {
      console.log(`[handfree] ⚠️ SCREEN-NOOP DETECTED!`);
      console.log(`  action="${action.actionCode}" expects screen="${SCREEN_NOOP_MAP[action.actionCode]}" but already on "${parsed.screen}"`);
      const response = buildNoopResponse(
        parsed,
        intentCode,
        action.actionCode,
        Date.now() - startedAt,
      );
      setCached(key, response);
      console.log(`[handfree] ✓ screen-noop ${intentCode} action=${action.actionCode} screen=${parsed.screen}`);
      send(response);
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
      send(response);
      return;
    }

    // No-op cảnh báo: chỉ check hotspotAlert (cảnh báo điểm nóng), không quan tâm speedAlert.
    // Phải chặn TRƯỚC nhánh confirm bên dưới — nếu trạng thái đã đúng thì không hỏi xác nhận.
    if (isAlertStateNoop(action.actionCode, parsed.hotspotAlertEnabled)) {
      const response = buildNoopResponse(parsed, intentCode, action.actionCode, Date.now() - startedAt);
      setCached(key, response);
      console.log(
        `[handfree] ✓ alert-noop ${action.actionCode} (hotspotAlertEnabled=${parsed.hotspotAlertEnabled})`,
      );
      send(response);
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
      send(response);
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
      send(response);
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
      send(response);
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
    send(response);
  };
}
