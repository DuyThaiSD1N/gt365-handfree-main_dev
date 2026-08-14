import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Bell,
  Bot,
  Car,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  CircleGauge,
  Clock3,
  Compass,
  Fuel,
  Headphones,
  Home,
  Lock,
  MapPin,
  Menu,
  Mic,
  MicOff,
  Pause,
  Play,
  Radio,
  Search,
  Settings,
  Shield,
  Siren,
  SkipForward,
  Speaker,
  SquarePen,
  UserRound,
  UsersRound,
  WalletCards,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { AsrClient } from './voice/asrClient';
import {
  getCanonicalPhrase,
  getCommandHints,
  getFallbackSuggestions,
  getLlmCandidates,
} from './voice/commands';
import {
  classifyIntentRemote,
  getIntentActionKind,
} from './voice/llmFallback';
import { feLog, installGlobalErrorHook } from './voice/feLog';
import { matchTranscript } from './voice/matcher';
import { normalizeVietnamese } from './voice/normalizer';
import { resolveAction } from './voice/screenActions';
import { unlockAudio } from './voice/audioUtils';
import { speakText, stopTTS } from './voice/ttsClient';
import type {
  ActionCode,
  AssistantState,
  FeedbackContext,
  IntentCode,
  PendingConfirmation,
  ScreenAction,
  ScreenId,
  TranscriptEntry,
} from './voice/types';

const tabItems: Array<{ id: ScreenId; label: string; icon: LucideIcon }> = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'radio', label: 'Radio', icon: Radio },
  { id: 'utilities', label: 'Tiện ích', icon: WalletCards },
  { id: 'profile', label: 'Tài khoản', icon: UserRound },
];

const screenNames: Record<ScreenId, string> = {
  home: 'Trang chủ',
  radio: 'Nội dung số',
  radioOnAir: 'Trò chuyện',
  utilities: 'Tiện ích',
  community: 'Cộng đồng',
  profile: 'Profile',
  notifications: 'Thông báo',
  route: 'Lộ trình',
  fineLookup: 'Tra cứu phạt nguội',
  fineResult: 'Thông tin lỗi vi phạm',
  insurance: 'Bảo hiểm xe',
  displaySettings: 'Thông báo & Hiển thị',
  permissionSettings: 'Quản lý quyền truy cập',
};

const commandSamples = [
  'Mở radio',
  'Phát radio',
  'Tra cứu phạt nguội',
  'Kiểm tra ngay',
  'Báo kẹt xe',
  'Mở tiện ích',
  'Mở tài khoản',
  'Quay lại',
];

const radioChannelDefaults = [
  { id: 'vov-gt', name: 'VOV Giao thông' },
  { id: 'road-story', name: 'Chuyện dọc đường' },
  { id: 'friends', name: 'Kết bạn bốn phương' },
  { id: 'late-night', name: 'Chuyện đêm muộn' },
];

function formatAvailableChannels(channels: { name: string }[]): string {
  if (channels.length === 0) return 'chưa có kênh nào';
  const names = channels.map((c) => c.name);
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} và ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} và ${names[names.length - 1]}`;
}

const radioStopwords = new Set([
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
]);

const radioTopicNoiseWords = new Set([
  'nhac',
  'noi',
  'dung',
]);

function toRadioTopicTokens(text: string): string[] {
  return normalizeVietnamese(text)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length > 0 && !radioStopwords.has(token));
}

function extractRequestedRadioTopic(text: string): string {
  const tokens = text
    .split(/\s+/)
    .map((token) => token.replace(/^[^0-9A-Za-zÀ-ỹ]+|[^0-9A-Za-zÀ-ỹ]+$/g, ''))
    .filter((token) => token.length > 0)
    .filter((token) => {
      const normalized = normalizeVietnamese(token);
      return (
        normalized.length > 0
        && !radioStopwords.has(normalized)
        && !radioTopicNoiseWords.has(normalized)
      );
    });

  if (tokens.length === 0) {
    return 'bạn vừa yêu cầu';
  }

  return tokens.join(' ');
}

function buildMissingRadioTopicReply(text: string): string {
  const topicName = extractRequestedRadioTopic(text);
  return `Không tìm thấy chuyên mục ${topicName}. Bạn có thể nói "Chuyển mục tiếp theo" hoặc "Liệt kê chuyên mục cho tôi" để mình hỗ trợ tiếp nha.`;
}

function scoreRadioChannelMatch(inputText: string, channelName: string): number {
  const normalizedInput = normalizeVietnamese(inputText);
  const normalizedChannel = normalizeVietnamese(channelName);

  if (normalizedInput.includes(normalizedChannel)) {
    return 1;
  }

  const inputTokens = toRadioTopicTokens(normalizedInput);
  const channelTokens = toRadioTopicTokens(normalizedChannel);
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
      token.length >= 4 &&
      channelTokens.some((chToken) => chToken.includes(token) || token.includes(chToken))
    ) {
      overlap += 0.5;
    }
  }

  if (overlap <= 0) {
    return 0;
  }

  const coverage = overlap / channelTokens.length;
  const precision = overlap / inputTokens.length;
  return coverage * 0.7 + precision * 0.3;
}

const ackPrefixes = ['Ừ. ', 'Oke. ', 'Được. ', 'À. '];
const ackSkipPattern = /^(oke|vâng|ừ|ờ|à|được|đã|tôi|mình|dạ|có|alo|mở|tắt|bật|phát|xe|đài|cảnh|vị|mic|báo|trang|tiện|cộng|tài|thông|lộ|gói|hướng|chuyện|kết|bạn|chi|danh|trạm|đăng|định|quản|ghi|gửi|hủy|hửm|ui)/i;

const SESSION_STORAGE_KEY = 'gt365_session_v2';

type PersistedSession = {
  schemaVersion: 3;
  currentChannelId: string | null;
  radioTopicIndex: number;
  toggles: {
    deviceNotification: boolean;
    speedAlert: boolean;
    hotspotAlert: boolean;
    location: boolean;
    camera: boolean;
    microphone: boolean;
    gallery: boolean;
  };
  routeLabel: string;
  vehiclePlate: string;
  recentActionCodes: string[];
  sessionStart: number;
};

function loadSession(): Partial<PersistedSession> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as PersistedSession;
    if (data.schemaVersion !== 3) return null;
    return data;
  } catch {
    return null;
  }
}

const followUpHints = [
  ' Bạn cần gì thêm cứ bảo mình nhé.',
  ' Còn gì nữa không bạn?',
  ' Bạn muốn làm gì tiếp mình giúp cho.',
];

// R18: Cấm append follow-up nếu base đã có handoff hoặc câu hỏi
const followUpSkipPattern = /(bạn cứ|bạn muốn|bạn báo|bạn nói|bạn bảo|bạn đọc|cứ bảo|cứ nói|cứ đọc|mình đọc|mình kể|mình tóm tắt|mình giới thiệu)/i;

const wakeGreetings = [
  'Mình nghe đây, bạn cần gì ạ?',
  'Mình nghe đây ạ.',
  'Mình nghe đây, bạn nói đi nhé.',
  'Có mình đây nè, bạn cần gì?',
  'Ờ, mình đang nghe, bạn cứ nói.',
  'Mình sẵn sàng rồi đó, bạn nói đi.',
  'Alo, mình đây, bạn cần gì nào?',
];

const alreadyAwakeReplies = [
  'Mình vẫn đang nghe bạn nói đây mà.',
  'Mình ở đây từ nãy rồi nè, bạn nói tiếp đi.',
  'Mình đang nghe đây, bạn cứ bảo.',
];

const noPendingReplies = [
  'Mình không thấy lệnh nào đang chờ xác nhận đâu bạn.',
  'Mình không có lệnh nào đang treo cả, bạn cần gì cứ nói nhé.',
];

const confirmingOnlyReplies = [
  'Bạn trả lời "đồng ý" hoặc "hủy" giúp mình trước nhé.',
  'Mình đang chờ bạn xác nhận, bạn nói "đồng ý" hoặc "hủy" nhé.',
  'Cho mình xin xác nhận trước: nói "đồng ý" hoặc "hủy" giúp mình nha.',
];

const asrNoTranscriptReplies = [
  'Mình chưa nghe rõ, bạn nói lại ngắn gọn giúp mình nhé.',
  'Hửm, mình chưa bắt được lệnh, bạn thử nói lại nha.',
  'Mình hơi lùng bùng, bạn lặp lại giúp mình một lần nữa nhé.',
];

const asrSilenceReplies = [
  'Mình nghỉ đây nha, lúc nào cần bạn chạm nút trợ lý một cái là mình bật lại liền.',
  'Mình chưa nghe thấy gì, bạn cứ chạm vào nút trợ lý là mình nghe lại liền nha.',
  'Hình như bạn chưa nói gì, bạn chạm nút trợ lý rồi nói lệnh là mình bắt ngay nhé.',
  'Mình chờ mãi không nghe thấy gì, bạn bấm nút trợ lý rồi nói là mình sẵn sàng liền.',
];

const fallbackNoMatchReplies = [
  'Hửm, mình chưa rõ lệnh này, bạn nói lại ngắn hơn giúp mình nhé.',
  'Mình chưa bắt được, bạn nói lại một câu ngắn giúp mình nha.',
  'Mình chưa hiểu, bạn thử nói cách khác xem sao?',
];

const fallbackAmbiguousReplies = [
  'Mình chưa chắc, bạn nói lại ngắn hơn giúp mình nhé.',
  'Lệnh hơi mập mờ, bạn nói lại chính xác hơn được không?',
];

const fallbackGiveUpReplies = [
  'Mình chưa hiểu được, tạm dừng ở đây nhé, bạn có thể nói lại sau.',
  'Mình xin chịu lệnh này, bạn thử lại lần sau giúp mình nha.',
];

const ambiguousChoiceReplies = [
  (a: string, b: string) => `Bạn muốn "${a}" hay "${b}" hả?`,
  (a: string, b: string) => `Mình chưa rõ, bạn chọn giúp: "${a}" hay "${b}"?`,
  (a: string, b: string) => `Có hai khả năng: "${a}" hoặc "${b}", bạn chọn cái nào nhé?`,
];

function maybeAppendFollowUp(text: string, probability = 0.15): string {
  if (!text) return text;
  // R18: Skip nếu base đã ending bằng ? (câu hỏi sẵn) — append sẽ tạo double-close
  if (/\?\s*$/.test(text)) return text;
  // R18: Skip nếu base đã có handoff / offer voice action sẵn
  if (followUpSkipPattern.test(text)) return text;
  if (Math.random() >= probability) return text;
  const hint = followUpHints[Math.floor(Math.random() * followUpHints.length)];
  // KHÔNG replace ? → . nữa (R18); chỉ append nếu kết bằng . hoặc !
  if (/[.!]\s*$/.test(text)) return text + hint;
  return text + '.' + hint;
}

type ActionToastTone = 'ok' | 'warn' | 'info';
type ActionToast = {
  id: number;
  icon: LucideIcon;
  text: string;
  tone: ActionToastTone;
};

const now = () => Date.now() + Math.floor(Math.random() * 1000);
type CommandSource = 'text' | 'asr' | 'chip' | 'llm-rescue';

function interpolate(template: string, ctx?: FeedbackContext): string {
  if (!ctx) return template;
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    const value = (ctx as Record<string, unknown>)[key];
    return value === undefined || value === null ? match : String(value);
  });
}

function pickFeedback(feedback: string | string[] | undefined, ctx?: FeedbackContext): string {
  if (feedback === undefined) return '';
  if (typeof feedback === 'string') return interpolate(feedback, ctx);
  if (feedback.length === 0) return '';
  const raw = feedback[Math.floor(Math.random() * feedback.length)];
  return interpolate(raw, ctx);
}

function maybePrependAck(text: string, probability = 0.25): string {
  if (!text) return text;
  if (ackSkipPattern.test(text)) return text;
  if (Math.random() >= probability) return text;
  const prefix = ackPrefixes[Math.floor(Math.random() * ackPrefixes.length)];
  return prefix + text;
}

function pickFromPool(pool: string[]): string {
  return pool[Math.floor(Math.random() * pool.length)];
}

function App() {
  const [screen, setScreen] = useState<ScreenId>('home');
  const screenRef = useRef<ScreenId>('home');
  const [history, setHistory] = useState<ScreenId[]>([]);
  const [assistantState, setAssistantStateRaw] = useState<AssistantState>('idle');
  const setAssistantState = (next: AssistantState) => {
    const stack = new Error().stack?.split('\n').slice(2, 5).join(' | ').slice(0, 400);
    feLog('setAssistantState', { next, stack });
    setAssistantStateRaw(next);
  };
  const [pendingConfirmation, setPendingConfirmationState] = useState<PendingConfirmation | null>(null);
  const pendingConfirmationRef = useRef<PendingConfirmation | null>(null);
  function setPendingConfirmation(val: PendingConfirmation | null) {
    pendingConfirmationRef.current = val;
    if (val === null) confirmSilenceCountRef.current = 0;
    setPendingConfirmationState(val);
  }
  const [fallbackCount, setFallbackCount] = useState(0);
  const [inputValue, setInputValue] = useState('');
  const [asrListening, setAsrListening] = useState(false);
  const asrListeningRef = useRef(false);
  const [asrInterim, setAsrInterim] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);
  const [voiceError, setVoiceError] = useState('');
  const [speaking, setSpeaking] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem('gt365_tts_enabled') !== '0';
  });
  const persistedSession = useMemo(() => loadSession(), []);
  const [routeLabel, setRouteLabel] = useState(
    persistedSession?.routeLabel ?? 'Hà Nội → Lạng Sơn',
  );
  const [radioPlaying, setRadioPlaying] = useState(false);
  const [radioChannels, setRadioChannels] = useState(radioChannelDefaults);
  const [radioTopicIndex, setRadioTopicIndex] = useState(persistedSession?.radioTopicIndex ?? 0);
  const [currentChannelId, setCurrentChannelId] = useState<string | null>(
    persistedSession?.currentChannelId ?? null,
  );
  // Derive index từ id — luôn chính xác dù mảng radioChannels thay đổi thứ tự
  const radioChannelIndex = useMemo(() => {
    if (!currentChannelId) return 0;
    const idx = radioChannels.findIndex((c) => c.id === currentChannelId);
    return idx >= 0 ? idx : 0;
  }, [radioChannels, currentChannelId]);
  const [recentActionCodes, setRecentActionCodes] = useState<ActionCode[]>(
    (persistedSession?.recentActionCodes ?? []) as ActionCode[],
  );
  const recentActionsRef = useRef<{ actionCode: ActionCode; ts: number }[]>([]);
  const sessionStartRef = useRef<number>(persistedSession?.sessionStart ?? Date.now());
  const [toasts, setToasts] = useState<ActionToast[]>([]);
  const [transitionDirection, setTransitionDirection] = useState<'forward' | 'backward'>('forward');
  const [transitionKey, setTransitionKey] = useState(0);
  const [pulseTab, setPulseTab] = useState<ScreenId | null>(null);
  const [fineLookupDone, setFineLookupDone] = useState(false);
  const [reportStatus, setReportStatus] = useState('Chưa có phản ánh mới');
  const [focusedCard, setFocusedCard] = useState<string | null>(null);
  const [communityStatus, setCommunityStatus] = useState('38 đang Online');
  const [vehiclePlate, setVehiclePlate] = useState(persistedSession?.vehiclePlate ?? '30H12345');
  const [toggles, setToggles] = useState(
    persistedSession?.toggles ?? {
      deviceNotification: true,
      speedAlert: true,
      hotspotAlert: true,
      location: true,
      camera: false,
      microphone: false,
      gallery: false,
    },
  );
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([
    {
      id: now(),
      speaker: 'system',
      text: 'Chào bạn! Chạm vào nút trợ lý để bắt đầu nhé.',
    },
  ]);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const asrClientRef = useRef<AsrClient | null>(null);
  const handleCommandRef = useRef<(command: string, source?: CommandSource) => void>(() => undefined);
  const runResolvedActionRef = useRef<(
    action: ScreenAction,
    createdFrom: string,
    confirmed?: boolean,
    source?: CommandSource,
  ) => void>(() => undefined);
  const pickConfirmPromptRef = useRef<(action: ScreenAction, screen: ScreenId) => string>(() => '');
  const noopFollowUpTimerRef = useRef<number | null>(null);
  const noopFollowUpActiveRef = useRef(false);
  const suppressSilenceReplyOnceRef = useRef(false);
  const confirmSilenceCountRef = useRef(0);
  const noopFollowUpSpeechDetectedRef = useRef(false);

  const assistantOpen = assistantState !== 'idle';
  const commandHints = useMemo(
    () => getCommandHints(screen, assistantState === 'confirming'),
    [assistantState, screen],
  );

  useEffect(() => {
    installGlobalErrorHook();
    feLog('app-MOUNT', { ts: Date.now(), initialAssistantState: assistantState, initialScreen: screen });
    return () => feLog('app-UNMOUNT', { ts: Date.now() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch radio channels từ BE, polling mỗi 30s để tự động cập nhật UI
  useEffect(() => {
    let cancelled = false;
    const fetchChannels = () => {
      fetch('/api/handfree/radio-channels')
        .then((r) => r.ok ? r.json() : null)
        .then((data) => {
          if (cancelled || !data) return;
          const channels = (data as { channels?: { id: string; name: string }[] }).channels;
          if (Array.isArray(channels) && channels.length > 0) {
            setRadioChannels((prev) => {
              if (JSON.stringify(prev) === JSON.stringify(channels)) return prev;
              // Đồng bộ currentChannelId: nếu id cũ không còn trong list mới → reset về kênh đầu
              setCurrentChannelId((id) => {
                const stillExists = channels.some((c) => c.id === id);
                return stillExists ? id : channels[0].id;
              });
              return channels;
            });
          }
        })
        .catch(() => {/* giữ defaults khi mất mạng */ });
    };
    fetchChannels();
    const timer = window.setInterval(fetchChannels, 30_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    feLog('assistantState', { state: assistantState });
    if (assistantState === 'idle') {
      feLog('assistant-CLOSED-to-idle', { from: 'state-watch' });
    }
  }, [assistantState]);

  useEffect(() => {
    feLog('screen-change', { screen });
    screenRef.current = screen;
  }, [screen]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const payload: PersistedSession = {
        schemaVersion: 3,
        currentChannelId,
        radioTopicIndex,
        toggles,
        routeLabel,
        vehiclePlate,
        recentActionCodes: recentActionCodes.slice(-5),
        sessionStart: sessionStartRef.current,
      };
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // ignore quota/serialization errors
    }
  }, [currentChannelId, radioTopicIndex, toggles, routeLabel, vehiclePlate, recentActionCodes]);

  useEffect(() => {
    asrListeningRef.current = asrListening;
  }, [asrListening]);

  useEffect(() => {
    const client = new AsrClient();
    asrClientRef.current = client;

    const onStarted = () => {
      asrListeningRef.current = true;
      setAsrListening(true);
      setAssistantState('listening');
      setVoiceError('');
      if (noopFollowUpActiveRef.current) {
        scheduleNoopFollowUpTimeout();
      }
    };

    const onInterim = (event: CustomEvent<{ transcript: string }>) => {
      setAsrInterim(event.detail.transcript);
      if (noopFollowUpActiveRef.current && event.detail.transcript.trim()) {
        noopFollowUpActiveRef.current = false;
        noopFollowUpSpeechDetectedRef.current = true;
        if (noopFollowUpTimerRef.current !== null) {
          window.clearTimeout(noopFollowUpTimerRef.current);
          noopFollowUpTimerRef.current = null;
        }
      }
    };

    // Flag để phân biệt: ASR đã trả final (dù rỗng) hay kết thúc do silence timeout
    let finalFired = false;

    const onFinal = (event: CustomEvent<{ transcript: string; confidence: number }>) => {
      finalFired = true;
      const finalTranscript = event.detail.transcript.trim();
      setAsrInterim('');
      asrListeningRef.current = false;
      setAsrListening(false);
      setAudioLevel(0);
      client.stop();

      if (finalTranscript) {
        if (noopFollowUpTimerRef.current !== null) {
          window.clearTimeout(noopFollowUpTimerRef.current);
          noopFollowUpTimerRef.current = null;
        }
        noopFollowUpActiveRef.current = false;
        handleCommandRef.current(finalTranscript, 'asr');
      } else {
        if (noopFollowUpActiveRef.current) {
          noopFollowUpActiveRef.current = false;
          setAssistantState('idle');
          return;
        }
        // Nếu đang confirming → dùng retry/cancel thay vì asrNoTranscriptReplies
        if (pendingConfirmationRef.current !== null) {
          handleConfirmRetryOrCancel();
        } else {
          setAssistantState('idle');
          addBotFeedback(pickFromPool(asrNoTranscriptReplies));
        }
      }
    };

    const onLevel = (event: CustomEvent<{ rms: number }>) => {
      setAudioLevel(Math.min(1, event.detail.rms * 10));
      if (
        noopFollowUpActiveRef.current
        && !noopFollowUpSpeechDetectedRef.current
        && event.detail.rms >= 0.03
      ) {
        noopFollowUpActiveRef.current = false;
        noopFollowUpSpeechDetectedRef.current = true;
        if (noopFollowUpTimerRef.current !== null) {
          window.clearTimeout(noopFollowUpTimerRef.current);
          noopFollowUpTimerRef.current = null;
        }
      }
    };

    const onError = (event: CustomEvent<{ message: string; fatal: boolean }>) => {
      if (noopFollowUpTimerRef.current !== null) {
        window.clearTimeout(noopFollowUpTimerRef.current);
        noopFollowUpTimerRef.current = null;
      }
      noopFollowUpActiveRef.current = false;
      asrListeningRef.current = false;
      setAsrListening(false);
      setAudioLevel(0);

      // Phân loại lỗi và tạo message phù hợp
      let message: string;
      let botFeedback: string | null = null;

      switch (event.detail.message) {
        case 'not-allowed':
          message = 'Trình duyệt chưa được cấp quyền micro.';
          botFeedback = 'Mình cần quyền sử dụng micro để nghe lệnh, bạn vui lòng cấp quyền micro cho trình duyệt nhé.';
          break;
        case 'network-error':
          message = 'Không kết nối được ASR (mất mạng)';
          botFeedback = 'Mình đang mất kết nối mạng, không thể nghe giọng nói được. Bạn kiểm tra lại mạng hoặc dùng nút bấm tạm thời nhé.';
          break;
        case 'stream-interrupted':
          message = 'Kết nối ASR bị ngắt (mất mạng)';
          botFeedback = 'Ui, mạng bị mất giữa chừng rồi, mình không nghe được nữa. Bạn kiểm tra lại mạng hoặc dùng nút bấm tạm nhé.';
          break;
        default:
          message = event.detail.message;
          botFeedback = 'Mic bị lỗi rồi, bạn thử lại hoặc dùng nút bấm nhé.';
      }

      setVoiceError(message);
      addTranscript('system', `ASR lỗi: ${message}`);

      // Nếu đang confirming → hủy pending có thông báo
      if (pendingConfirmationRef.current !== null) {
        setPendingConfirmation(null);
        setAssistantState('idle');
        addBotFeedback(botFeedback || 'Mic bị lỗi, mình hủy lệnh đang chờ xác nhận, bạn thử lại nhé.');
      } else if (botFeedback) {
        setAssistantState('idle');
        addBotFeedback(botFeedback);
      } else {
        setAssistantState('idle');
      }
    };

    const onEnded = (event: CustomEvent<{ transcript: string }>) => {
      asrListeningRef.current = false;
      setAsrListening(false);
      setAudioLevel(0);
      if (suppressSilenceReplyOnceRef.current) {
        suppressSilenceReplyOnceRef.current = false;
        finalFired = false;
        return;
      }
      // Chỉ hiện silence reply khi stream kết thúc MÀ onFinal chưa bao giờ fire
      // (tức là user im lặng hoàn toàn, ASR timeout mà không có âm nào được xử lý)
      if (!finalFired && !event.detail.transcript.trim()) {
        // Nếu đang chờ xác nhận → dùng chung logic retry/cancel
        if (pendingConfirmationRef.current !== null) {
          handleConfirmRetryOrCancel();
        } else {
          setAssistantState('idle');
          addBotFeedback(pickFromPool(asrSilenceReplies));
        }
      }
      finalFired = false; // reset cho lần mở mic tiếp theo
    };

    client.addEventListener('started', onStarted);
    client.addEventListener('interim', onInterim);
    client.addEventListener('final', onFinal);
    client.addEventListener('level', onLevel);
    client.addEventListener('error', onError);
    client.addEventListener('ended', onEnded);

    return () => {
      if (noopFollowUpTimerRef.current !== null) {
        window.clearTimeout(noopFollowUpTimerRef.current);
        noopFollowUpTimerRef.current = null;
      }
      client.removeEventListener('started', onStarted);
      client.removeEventListener('interim', onInterim);
      client.removeEventListener('final', onFinal);
      client.removeEventListener('level', onLevel);
      client.removeEventListener('error', onError);
      client.removeEventListener('ended', onEnded);
      client.destroy();
      stopTTS();
    };
  }, []);

  function addTranscript(speaker: TranscriptEntry['speaker'], text: string) {
    setTranscript((items) => [...items.slice(-9), { id: now(), speaker, text }]);
  }

  function speakFeedback(text: string, onDone?: () => void) {
    if (!ttsEnabled || !text.trim()) {
      onDone?.();
      return;
    }
    setSpeaking(true);
    speakText(text, false, {
      onStart: () => setSpeaking(true),
      onEnd: () => {
        setSpeaking(false);
        onDone?.();
      },
      onError: (message) => {
        setSpeaking(false);
        setVoiceError(message);
        onDone?.();
      },
    });
  }

  function addBotFeedback(text: string, shouldSpeak = true, onDone?: () => void) {
    addTranscript('bot', text);
    if (shouldSpeak) {
      speakFeedback(text, onDone);
      return;
    }
    onDone?.();
  }

  function openAssistant() {
    if (asrListening) {
      addBotFeedback(pickFromPool(alreadyAwakeReplies));
      return;
    }
    startVoiceListening();
  }

  function toggleTts() {
    setTtsEnabled((enabled) => {
      const next = !enabled;
      localStorage.setItem('gt365_tts_enabled', next ? '1' : '0');
      if (!next) {
        stopTTS();
        setSpeaking(false);
      }
      return next;
    });
  }

  async function startVoiceListening(options?: { suppressSystemTranscript?: boolean }) {
    if (asrListeningRef.current) return;
    await unlockAudio();
    stopTTS();
    setSpeaking(false);
    setVoiceError('');
    setAsrInterim('');
    setAudioLevel(0);

    if (!options?.suppressSystemTranscript) {
      addTranscript('system', 'Đang mở mic, bạn nói lệnh đi nhé...');
    }
    asrListeningRef.current = true;
    asrClientRef.current?.start('vi');
  }

  function scheduleNoopFollowUpTimeout() {
    if (noopFollowUpTimerRef.current !== null) {
      window.clearTimeout(noopFollowUpTimerRef.current);
      noopFollowUpTimerRef.current = null;
    }
    noopFollowUpTimerRef.current = window.setTimeout(() => {
      if (!noopFollowUpActiveRef.current) return;
      noopFollowUpActiveRef.current = false;
      suppressSilenceReplyOnceRef.current = true;
      asrListeningRef.current = false;
      asrClientRef.current?.stop();
      setAsrListening(false);
      setAudioLevel(0);
      // Nếu đang confirming → dùng retry/cancel thay vì về idle trực tiếp
      if (pendingConfirmationRef.current !== null) {
        handleConfirmRetryOrCancel();
      } else {
        setAssistantState('idle');
        addBotFeedback(
          pickFromPool([
            'Mình tắt mic rồi nhé, cần gì bạn chạm vào nút trợ lý là mình nghe lại liền.',
            'Mình nghỉ đây nha, lúc nào cần bạn chạm nút trợ lý một cái là mình bật lại liền.',
            'Mình tạm tắt mic rồi đó, lúc nào cần bạn chạm nút trợ lý là mình sẵn sàng ngay.',
          ]),
        );
      }
    }, 15000);
  }

  function stopVoiceListening() {
    if (noopFollowUpTimerRef.current !== null) {
      window.clearTimeout(noopFollowUpTimerRef.current);
      noopFollowUpTimerRef.current = null;
    }
    noopFollowUpActiveRef.current = false;
    asrListeningRef.current = false;
    asrClientRef.current?.stop();
    setAsrListening(false);
    setAudioLevel(0);
  }

  function startNoopFollowUpWindow() {
    if (noopFollowUpTimerRef.current !== null) {
      window.clearTimeout(noopFollowUpTimerRef.current);
      noopFollowUpTimerRef.current = null;
    }
    noopFollowUpActiveRef.current = true;
    noopFollowUpSpeechDetectedRef.current = false;
    if (asrListeningRef.current) {
      // If ASR is already active, count 5s from the current listening state.
      scheduleNoopFollowUpTimeout();
      return;
    }
    startVoiceListening();
  }

  function shouldOpenNoopFollowUp(actionCode: ActionCode, source: CommandSource) {
    if (source === 'chip') return false;
    switch (actionCode) {
      case 'OPEN_HOME_SCREEN':
      case 'OPEN_RADIO_SCREEN':
      case 'OPEN_UTILITIES_SCREEN':
      case 'OPEN_COMMUNITY_SCREEN':
      case 'OPEN_PROFILE_SCREEN':
      case 'OPEN_NOTIFICATIONS_SCREEN':
      case 'OPEN_ROUTE_SCREEN':
      case 'ENABLE_VIOLATION_ALERTS':
      case 'DISABLE_VIOLATION_ALERTS':
      case 'PLAY_RADIO':
      case 'PLAY_ROAD_STORY':
      case 'PLAY_FRIENDS_CONTENT':
      case 'PAUSE_RADIO':
        return true;
      default:
        return false;
    }
  }

  function toggleVoiceListening() {
    if (asrListening) {
      stopVoiceListening();
      return;
    }
    startVoiceListening();
  }

  function navigate(nextScreen: ScreenId, direction: 'forward' | 'backward' = 'forward') {
    const stack = new Error().stack?.split('\n').slice(2, 5).join(' | ').slice(0, 400);
    feLog('navigate', { nextScreen, direction, stack });
    const currentScreen = screenRef.current;
    if (currentScreen === nextScreen) return;
    if (nextScreen === 'home') {
      setHistory([]);
      setFocusedCard(null);
    } else {
      setHistory((items) => [...items, currentScreen].slice(-12));
    }
    setTransitionDirection(direction);
    setTransitionKey((k) => k + 1);
    setScreen(nextScreen);
    const tabIds: ScreenId[] = ['home', 'radio', 'utilities', 'profile'];
    if (tabIds.includes(nextScreen)) {
      setPulseTab(nextScreen);
      window.setTimeout(() => {
        setPulseTab((current) => (current === nextScreen ? null : current));
      }, 700);
    }
  }

  function goBack() {
    const target = history.at(-1) ?? 'home';
    if (screenRef.current !== target) {
      setTransitionDirection('backward');
      setTransitionKey((k) => k + 1);
    }
    setScreen(target);
    setHistory((items) => items.slice(0, -1));
  }

  function pushToast(toast: Omit<ActionToast, 'id'>) {
    const id = now();
    setToasts((items) => [...items.slice(-2), { ...toast, id }]);
    window.setTimeout(() => {
      setToasts((items) => items.filter((t) => t.id !== id));
    }, 1800);
  }

  function buildFeedbackContext(): FeedbackContext {
    return {
      plate: vehiclePlate,
      routeOrigin: routeLabel.includes('→') ? routeLabel.split('→')[0].trim() : undefined,
      routeDest: routeLabel.includes('→') ? routeLabel.split('→')[1].trim() : undefined,
      channelName: radioChannels[radioChannelIndex]?.name,
      availableChannels: formatAvailableChannels(radioChannels),
      notificationCount: 3,
      nearestGasDistance: '450 mét',
    };
  }

  function pickConfirmPrompt(action: ScreenAction, currentScreen: ScreenId): string {
    const ctx = buildFeedbackContext();
    if (action.confirmPromptByScreen?.[currentScreen]) {
      return pickFeedback(action.confirmPromptByScreen[currentScreen], ctx);
    }
    return pickFeedback(action.confirmPrompt, ctx) || 'Mình thực hiện lệnh này nhé?';
  }

  function noOpResponseFor(actionCode: ActionCode): string | null {
    const pool = (poolList: string[]): string => pickFeedback(poolList, buildFeedbackContext());
    switch (actionCode) {
      case 'PLAY_RADIO':
      case 'PLAY_ROAD_STORY':
      case 'PLAY_FRIENDS_CONTENT':
        return radioPlaying
          ? pool([
            'Nội dung số đang phát {channelName} rồi mà, bạn muốn đổi kênh khác không?',
            'Mình vẫn đang phát {channelName} cho bạn đó, bạn cần đổi gì không?',
            '{channelName} đang chạy từ nãy rồi nè, bạn muốn chỉnh tiếng hay đổi kênh?',
          ])
          : null;
      case 'PAUSE_RADIO':
        return !radioPlaying
          ? pool([
            'Nội dung số đang tắt sẵn rồi đó, bạn muốn mình mở lại không?',
            'Mình tắt radio từ nãy rồi mà, bạn có cần bật lại không nhé?',
          ])
          : null;
      case 'OPEN_HOME_SCREEN':
        return screen === 'home'
          ? pool([
            'Bạn đang ở trang chủ rồi đó, muốn mình mở mục nào nữa?',
            'Mình thấy bạn đang ở màn chính mà, bạn cần gì cứ bảo nhé.',
            'Trang chủ đây rồi nè, bạn nói tiếp đi.',
          ])
          : null;
      case 'OPEN_RADIO_SCREEN':
        return screen === 'radio'
          ? pool([
            'Bạn đang ở màn Nội dung số rồi đó, chọn kênh nào nghe nhé?',
            'Mình thấy bạn đang ở Nội dung số mà, bạn muốn nghe gì?',
          ])
          : null;
      case 'OPEN_UTILITIES_SCREEN':
        return screen === 'utilities'
          ? pool([
            'Bạn đang ở Tiện ích rồi nè, mình mở mục nào cho bạn?',
            'Tiện ích đây rồi đó, bạn chọn mục nào nhé?',
          ])
          : null;
      case 'OPEN_COMMUNITY_SCREEN':
        return screen === 'community'
          ? pool([
            'Mình đang ở Cộng đồng rồi đó, bạn cần gì cứ bảo nhé.',
            'Bạn đang ở màn Cộng đồng rồi nè, bạn muốn vào nhóm nào?',
          ])
          : null;
      case 'OPEN_PROFILE_SCREEN':
        return screen === 'profile'
          ? pool([
            'Mình đang ở Tài khoản rồi nhé, bạn cần gì cứ nói.',
            'Bạn đang ở màn Tài khoản rồi đó, bạn muốn chỉnh gì không?',
          ])
          : null;
      case 'OPEN_ASSISTANT':
        return assistantOpen
          ? pool([
            'Mình đang nghe bạn nói đây mà, bạn cứ nói tiếp đi.',
            'Mình vẫn ở đây từ nãy nè, có gì bạn cứ bảo.',
          ])
          : null;
      case 'ENABLE_HOTSPOT_ALERT':
        return toggles.hotspotAlert
          ? pool([
            'Mình đang bật báo điểm nóng cho bạn rồi đó, yên tâm nhé.',
            'Báo điểm nóng của mình đang chạy mà bạn, có cần chỉnh gì không?',
          ])
          : null;
      case 'ENABLE_VIOLATION_ALERTS':
        return toggles.hotspotAlert
          ? pool([
            'Cảnh báo đang bật rồi, bạn có muốn mình hỗ trợ gì cứ nói nhé.',
            'Mình đang bật cảnh báo đầy đủ cho bạn rồi đó, bạn cần gì cứ bảo.',
          ])
          : null;
      case 'DISABLE_VIOLATION_ALERTS':
        return !toggles.hotspotAlert
          ? pool([
            'Cảnh báo đang tắt rồi, bạn có muốn mình hỗ trợ gì cứ nói nhé.',
            'Mình tắt cảnh báo từ trước rồi đó, bạn cần gì cứ bảo.',
          ])
          : null;
      case 'CLEAR_ROUTE':
        return routeLabel === 'Nhập lộ trình của bạn'
          ? pool([
            'Bạn chưa có lộ trình nào để xóa đâu, mình mở Lộ trình nhập điểm đi đến nhé?',
          ])
          : null;
      case 'ENABLE_LOCATION_PERMISSION':
        return toggles.location
          ? pool([
            'Vị trí đang bật rồi đó, bản đồ chạy tốt nhé.',
            'Mình đang dùng vị trí của bạn rồi mà, bạn yên tâm.',
          ])
          : null;
      case 'DISABLE_LOCATION_PERMISSION':
        return !toggles.location
          ? pool([
            'Vị trí đang tắt sẵn rồi đấy, bạn muốn mình bật lại cho bản đồ chạy không?',
          ])
          : null;
      case 'ENABLE_MIC_PERMISSION':
        return toggles.microphone
          ? pool([
            'Mic của bạn đang bật mà, bạn cứ nói thoải mái nhé.',
          ])
          : null;
      default:
        return null;
    }
  }

  function dynamicFeedback(action: ScreenAction): string | null {
    if (action.actionCode === 'SWITCH_NEXT_CHANNEL') {
      const next = radioChannels[(radioChannelIndex + 1) % radioChannels.length];
      return radioPlaying ? `Sang ${next.name}.` : `Bật và sang ${next.name}.`;
    }
    if (action.actionCode === 'SWITCH_PREV_CHANNEL') {
      const prev =
        radioChannels[(radioChannelIndex - 1 + radioChannels.length) % radioChannels.length];
      return radioPlaying ? `Quay lại ${prev.name}.` : `Bật và về ${prev.name}.`;
    }
    return null;
  }

  function emitToast(action: ScreenAction) {
    switch (action.actionCode) {
      case 'OPEN_HOME_SCREEN':
        pushToast({ icon: Home, text: 'Về trang chủ', tone: 'ok' });
        return;
      case 'PLAY_RADIO':
      case 'PLAY_ROAD_STORY':
      case 'PLAY_FRIENDS_CONTENT':
        pushToast({ icon: Radio, text: 'Đang phát', tone: 'ok' });
        return;
      case 'PAUSE_RADIO':
        pushToast({ icon: Pause, text: 'Đã tắt đài', tone: 'info' });
        return;
      case 'SWITCH_NEXT_CHANNEL': {
        const next = radioChannels[(radioChannelIndex + 1) % radioChannels.length];
        pushToast({ icon: SkipForward, text: `Kênh: ${next.name}`, tone: 'ok' });
        return;
      }
      case 'SWITCH_PREV_CHANNEL': {
        const prev =
          radioChannels[(radioChannelIndex - 1 + radioChannels.length) % radioChannels.length];
        pushToast({ icon: SkipForward, text: `Kênh: ${prev.name}`, tone: 'ok' });
        return;
      }
      case 'ENABLE_VIOLATION_ALERTS':
        pushToast({ icon: Shield, text: 'Cảnh báo: BẬT', tone: 'ok' });
        return;
      case 'DISABLE_VIOLATION_ALERTS':
        pushToast({ icon: Shield, text: 'Cảnh báo: TẮT', tone: 'warn' });
        return;
      default:
        return;
    }
  }

  function updateToggle(key: keyof typeof toggles, value: boolean) {
    setToggles((current) => ({ ...current, [key]: value }));
  }

  function respondMissingRadioTopic(inputText: string) {
    setFallbackCount(0);
    setAssistantState('executing');
    addBotFeedback(buildMissingRadioTopicReply(inputText), true, () => {
      startVoiceListening({ suppressSystemTranscript: true });
    });
  }

  function performAction(actionCode: ActionCode) {
    switch (actionCode) {
      case 'CLOSE_ASSISTANT': {
        const stack = new Error().stack?.split('\n').slice(2, 6).join(' | ').slice(0, 500);
        feLog('CLOSE_ASSISTANT-fired', { stack });
        setPendingConfirmation(null);
        setAssistantState('idle');
        return;
      }
      case 'GO_BACK':
        goBack();
        return;
      case 'SCROLL_DOWN':
        scrollRef.current?.scrollBy({ top: 420, behavior: 'smooth' });
        return;
      case 'SCROLL_UP':
        scrollRef.current?.scrollBy({ top: -420, behavior: 'smooth' });
        return;
      case 'SELECT_FIRST_ITEM':
        if (screen === 'utilities') navigate('insurance');
        if (screen === 'radio') setRadioPlaying(true);
        if (screen === 'community') setCommunityStatus('Đã vào Hội xe tải Tây Bắc');
        setFocusedCard('first');
        return;
      case 'SELECT_SECOND_ITEM':
        if (screen === 'utilities') navigate('fineLookup');
        if (screen === 'radio') setRadioTopicIndex(1);
        setFocusedCard('second');
        return;
      case 'SET_ROUTE_HN_LS':
        setRouteLabel('Hà Nội → Lạng Sơn');
        return;
      case 'CLEAR_ROUTE':
        setRouteLabel('Nhập lộ trình của bạn');
        return;
      case 'READ_DRIVE_ALERTS':
      case 'REPEAT_DRIVE_ALERT':
        setFocusedCard('drive-alert');
        return;
      case 'ENABLE_HOTSPOT_ALERT':
        updateToggle('hotspotAlert', true);
        return;
      case 'ENABLE_VIOLATION_ALERTS':
        updateToggle('hotspotAlert', true);
        return;
      case 'DISABLE_VIOLATION_ALERTS':
        updateToggle('hotspotAlert', false);
        return;
      case 'SWITCH_NEXT_CHANNEL':
        const nextId = radioChannels[(radioChannelIndex + 1) % radioChannels.length]?.id;
        if (nextId) setCurrentChannelId(nextId);
        setRadioPlaying(true);
        return;
      case 'SWITCH_PREV_CHANNEL':
        const prevId = radioChannels[(radioChannelIndex - 1 + radioChannels.length) % radioChannels.length]?.id;
        if (prevId) setCurrentChannelId(prevId);
        setRadioPlaying(true);
        return;
      case 'OPEN_REPORT_DRAFT':
        setReportStatus('Đang chờ loại phản ánh');
        return;
      case 'DRAFT_TRAFFIC_JAM_REPORT':
        setReportStatus('Đã ghi nhận phản ánh kẹt xe tại vị trí hiện tại');
        return;
      case 'DRAFT_ACCIDENT_REPORT':
        setReportStatus('Đã ghi nhận phản ánh tai nạn tại vị trí hiện tại');
        return;
      case 'DRAFT_OBSTACLE_REPORT':
        setReportStatus('Đã ghi nhận phản ánh chướng ngại vật tại vị trí hiện tại');
        return;
      case 'SUBMIT_REPORT':
        setReportStatus('Đã gửi phản ánh thành công');
        return;
      case 'PLAY_RADIO':
      case 'PLAY_ROAD_STORY':
      case 'PLAY_FRIENDS_CONTENT':
        setRadioPlaying(true);
        if (actionCode === 'PLAY_FRIENDS_CONTENT') setRadioTopicIndex(1);
        if (actionCode === 'PLAY_ROAD_STORY') setRadioTopicIndex(0);
        return;
      case 'PAUSE_RADIO':
        setRadioPlaying(false);
        return;
      case 'PLAY_NEXT_CONTENT':
        setRadioTopicIndex((index) => (index + 1) % 4);
        setRadioPlaying(true);
        return;
      case 'PLAY_PREVIOUS_CONTENT':
        setRadioTopicIndex((index) => (index + 3) % 4);
        setRadioPlaying(true);
        return;
      case 'OPEN_RADIO_TALK':
        setRadioPlaying(false);
        return;
      case 'MUTE_MIC':
        updateToggle('microphone', false);
        return;
      case 'UNMUTE_MIC':
        updateToggle('microphone', true);
        return;
      case 'ENABLE_SPEAKER':
        setFocusedCard('speaker');
        return;
      case 'LEAVE_RADIO_ROOM':
        setRadioPlaying(true);
        return;
      case 'RUN_FINE_LOOKUP':
      case 'OPEN_FINE_RESULT_LIST':
      case 'OPEN_FINE_DETAIL':
        setFineLookupDone(true);
        return;
      case 'OPEN_VEHICLE_SELECTOR':
        setFocusedCard('vehicle-selector');
        return;
      case 'OPEN_FINE_PAYMENT_GUIDE':
        setFocusedCard('payment-guide');
        return;
      case 'OPEN_FINE_SUBSCRIBE':
        setFocusedCard('fine-subscribe');
        return;
      case 'OPEN_RESCUE_SERVICE':
      case 'OPEN_GAS_SERVICE':
      case 'OPEN_REGISTRATION_SERVICE':
      case 'OPEN_CAR_VALUATION':
        setFocusedCard(actionCode);
        return;
      case 'FOCUS_INSURANCE_TNDS':
        setFocusedCard('insurance-tnds');
        return;
      case 'FOCUS_INSURANCE_PHYSICAL':
        setFocusedCard('insurance-physical');
        return;
      case 'START_INSURANCE_BUY':
        setFocusedCard('insurance-buy');
        return;
      case 'ENTER_FIRST_COMMUNITY':
        setCommunityStatus('Đã vào Hội xe tải Tây Bắc');
        return;
      case 'JOIN_COMMUNITY':
        setCommunityStatus('Đã gửi yêu cầu tham gia nhóm');
        return;
      case 'OPEN_VEHICLE_MANAGEMENT':
        setFocusedCard('vehicle-management');
        return;
      case 'ENABLE_LOCATION_PERMISSION':
        updateToggle('location', true);
        return;
      case 'DISABLE_LOCATION_PERMISSION':
        updateToggle('location', false);
        return;
      case 'ENABLE_MIC_PERMISSION':
        updateToggle('microphone', true);
        return;
      case 'DISABLE_MIC_PERMISSION':
        updateToggle('microphone', false);
        return;
      default:
        return;
    }
  }

  async function runResolvedAction(
    action: ScreenAction,
    createdFrom: string,
    confirmed = false,
    source: CommandSource = 'text',
  ) {
    if (action.actionCode === 'CONFIRM_PENDING') {
      const pending = pendingConfirmation;
      setPendingConfirmation(null);
      if (!pending) {
        setAssistantState('idle');
        addBotFeedback(pickFromPool(noPendingReplies));
        return;
      }
      runResolvedAction(pending.action, pending.createdFrom, true, source);
      return;
    }

    if (action.actionCode === 'CANCEL_PENDING') {
      setPendingConfirmation(null);
      setAssistantState('idle');
      addBotFeedback(pickFeedback(action.feedback, buildFeedbackContext()));
      return;
    }

    console.debug('[runAction]', action.actionCode, 'screen=', screen, 'createdFrom=', createdFrom);
    addTranscript('system', `[runAction] ${action.actionCode} (screen=${screen})`);
    feLog('runAction', { actionCode: action.actionCode, screen, createdFrom });

    // PLAY_RADIO / PLAY_RADIO_BY_NAME → tìm tên kênh trực tiếp trong input (không cần từ "kênh")
    if (action.actionCode === 'PLAY_RADIO_BY_NAME') {
      setAssistantState('recognizing');
      try {
        const recentActions = recentActionsRef.current.slice(-3).map((entry) => ({
          actionCode: entry.actionCode,
          msAgo: Math.max(0, Date.now() - entry.ts),
        }));
        const beRes = await fetch('/api/handfree/command', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: createdFrom,
            screen: screenRef.current,
            assistantState,
            context: buildFeedbackContext(),
            recentActions,
            currentChannelId,
            radioPlaying,
            // BE chỉ xét cảnh báo điểm nóng — không có lệnh voice nào đổi cảnh báo tốc độ.
            hotspotAlertEnabled: toggles.hotspotAlert,
            channels: radioChannels,
            consecutiveFallbacks: fallbackCount,
          }),
        });

        if (beRes.ok) {
          const data = await beRes.json() as {
            type: string;
            reply: string;
            action?: { code: string; nextScreen?: string; channelId?: string; channelName?: string };
          };

          feLog('be-radio-by-name', { type: data.type, channelId: data.action?.channelId, channelName: data.action?.channelName });

          if (data.type === 'action' && data.action?.channelId) {
            // BE tìm được kênh → set bằng id
            setFallbackCount(0);
            setAssistantState('executing');
            setCurrentChannelId(data.action.channelId);
            setRadioPlaying(true);
            navigate('radio', 'forward');
            addBotFeedback(data.reply || `Đã chuyển sang kênh ${data.action.channelName ?? ''}.`);
            setAssistantState('idle');
            return;
          }

          if (data.type === 'action' || data.type === 'clarification') {
            // BE không tìm được kênh (action không có channelId) hoặc clarification
            // → dùng 1 template phản hồi thống nhất và tự mở mic lại
            respondMissingRadioTopic(createdFrom);
            return;
          }
        }
      } catch (err) {
        feLog('be-radio-by-name-error', { err: String(err) });
        // fallthrough: dùng local matching bên dưới nếu BE lỗi
      }
      const normalizedInput = normalizeVietnamese(createdFrom);
      const topicTokens = toRadioTopicTokens(normalizedInput);
      let bestIndex = -1;
      let bestScore = 0;
      let secondBestScore = 0;
      radioChannels.forEach((channel, idx) => {
        const score = scoreRadioChannelMatch(normalizedInput, channel.name);
        if (score > bestScore) { secondBestScore = bestScore; bestScore = score; bestIndex = idx; }
        else if (score > secondBestScore) { secondBestScore = score; }
      });
      // Threshold cao hơn để tránh "nhạc nhật" match "Nhạc Hàn"
      const channelTopicLen = bestIndex >= 0 ? toRadioTopicTokens(normalizeVietnamese(radioChannels[bestIndex].name)).length : 0;
      const inputTopicLen = toRadioTopicTokens(normalizedInput).length;
      const strictThreshold = inputTopicLen > channelTopicLen ? 0.75 : 0.65;
      const confidentMatch = bestIndex >= 0 && bestScore >= strictThreshold && (bestScore >= 0.95 || bestScore - secondBestScore >= 0.15);

      if (confidentMatch) {
        // Tìm được kênh → chuyển kênh bằng id (không dùng index để tránh lệch khi mảng thay đổi)
        const matched = radioChannels[bestIndex];
        setFallbackCount(0);
        setAssistantState('executing');
        setCurrentChannelId(matched.id);
        setRadioPlaying(true);
        navigate('radio', 'forward');
        feLog('runAction-feedback', { actionCode: action.actionCode, text: `Đã chuyển sang kênh ${matched.name}.` });
        addBotFeedback(`Đã chuyển sang kênh ${matched.name}.`);
        setAssistantState('idle');
        return;
      }
      respondMissingRadioTopic(createdFrom);
      return;
    }
    if (action.actionCode === 'PLAY_RADIO') {
      const normalizedInput = normalizeVietnamese(createdFrom);
      const topicTokens = toRadioTopicTokens(normalizedInput);
      let bestIndex = -1;
      let bestScore = 0;
      let secondBestScore = 0;
      radioChannels.forEach((channel, idx) => {
        const score = scoreRadioChannelMatch(normalizedInput, channel.name);
        feLog('channel-score', { channel: channel.name, score: score.toFixed(2), input: normalizedInput });
        if (score > bestScore) { secondBestScore = bestScore; bestScore = score; bestIndex = idx; }
        else if (score > secondBestScore) { secondBestScore = score; }
      });
      feLog('channel-best', { bestIndex, bestScore: bestScore.toFixed(2), secondBestScore: secondBestScore.toFixed(2), channel: bestIndex >= 0 ? radioChannels[bestIndex].name : 'none' });

      // Threshold strict: input nhiều token hơn kênh → cần score cao hơn
      // tránh "nhạc nhật" (2 tokens) match "Nhạc Hàn" (2 tokens, 1 token trùng → score 0.5)
      const channelTopicLen = bestIndex >= 0 ? toRadioTopicTokens(normalizeVietnamese(radioChannels[bestIndex].name)).length : 0;
      const inputTopicLen = toRadioTopicTokens(normalizedInput).length;
      const strictThreshold = inputTopicLen > channelTopicLen ? 0.75 : 0.65;
      const confidentMatch = bestIndex >= 0 && bestScore >= strictThreshold && (bestScore >= 0.95 || bestScore - secondBestScore >= 0.15);
      if (confidentMatch) {
        const matched = radioChannels[bestIndex];
        setFallbackCount(0);
        setAssistantState('executing');
        setCurrentChannelId(matched.id);
        setRadioPlaying(true);
        navigate('radio', 'forward');
        feLog('runAction-feedback', { actionCode: action.actionCode, text: `Đã chuyển sang kênh ${matched.name}.` });
        addBotFeedback(`Đã chuyển sang kênh ${matched.name}.`);
        setAssistantState('idle');
        return;
      }

      // Không match kênh cụ thể — kiểm tra xem có phải tên kênh không có hay chỉ muốn bật radio chung
      // Input có chứa từ "radio", "đài", "nhạc", "nội dung" chung → bật radio bình thường
      // Input KHÔNG có những từ đó → user đang yêu cầu tên kênh cụ thể không có
      const GENERIC_RADIO_WORDS = /\b(radio|dai|noi dung)\b/;
      const hasGenericWord = GENERIC_RADIO_WORDS.test(normalizedInput);
      if (topicTokens.length > 0 && !hasGenericWord && normalizedInput.split(' ').length >= 3) {
        respondMissingRadioTopic(createdFrom);
        return;
      }
      // PLAY_RADIO đơn giản hoặc có từ radio/đài → tiếp tục bật radio bình thường
    }

    const noOp = noOpResponseFor(action.actionCode);
    if (noOp) {
      console.debug('[runAction] noOp →', noOp);
      addTranscript('system', `[runAction] noOp branch`);
      setFallbackCount(0);
      setAssistantState('idle');
      const shouldOpenFollowUp = shouldOpenNoopFollowUp(action.actionCode, source);
      if (shouldOpenFollowUp) {
        addBotFeedback(noOp, true, startNoopFollowUpWindow);
      } else {
        addBotFeedback(noOp);
      }
      return;
    }

    if (action.requiresConfirmation && !confirmed) {
      console.debug('[runAction] confirm');
      setPendingConfirmation({ action, createdFrom });
      setAssistantState('confirming');
      addBotFeedback(pickConfirmPrompt(action, screenRef.current), true, () => {
        // Tự động bật mic sau khi TTS đọc xong confirmPrompt
        startVoiceListening({ suppressSystemTranscript: true });
      });
      return;
    }

    setFallbackCount(0);
    setAssistantState('executing');
    setRecentActionCodes((items) => [...items.slice(-4), action.actionCode]);
    recentActionsRef.current = [
      ...recentActionsRef.current.slice(-4),
      { actionCode: action.actionCode, ts: Date.now() },
    ];

    performAction(action.actionCode);

    const direction: 'forward' | 'backward' =
      action.actionCode === 'OPEN_HOME_SCREEN' || action.actionCode === 'GO_BACK'
        ? 'backward'
        : 'forward';

    if (action.nextScreen) {
      console.debug('[runAction] navigate →', action.nextScreen, direction);
      navigate(action.nextScreen, direction);
    }

    emitToast(action);

    const ctx = buildFeedbackContext();
    const raw = dynamicFeedback(action) ?? pickFeedback(action.feedback, ctx);
    const isClose = action.actionCode === 'CLOSE_ASSISTANT';
    let text = raw;
    if (!action.requiresConfirmation && !isClose) {
      text = maybePrependAck(text);
      text = maybeAppendFollowUp(text, 0.15);
    }
    console.debug('[runAction] feedback →', JSON.stringify(text));
    feLog('runAction-feedback', { actionCode: action.actionCode, text });
    addBotFeedback(text);

    if (action.actionCode !== 'CLOSE_ASSISTANT') {
      setAssistantState('idle');
    }
  }

  function fallbackFor(_commandText: string, reason: 'noMatch' | 'ambiguous' | 'unsupported') {
    setAssistantState('fallback');

    // Lần 1: Hỏi lại + mở mic tự động
    if (fallbackCount === 0) {
      setFallbackCount(1);
      const reply = pickFromPool(reason === 'ambiguous' ? fallbackAmbiguousReplies : fallbackNoMatchReplies);
      addBotFeedback(reply, true, () => {
        // Callback sau khi TTS đọc xong - tự động mở mic để user nói lại
        startVoiceListening({ suppressSystemTranscript: true });
        feLog('fallback-auto-reopen-mic', { fallbackCount: 1 });
      });
      return;
    }

    // Lần 2: Đóng trợ lý
    setFallbackCount(0);
    setPendingConfirmation(null);
    const giveUpReply = pickFromPool([
      'Mình vẫn chưa nghe rõ, thôi bạn dùng nút bấm cho nhanh nhé, mình tạm nghỉ đây.',
      'Mình chưa hiểu được ý bạn, bạn thao tác bằng tay cho tiện nha, mình đóng đây.',
      'Ui, mình không rõ lệnh này, bạn bấm trên màn hình cho nhanh nhé, mình tắt đây.',
    ]);
    addBotFeedback(giveUpReply, true, () => {
      // Callback sau khi TTS đọc xong - đóng trợ lý
      stopVoiceListening();
      setAssistantState('idle');
      feLog('fallback-close-assistant', { fallbackCount: 2 });
    });
  }

  async function tryLlmRescue(cleaned: string): Promise<boolean> {
    try {
      const r = await tryLlmRescueInner(cleaned);
      feLog('tryLlmRescue-return', { result: r });
      return r;
    } catch (err: any) {
      console.error('[llm-rescue] threw', err);
      feLog('tryLlmRescue-THREW', {
        message: err?.message || String(err),
        stack: err?.stack?.slice(0, 1500),
      });
      addTranscript('system', `[LLM rescue lỗi] ${err?.message || String(err)}`);
      setAssistantState('idle');
      return false;
    }
  }

  async function tryLlmRescueInner(cleaned: string): Promise<boolean> {
    const candidates = getLlmCandidates(screenRef.current, assistantState);
    console.debug('[llm-rescue] start', { transcript: cleaned, screen: screenRef.current, assistantState, candidates: candidates.length });
    if (candidates.length === 0) {
      console.debug('[llm-rescue] skip — no candidates for current screen');
      addTranscript('system', '[LLM] bỏ qua — không có candidate cho màn hình hiện tại.');
      return false;
    }

    const now = Date.now();
    const recentActions = recentActionsRef.current.slice(-3).map((entry) => ({
      actionCode: entry.actionCode,
      msAgo: Math.max(0, now - entry.ts),
    }));

    const controller = new AbortController();
    setAssistantState('recognizing');

    const outcome = await classifyIntentRemote({
      transcript: cleaned,
      screen: screenRef.current,
      assistantState,
      candidates,
      recentActions: recentActions.length > 0 ? recentActions : undefined,
      signal: controller.signal,
    });

    if (!outcome.ok) {
      console.warn('[llm-rescue] failed', outcome);
      feLog('llm-not-ok', { reason: outcome.reason, detail: outcome.detail });
      addTranscript('system', `[LLM lỗi] ${outcome.reason}${outcome.detail ? ': ' + outcome.detail : ''}`);
      return false;
    }

    const result = outcome.result;
    addTranscript(
      'system',
      `[LLM] ${result.intentCode ?? 'null'} (conf=${result.confidence.toFixed(2)}, ${result.latencyMs ?? '?'}ms${result.cacheHit ? ', cache' : ''}) — ${result.reason ?? ''}`,
    );

    if (!result.intentCode) {
      console.debug('[llm-rescue] null intent — fall through to fallback');
      return false;
    }

    const action = resolveAction(
      result.intentCode as IntentCode,
      screenRef.current,
      assistantState === 'confirming',
    );
    if (!action) {
      console.warn('[llm-rescue] intent has no action for screen', result.intentCode, screenRef.current);
      addTranscript('system', `[LLM] intent ${result.intentCode} không có action trên màn ${screenRef.current}`);
      return false;
    }

    const kind = getIntentActionKind(result.intentCode as IntentCode);
    console.debug('[llm-rescue] kind=', kind, 'action=', action.actionCode);

    const canonicalPhrase = getCanonicalPhrase(result.intentCode as IntentCode);
    if (!canonicalPhrase) {
      console.warn('[llm-rescue] no canonical phrase for', result.intentCode);
      addTranscript('system', `[LLM] intent ${result.intentCode} thiếu canonical phrase`);
      return false;
    }
    console.debug('[llm-rescue] canonical phrase =', canonicalPhrase);

    const lastEntry = recentActionsRef.current.at(-1);
    if (lastEntry && lastEntry.actionCode === action.actionCode && now - lastEntry.ts < 5000) {
      console.debug('[llm-rescue] debounced — same action <5s ago');
      addBotFeedback('Bạn vừa nói rồi đó, mình giữ nguyên cho bạn nhé.');
      setAssistantState('idle');
      return true;
    }

    const dispatch = () => {
      console.debug('[llm-rescue] dispatch canonical →', canonicalPhrase);
      addTranscript('system', `[LLM] dispatch "${canonicalPhrase}" → ${action.actionCode}`);
      feLog('llm-dispatch', { canonical: canonicalPhrase, actionCode: action.actionCode });
      handleCommandRef.current(canonicalPhrase, 'llm-rescue');
    };

    if (kind === 'visual_required') {
      if (result.confidence < 0.65) {
        console.debug('[llm-rescue] visual_required below 0.65 — fall through');
        return false;
      }
      const shortLabel = action.intentCode.toLowerCase().includes('insurance')
        ? 'bảo hiểm'
        : 'mục bạn vừa nói';
      console.debug('[llm-rescue] → defer (visual_required)');
      addBotFeedback(
        pickFromPool([
          `Bạn muốn ${shortLabel} đúng không? Mình mở cho bạn rồi, khi nào dừng xe bạn xem rồi bảo mình tiếp nhé.`,
          `Mình mở ${shortLabel} cho bạn rồi đó, lúc tiện bạn dừng xe rồi mình cùng làm tiếp nha, không vội đâu.`,
          `Mình chuẩn bị ${shortLabel} cho bạn rồi ạ, khi nào an toàn bạn xem giúp mình, có gì cứ kêu mình.`,
        ]),
      );
      dispatch();
      return true;
    }

    const isDanger = action.requiresConfirmation || action.riskLevel === 'critical';
    if (isDanger) {
      console.debug('[llm-rescue] → confirm (danger) via canonical dispatch');
      dispatch();
      return true;
    }

    const autoThreshold = kind === 'info_readback' ? 0.7 : 0.75;
    const echoThreshold = kind === 'info_readback' ? 0.5 : 0.55;

    if (result.confidence >= autoThreshold) {
      console.debug('[llm-rescue] → auto-exec', `(${result.confidence} >= ${autoThreshold})`);
      dispatch();
      return true;
    }

    if (result.confidence >= echoThreshold) {
      console.debug('[llm-rescue] → echo + exec', `(${result.confidence} in [${echoThreshold}, ${autoThreshold}))`);
      const echoPool =
        kind === 'info_readback'
          ? [
            'Mình hiểu rồi nha, mình mở cho bạn rồi đọc qua nội dung cho nghe nhé.',
            'Để mình mở cho bạn, mình tóm tắt qua giọng nói luôn nha.',
            'Mình mở giúp bạn rồi, mình kể chi tiết cho bạn nghe nhé.',
          ]
          : [
            'Mình hiểu ý bạn rồi, mình làm cho bạn liền đây nhé.',
            'Để mình thao tác cho bạn ngay nha.',
            'Mình ghi nhận ý bạn rồi, mình xử lý cho bạn ngay đây nè.',
          ];
      addBotFeedback(pickFromPool(echoPool));
      dispatch();
      return true;
    }

    console.debug('[llm-rescue] below echo threshold — fall through', result.confidence);
    return false;
  }

  async function handleCommand(commandText: string, source: CommandSource = 'text') {
    console.debug('[handleCommand]', source, '→', JSON.stringify(commandText));
    feLog('handleCommand', { source, text: commandText });
    try {
      await handleCommandInner(commandText, source);
    } catch (err: any) {
      console.error('[handleCommand] unhandled', err);
      feLog('handleCommand-THREW', {
        message: err?.message || String(err),
        stack: err?.stack?.slice(0, 1500),
        source,
      });
      addTranscript('system', `[handleCommand lỗi] ${err?.message || String(err)}`);
      try {
        fallbackFor(commandText.trim(), 'noMatch');
      } catch (e: any) {
        console.error('[fallbackFor] also failed', e);
        feLog('fallbackFor-THREW', { message: e?.message || String(e) });
      }
    }
  }

  // Dùng chung cho cả 2 trường hợp: im lặng + nói sai khi confirming
  // Lần 1 → hỏi lại, lần 2 → hủy
  function handleConfirmRetryOrCancel() {
    confirmSilenceCountRef.current += 1;
    if (confirmSilenceCountRef.current >= 2) {
      setPendingConfirmation(null); // tự reset counter về 0
      setAssistantState('idle');
      addBotFeedback('Mình hủy lệnh vì không nhận được xác nhận, bạn cần gì cứ bảo mình nhé.');
    } else {
      setAssistantState('confirming');
      addBotFeedback(pickFromPool(confirmingOnlyReplies), true, () => {
        startVoiceListening({ suppressSystemTranscript: true });
      });
    }
  }

  async function handleCommandInner(commandText: string, source: CommandSource = 'text') {
    const cleaned = commandText.trim();
    if (!cleaned) return;

    const isLlmRescue = source === 'llm-rescue';
    feLog('hci-enter', { source, cleaned, screen: screenRef.current, assistantState });

    if (!isLlmRescue) addTranscript('user', cleaned);
    // Dùng ref để đọc synchronously — assistantState có thể đã bị overwrite bởi ASR transitions
    const isConfirming = pendingConfirmationRef.current !== null;
    setAssistantState('recognizing');

    const match = matchTranscript(cleaned, screenRef.current, isConfirming ? 'confirming' : assistantState);
    feLog('hci-match', { type: match.type, intent: match.type === 'matched' ? match.candidate.command.intentCode : null, confidence: match.type === 'matched' ? match.candidate.confidence : null });
    if (isConfirming) {
      if (match.type !== 'matched') {
        handleConfirmRetryOrCancel();
        return;
      }

      const intentCode = match.candidate.command.intentCode;
      // Khi confirming: chỉ chấp nhận YES/NO với confidence cao (≥ 0.9)
      // và input ngắn (≤ 4 từ) để tránh câu dài bị match nhầm
      const inputWordCount = cleaned.trim().split(/\s+/).length;
      const isHighConfirmSignal =
        (intentCode === 'CONFIRM_YES' || intentCode === 'CONFIRM_NO') &&
        match.candidate.confidence >= 0.9 &&
        inputWordCount <= 4;

      if (!isHighConfirmSignal) {
        handleConfirmRetryOrCancel();
        return;
      }
    }

    if (match.type === 'noMatch') {
      if (isLlmRescue) {
        feLog('hci-noMatch-isLlmRescue', { cleaned });
        addTranscript('system', `[LLM rescue lỗi] canonical phrase "${cleaned}" không match matcher`);
        return;
      }
      // Khi đang confirming, noMatch nghĩa là không phải YES/NO → nhắc lại, không gọi LLM
      if (isConfirming) {
        handleConfirmRetryOrCancel();
        return;
      }
      const rescued = await tryLlmRescue(cleaned);
      feLog('hci-rescued', { rescued });
      if (rescued) return;
      fallbackFor(cleaned, 'noMatch');
      return;
    }

    if (match.type === 'ambiguous') {
      const [first, second] = match.candidates;
      // Khi đang confirming, ambiguous cũng nhắc lại thay vì hỏi chọn
      if (isConfirming) {
        handleConfirmRetryOrCancel();
        return;
      }
      setAssistantState('fallback');
      setFallbackCount((count) => Math.min(count + 1, 2));
      const make = ambiguousChoiceReplies[Math.floor(Math.random() * ambiguousChoiceReplies.length)];
      addBotFeedback(make(first.phrase, second.phrase));
      return;
    }

    const action = resolveAction(
      match.candidate.command.intentCode,
      screenRef.current,
      isConfirming,
    );

    if (!action) {
      fallbackFor(cleaned, 'unsupported');
      return;
    }

    runResolvedAction(action, cleaned, false, source);
  }

  handleCommandRef.current = handleCommand;
  runResolvedActionRef.current = runResolvedAction;
  pickConfirmPromptRef.current = pickConfirmPrompt;

  function submitCommand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    handleCommand(inputValue);
    setInputValue('');
  }

  return (
    <main className="min-h-screen px-3 py-4 text-slate-900 sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 lg:grid lg:grid-cols-[420px_minmax(0,1fr)]">
        <section className="mx-auto w-full max-w-[393px]">
          <div className="relative h-[852px] overflow-hidden rounded-[32px] border border-white/80 bg-[#f1f1f1] shadow-2xl">
            <StatusBar />
            <div ref={scrollRef} className="phone-scroll h-full overflow-y-auto pb-28">
              <div
                key={transitionKey}
                className={
                  transitionDirection === 'forward' ? 'gt-screen-forward' : 'gt-screen-backward'
                }
              >
                <ScreenRenderer
                  screen={screen}
                  routeLabel={routeLabel}
                  radioPlaying={radioPlaying}
                  radioChannels={radioChannels}
                  radioChannelIndex={radioChannelIndex}
                  radioTopicIndex={radioTopicIndex}
                  fineLookupDone={fineLookupDone}
                  reportStatus={reportStatus}
                  focusedCard={focusedCard}
                  communityStatus={communityStatus}
                  toggles={toggles}
                  onBack={goBack}
                  onNavigate={(s) => navigate(s)}
                />
              </div>
            </div>
            <ActionToastStack toasts={toasts} />
            {radioPlaying && screen !== 'radio' && screen !== 'radioOnAir' && (
              <MiniRadioPlayer
                channelName={radioChannels[radioChannelIndex].name}
                onPause={() => handleCommand('tắt đài', 'chip')}
                onNext={() => handleCommand('chuyển kênh', 'chip')}
                onOpen={() => navigate('radio')}
              />
            )}
            <BottomNav
              screen={screen}
              pulseTab={pulseTab}
              onNavigate={(s) => navigate(s)}
              onAssistant={openAssistant}
            />
          </div>
        </section>

        <section className="min-h-[560px] rounded-2xl border border-white/70 bg-white/80 p-5 shadow-xl backdrop-blur">
          <div className="flex flex-col gap-5">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">
                GT365 Handfree MVP
              </p>
              <h1 className="mt-2 text-2xl font-bold text-slate-950">
                Command simulator
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                MVP chưa dùng hotword thật. Text input vẫn là fallback; nút mic sẽ gửi audio tới ASR bridge
                và bot feedback sẽ đọc qua TTS nếu backend voice đang chạy.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-4">
              <InfoTile label="Màn hiện tại" value={screenNames[screen]} />
              <InfoTile label="Trạng thái trợ lý" value={assistantState} />
              <InfoTile label="ASR" value={asrListening ? 'Đang nghe' : voiceError ? 'Lỗi' : 'Sẵn sàng'} />
              <InfoTile
                label="Pending confirm"
                value={pendingConfirmation ? pendingConfirmation.createdFrom : 'Không có'}
              />
            </div>

            <form onSubmit={submitCommand} className="rounded-xl border border-slate-200 bg-white p-3">
              <label className="text-sm font-semibold text-slate-700" htmlFor="command">
                Nhập lệnh giả lập ASR
              </label>
              <div className="mt-2 flex gap-2">
                <input
                  id="command"
                  value={inputValue}
                  onChange={(event) => setInputValue(event.target.value)}
                  placeholder="Ví dụ: Mở radio, Kiểm tra ngay, Báo kẹt xe..."
                  className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                />
                <button
                  type="submit"
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-sky-700 px-4 text-sm font-semibold text-white shadow-sm hover:bg-sky-800"
                >
                  <Mic size={18} />
                  Gửi
                </button>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={toggleVoiceListening}
                  className={[
                    'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold shadow-sm',
                    asrListening ? 'bg-red-600 text-white' : 'bg-sky-100 text-sky-800',
                  ].join(' ')}
                >
                  {asrListening ? <MicOff size={17} /> : <Mic size={17} />}
                  {asrListening ? 'Dừng nghe' : 'Mic ASR thật'}
                </button>
                <button
                  type="button"
                  onClick={toggleTts}
                  className={[
                    'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold shadow-sm',
                    ttsEnabled ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600',
                  ].join(' ')}
                >
                  <Speaker size={17} />
                  {ttsEnabled ? 'TTS bật' : 'TTS tắt'}
                </button>
                {speaking && <span className="text-sm font-semibold text-green-700">Đang đọc phản hồi...</span>}
                {asrInterim && <span className="text-sm text-slate-600">ASR: {asrInterim}</span>}
                {voiceError && <span className="text-sm font-semibold text-red-600">{voiceError}</span>}
              </div>
              {asrListening && (
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-sky-600 transition-all"
                    style={{ width: `${Math.max(8, audioLevel * 100)}%` }}
                  />
                </div>
              )}
            </form>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-800">Lệnh gợi ý theo màn</h2>
                <button
                  type="button"
                  onClick={openAssistant}
                  className="inline-flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-700"
                >
                  <Bot size={17} />
                  Mở trợ lý
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {commandHints.map((hint) => (
                  <button
                    key={hint}
                    type="button"
                    onClick={() => handleCommand(hint)}
                    className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:border-sky-300 hover:text-sky-700"
                  >
                    {hint}
                  </button>
                ))}
              </div>
            </div>

            <TranscriptPanel transcript={transcript} />

            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
              <p className="font-semibold">Happy-case samples</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {commandSamples.map((sample) => (
                  <button
                    key={sample}
                    type="button"
                    onClick={() => handleCommand(sample)}
                    className="rounded-lg bg-white px-3 py-2 font-medium text-amber-900 shadow-sm"
                  >
                    {sample}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>

      {assistantOpen && (
        <AssistantOverlay
          state={assistantState}
          pending={pendingConfirmation}
          hints={commandHints}
          listening={asrListening}
          interim={asrInterim}
          audioLevel={audioLevel}
          voiceError={voiceError}
          speaking={speaking}
          ttsEnabled={ttsEnabled}
          onClose={() => handleCommand('đóng trợ lý')}
          onCommand={handleCommand}
          onToggleMic={toggleVoiceListening}
          onToggleTts={toggleTts}
        />
      )}
    </main>
  );
}

function ScreenRenderer(props: {
  screen: ScreenId;
  routeLabel: string;
  radioPlaying: boolean;
  radioChannels: { id: string; name: string }[];
  radioChannelIndex: number;
  radioTopicIndex: number;
  fineLookupDone: boolean;
  reportStatus: string;
  focusedCard: string | null;
  communityStatus: string;
  toggles: Record<string, boolean>;
  onBack: () => void;
  onNavigate: (screen: ScreenId) => void;
}) {
  switch (props.screen) {
    case 'radio':
      return <RadioScreen {...props} />;
    case 'radioOnAir':
      return <RadioOnAirScreen {...props} />;
    case 'utilities':
      return <UtilitiesScreen {...props} />;
    case 'community':
      return <CommunityScreen {...props} />;
    case 'profile':
      return <ProfileScreen {...props} />;
    case 'notifications':
      return <NotificationsScreen {...props} />;
    case 'route':
      return <RouteScreen {...props} />;
    case 'fineLookup':
      return <FineLookupScreen {...props} />;
    case 'fineResult':
      return <FineResultScreen {...props} />;
    case 'insurance':
      return <InsuranceScreen {...props} />;
    case 'displaySettings':
      return <DisplaySettingsScreen {...props} />;
    case 'permissionSettings':
      return <PermissionSettingsScreen {...props} />;
    default:
      return <HomeScreen {...props} />;
  }
}

function StatusBar() {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex h-9 items-center justify-between px-6 pt-1 text-xs font-bold text-white">
      <span>9:41</span>
      <span className="flex items-center gap-1">
        <span className="h-2 w-4 rounded-sm border border-current" />
        <span className="h-2 w-2 rounded-full bg-current" />
      </span>
    </div>
  );
}

function Header(props: {
  title?: string;
  showBack?: boolean;
  onBack?: () => void;
  right?: ReactNode;
  dark?: boolean;
}) {
  return (
    <div
      className={[
        'relative min-h-[100px] px-5 pb-5 pt-11 text-white',
        props.dark === false
          ? 'bg-white text-slate-900'
          : 'bg-gradient-to-br from-[#005ca8] to-[#03445f]',
      ].join(' ')}
    >
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={props.onBack}
          className={[
            'grid h-9 w-9 place-items-center rounded-full',
            props.showBack ? 'visible' : 'invisible',
          ].join(' ')}
        >
          <ArrowLeft size={23} />
        </button>
        {props.title && <h2 className="text-center text-lg font-bold">{props.title}</h2>}
        <div className="h-9 min-w-9">{props.right}</div>
      </div>
    </div>
  );
}

function HomeScreen(props: Parameters<typeof ScreenRenderer>[0]) {
  return (
    <div>
      <div className="relative bg-gradient-to-br from-[#005ca8] to-[#03445f] px-5 pb-4 pt-12 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/assets/avatar.png" alt="" className="h-11 w-11 rounded-full object-cover" />
            <div>
              <p className="text-sm text-white/90">Xin chào</p>
              <p className="text-lg font-bold">Tài xế</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-green-600">
              Nâng cấp
            </button>
            <button className="grid h-9 w-9 place-items-center rounded-full bg-sky-600">
              <Bell size={18} />
            </button>
            <button className="grid h-9 w-9 place-items-center rounded-full bg-sky-600">
              <Settings size={18} />
            </button>
          </div>
        </div>
      </div>

      <section className="bg-[#6e9bc3] px-5 py-3">
        <div className="flex gap-2">
          <button className="flex min-w-0 flex-1 items-center gap-1 rounded-full bg-white px-3 py-2 text-xs font-semibold text-slate-700">
            <MapPin size={15} className="text-red-500" />
            <span className="truncate">Lộ trình: {props.routeLabel}</span>
            <X size={14} className="ml-auto text-slate-400" />
          </button>
          <button
            type="button"
            onClick={() => props.onNavigate('fineLookup')}
            className="rounded-full bg-orange-500 px-4 py-2 text-xs font-bold text-white"
          >
            Tra cứu phạt nguội
          </button>
        </div>
      </section>

      <section className="relative bg-gradient-to-b from-[#065684] to-[#03445f] px-5 pb-5">
        <div className="rounded-[20px] border-2 border-[#0a8cff] bg-gradient-to-br from-[#78bcff] to-[#3078c9] p-5 text-white shadow-xl">
          <div className="flex items-center gap-4">
            <div className="grid h-18 w-18 place-items-center rounded-full bg-sky-500 shadow-lg">
              <CircleGauge size={40} />
            </div>
            <div className="min-w-0">
              <p className="truncate text-base font-bold">Cao tốc Hà Nội - Lạng Sơn</p>
              <p className="mt-1 text-xs">78.5k người</p>
              <div className="mt-4 flex h-9 items-center gap-1">
                {Array.from({ length: 9 }).map((_, index) => (
                  <span
                    key={index}
                    className="w-1 rounded-full bg-white"
                    style={{ height: `${12 + Math.abs(4 - index) * 4}px` }}
                  />
                ))}
              </div>
            </div>
          </div>
          <button className="mt-5 inline-flex items-center gap-2 rounded-full bg-orange-500 px-5 py-3 text-sm font-bold">
            <Siren size={18} />
            Phản ánh điểm nóng giao thông
          </button>
        </div>
      </section>

      <section className="px-5 py-4">
        <div
          className={[
            'rounded-xl border-2 bg-white p-3 shadow-sm',
            props.focusedCard === 'drive-alert' ? 'border-orange-400' : 'border-sky-500',
          ].join(' ')}
        >
          <p className="mb-3 rounded-t-lg bg-red-50 p-2 text-center text-sm text-red-500">
            Chú ý, phía trước là điểm nóng vi phạm giao thông
          </p>
          <div className="grid grid-cols-3 items-center gap-3">
            <AlertCircle tone="red" icon={Siren} label="!" />
            <AlertCircle tone="blue" icon={Search} label="500m" />
            <div className="grid place-items-center">
              <div className="grid h-20 w-20 place-items-center rounded-full border-4 border-green-500 bg-white text-center shadow-md">
                <span className="text-3xl font-bold">45</span>
                <span className="-mt-4 text-[10px]">km/h</span>
              </div>
            </div>
          </div>
        </div>

        <SectionTitle icon={Radio} title="Nội dung số nổi bật" />
        {props.radioChannels.slice(0, 3).map((channel, index) => (
          <ContentRow
            key={channel.id}
            title={channel.name}
            sub="GT365 Radio"
            active={index === props.radioChannelIndex}
          />
        ))}

        <div className="mt-4 rounded-xl border border-sky-100 bg-white p-3 text-sm text-slate-600">
          <p className="font-semibold text-slate-800">Trạng thái phản ánh</p>
          <p className="mt-1">{props.reportStatus}</p>
        </div>
      </section>
    </div>
  );
}

function RadioScreen(props: Parameters<typeof ScreenRenderer>[0]) {
  const channels = props.radioChannels;
  const currentChannel = channels[props.radioChannelIndex] ?? channels[0];
  return (
    <div>
      <Header
        title="Nội dung số"
        showBack
        onBack={props.onBack}
        dark={false}
        right={
          <button className="rounded-full bg-sky-100 px-3 py-2 text-xs font-bold text-sky-700">
            Tạo Radio
          </button>
        }
      />
      <div className="px-5 py-4">
        <div className="mb-2 w-fit bg-orange-500 px-3 py-1 text-sm font-semibold text-white">
          Đề xuất cho bạn
        </div>
        <div className="rounded-[18px] bg-gradient-to-br from-[#52aaff] to-[#244996] p-5 text-white shadow-xl">
          <div className="flex justify-between">
            <span className="rounded-full bg-green-500 px-3 py-1 text-xs font-bold">12.4k người</span>
            <span className="rounded-full bg-red-500 px-3 py-1 text-xs font-bold">Trực tiếp</span>
          </div>
          <div className="my-6 grid place-items-center">
            <AudioWave />
            <h3 className="mt-5 text-center text-lg font-bold">
              {currentChannel?.name ?? 'Radio GT365'}
            </h3>
            <p className="text-sm text-white/85">Chủ đề: Kinh nghiệm lái xe đường đèo</p>
          </div>
          <div className="flex items-center justify-center gap-8">
            <button className="text-white">
              <ChevronRight className="rotate-180" size={30} />
            </button>
            <button className="grid h-16 w-16 place-items-center rounded-full bg-[#078cff] shadow-lg">
              {props.radioPlaying ? <Pause size={30} fill="white" /> : <Play size={30} fill="white" />}
            </button>
            <button className="text-white">
              <ChevronRight size={30} />
            </button>
          </div>
          <div className="mt-4 flex items-center gap-3 text-xs">
            <span>2:34</span>
            <div className="h-1 flex-1 rounded-full bg-white/70">
              <div className="h-1 w-1/2 rounded-full bg-sky-200" />
            </div>
            <span>LIVE</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => props.onNavigate('radioOnAir')}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-green-500 py-4 text-lg font-bold text-white shadow-lg"
        >
          <Mic size={24} />
          TRÒ CHUYỆN
        </button>
        {channels.length > 0 && (
          <>
            <SectionTitle title="Các kênh radio" />
            <div className="grid grid-cols-2 gap-3">
              {channels.map((channel, index) => (
                <div
                  key={channel.id}
                  className={`rounded-xl p-4 text-center text-sm font-bold shadow ${index === props.radioChannelIndex
                    ? 'bg-sky-500 text-white'
                    : 'bg-white text-sky-700'
                    }`}
                >
                  <div className="mx-auto mb-2 grid h-12 w-12 place-items-center rounded-full bg-sky-100 text-sky-500">
                    <Radio size={22} />
                  </div>
                  {channel.name}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function RadioOnAirScreen(props: Parameters<typeof ScreenRenderer>[0]) {
  return (
    <div>
      <Header
        title="Nội dung số"
        showBack
        onBack={props.onBack}
        dark={false}
        right={
          <button className="rounded-full bg-sky-100 px-3 py-2 text-xs font-bold text-sky-700">
            Tạo Radio
          </button>
        }
      />
      <div className="min-h-[720px] bg-neutral-300 px-5 py-16">
        <div className="rounded-xl bg-white p-8 text-center shadow-xl">
          <span className="rounded-full bg-green-500 px-5 py-2 text-sm font-bold text-white">
            BẠN ĐANG NÓI (ON AIR)
          </span>
          <div className="mt-7 flex items-center justify-center gap-4">
            <img src="/assets/avatar.png" alt="" className="h-14 w-14 rounded-full object-cover" />
            <div className="text-left">
              <p className="text-2xl font-bold">Thảo My</p>
              <p className="font-semibold text-slate-600">MC</p>
            </div>
          </div>
          <h3 className="mt-6 text-xl font-bold">Chuyện đêm muộn & Bác tài</h3>
          <div className="mt-8 grid place-items-center text-sky-700">
            <AudioWave />
            <p className="mt-5 text-3xl font-bold text-sky-600">00:15s</p>
            <p className="mt-1 text-sm text-slate-500">Thời gian phát biểu</p>
          </div>
          <div className="mt-8 flex justify-center gap-6">
            <RoundAction icon={props.toggles.microphone ? Mic : MicOff} tone="gray" />
            <RoundAction icon={MicOff} tone="red" />
            <RoundAction icon={Speaker} tone="blue" />
          </div>
        </div>
      </div>
    </div>
  );
}

function UtilitiesScreen(props: Parameters<typeof ScreenRenderer>[0]) {
  return (
    <div>
      <div
        className="bg-cover bg-center px-5 pb-5 pt-11 text-white"
        style={{ backgroundImage: 'linear-gradient(rgba(0,65,104,.74), rgba(0,65,104,.74)), url(/assets/road.png)' }}
      >
        <div className="flex items-center justify-between">
          <button onClick={props.onBack} className="grid h-9 w-9 place-items-center">
            <ArrowLeft size={24} />
          </button>
          <h2 className="text-lg font-bold">Tiện ích</h2>
          <div className="w-9" />
        </div>
        <div className="mt-4 flex items-center gap-2 rounded-full bg-white/90 px-3 py-3 text-slate-500">
          <span className="flex-1 text-sm">Tìm kiếm dịch vụ</span>
          <Search size={20} />
        </div>
      </div>
      <div className="space-y-3 py-3">
        <LoyaltyCard />
        <VehicleCard />
        <UtilityGroup
          title="Tiện ích Xe"
          items={[
            ['Định giá xe', Car],
            ['Bảo hiểm xe', Shield],
            ['Đăng ký Đăng kiểm', Check],
            ['Tra cứu phạt nguội', Search],
            ['Cứu hộ 24/7', Siren],
            ['Trạm xăng', Fuel],
          ]}
          hotIndexes={[1, 3]}
        />
        <UtilityGroup
          title="Dịch vụ Viễn thông"
          items={[
            ['Nạp tiền điện thoại', CircleDollarSign],
            ['Thẻ điện thoại', WalletCards],
            ['Data 4G/5G', Radio],
          ]}
        />
        <UtilityGroup
          title="Dịch vụ Tài chính"
          items={[
            ['Săn Vay', WalletCards],
            ['Chuyển tiền ngân hàng', CircleDollarSign],
          ]}
          hotIndexes={[0]}
        />
        <AdBanner />
      </div>
    </div>
  );
}

function FineLookupScreen(props: Parameters<typeof ScreenRenderer>[0]) {
  return (
    <div>
      <Header title="Tra cứu phạt nguội" showBack onBack={props.onBack} dark={false} />
      <div className="px-5 py-4">
        <p className="mb-3 font-semibold">Chọn xe cần kiểm tra</p>
        <div
          className={[
            'flex items-center justify-between rounded-xl border-2 bg-white px-8 py-8',
            props.focusedCard === 'vehicle-selector' ? 'border-orange-400' : 'border-sky-700',
          ].join(' ')}
        >
          <Car size={46} className="text-sky-700" />
          <span className="text-3xl font-bold">30H12345</span>
          <ChevronDown className="text-sky-700" />
        </div>
        <button className="mt-5 flex w-full items-center justify-center gap-3 rounded-full bg-gradient-to-r from-[#03445f] to-[#1d97dc] py-4 font-bold text-white shadow-lg">
          <Search size={20} />
          KIỂM TRA NGAY
        </button>
        <div className="mt-6 flex items-center justify-between">
          <p className="font-semibold">Kết quả tra cứu</p>
          <button className="inline-flex items-center gap-1 font-semibold text-sky-700">
            Xem tất cả <ChevronRight size={18} />
          </button>
        </div>
        <div className="mt-3 rounded-xl bg-white p-5 text-sm shadow-sm">
          <p>Thời điểm trả kết quả gần nhất:</p>
          <p className="mt-1 text-base">10:30 22/02/2026</p>
          <span
            className={[
              'mt-4 inline-flex items-center gap-2 rounded-full px-4 py-2 font-bold',
              props.fineLookupDone ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600',
            ].join(' ')}
          >
            <span className="h-2 w-2 rounded-full bg-current" />
            {props.fineLookupDone ? 'Có 1 lỗi chưa xử phạt' : 'Không có vi phạm'}
            <ChevronRight size={16} />
          </span>
        </div>
        <div
          className={[
            'mt-8 rounded-xl bg-sky-100 p-3',
            props.focusedCard === 'fine-subscribe' ? 'ring-2 ring-orange-400' : '',
          ].join(' ')}
        >
          <p className="font-bold">Đăng ký nhận thông báo phạt nguội qua Zalo</p>
          <div className="mt-3 rounded-lg bg-white p-4 text-sm leading-7">
            <p className="text-green-600">✓ Tự động thông báo khi có lỗi phạt</p>
            <p className="text-green-600">✓ Tự động tra cứu trạng thái phạt nguội</p>
            <button className="mt-3 w-full rounded-lg bg-sky-200 py-3 font-bold text-sky-700">
              Đăng ký ngay
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FineResultScreen(props: Parameters<typeof ScreenRenderer>[0]) {
  return (
    <div>
      <Header title="Thông tin lỗi vi phạm" showBack onBack={props.onBack} dark={false} />
      <div className="px-5 py-9">
        <div className="overflow-hidden rounded-xl bg-white shadow-lg">
          <div className="h-4 bg-red-500" />
          <div className="p-5 text-center">
            <div className="flex items-center justify-center gap-4 text-red-500">
              <Siren size={42} />
              <h2 className="text-2xl font-bold">Có vi phạm</h2>
            </div>
            <div className="mt-5 rounded-xl bg-slate-100 p-4">
              <p className="font-semibold">Biển số xe</p>
              <p className="mt-2 text-3xl font-bold">30H12345</p>
              <p>Ô tô con</p>
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-xl bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold">Chi tiết lỗi</h3>
            <span className="rounded-full bg-red-500 px-4 py-2 text-sm font-bold text-white">
              CHƯA XỬ PHẠT
            </span>
          </div>
          <ViolationLine icon={Siren} label="Lỗi vi phạm" value="Chạy quá tốc độ quy định 10 - 20km/h" />
          <ViolationLine icon={Clock3} label="Thời gian" value="14:40 - 15/01/2026" />
          <ViolationLine icon={MapPin} label="Địa điểm" value="Km 188+300, Cao tốc Pháp Vân - Cầu Giẽ" />
          <ViolationLine icon={Shield} label="Đơn vị xử lý" value="Đội TTKS GTĐB cao tốc số 3" />
          <button
            className={[
              'mt-7 flex w-full items-center justify-center gap-2 rounded-full py-4 font-bold text-white',
              props.focusedCard === 'payment-guide'
                ? 'bg-orange-500'
                : 'bg-gradient-to-r from-[#03445f] to-[#1d97dc]',
            ].join(' ')}
          >
            <WalletCards />
            Hướng dẫn nộp phạt
          </button>
        </div>
      </div>
    </div>
  );
}

function CommunityScreen(props: Parameters<typeof ScreenRenderer>[0]) {
  const groups = [
    ['Hội xe tải Tây Bắc', '12.3K thành viên', 'Tham gia'],
    ['Hội xe du lịch Lào Cai - Sapa', '12.3K thành viên', 'Tham gia'],
    ['Hội xe du lịch Ninh Bình', '12.3K thành viên', 'Vào kênh'],
    ['Hội xe khách đường dài Bắc Nam', '12.3K thành viên', 'Vào kênh'],
  ];
  return (
    <div>
      <Header title="Cộng đồng" showBack onBack={props.onBack} />
      <div className="-mt-2 bg-[#03445f] px-5 pb-6">
        <div className="flex items-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-semibold text-slate-700">
          <MapPin size={15} className="text-red-500" />
          Lộ trình: Hà Nội → Lạng Sơn
        </div>
      </div>
      <div className="px-5 py-5">
        <p className="font-bold">Gợi ý nổi theo lộ trình của bạn</p>
        <div className="mt-3 space-y-3">
          {groups.map((group, index) => (
            <div
              key={group[0]}
              className={[
                'flex items-center gap-3 rounded-xl bg-white p-4 shadow',
                index > 1 ? 'bg-sky-50' : '',
              ].join(' ')}
            >
              <div className="grid h-12 w-12 place-items-center rounded-lg bg-sky-50 text-sky-700">
                <Car />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold">{group[0]}</p>
                <p className="text-sm text-slate-600">{group[1]}</p>
                <p className="text-sm text-green-600">{index === 3 ? '54' : '38'} Online</p>
              </div>
              <button className="rounded-full bg-green-500 px-4 py-2 text-sm font-bold text-white">
                {group[2]}
              </button>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-xl border border-green-100 bg-white p-4 text-sm text-slate-700">
          <p className="font-bold text-slate-900">Trạng thái</p>
          <p className="mt-1">{props.communityStatus}</p>
        </div>
      </div>
    </div>
  );
}

function ProfileScreen(props: Parameters<typeof ScreenRenderer>[0]) {
  return (
    <div>
      <Header title="Profile" showBack onBack={props.onBack} />
      <div className="px-5">
        <div className="-mt-2 rounded-xl border border-sky-300 bg-gradient-to-r from-[#79a9c9] to-white p-4 shadow-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src="/assets/avatar.png" alt="" className="h-16 w-16 rounded-full object-cover" />
              <div>
                <p className="text-xl font-bold text-white">Nguyễn Phương Nam</p>
                <p className="text-white">096357****</p>
              </div>
            </div>
            <SquarePen className="text-white" />
          </div>
          <div className="mt-6 grid grid-cols-2 gap-4">
            <button className="rounded-lg bg-gradient-to-r from-[#005db7] to-[#45b7ff] py-4 font-bold text-white shadow-lg">
              Gói cơ bản
            </button>
            <button className="rounded-lg border border-slate-500 bg-white py-4 font-bold">
              Quản lý phương tiện
            </button>
          </div>
        </div>
        <p className="mt-5 font-semibold">Cài đặt tài khoản</p>
        <div className="mt-3 divide-y divide-slate-100 bg-white">
          <SettingsRow icon={Lock} label="Bảo mật (Đổi mật khẩu)" />
          <SettingsRow icon={Bell} label="Thông báo & Hiển thị" />
          <SettingsRow icon={Menu} label="Quản lý quyền truy cập" />
          <SettingsRow icon={Compass} label="Hướng dẫn sử dụng" />
          <SettingsRow icon={Shield} label="Điều khoản quyền riêng tư" />
        </div>
        <button className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-slate-200 py-3 font-bold text-sky-700">
          <ArrowLeft size={18} />
          Đăng xuất
        </button>
        <AdBanner />
      </div>
    </div>
  );
}

function NotificationsScreen(props: Parameters<typeof ScreenRenderer>[0]) {
  return (
    <div>
      <Header title="Thông báo" showBack onBack={props.onBack} />
      <div className="grid min-h-[640px] place-items-center px-5 text-center text-slate-700">
        <div>
          <Bell className="mx-auto mb-4 text-sky-700" size={44} />
          <p className="font-semibold">Hiện chưa có thông báo nào</p>
        </div>
      </div>
    </div>
  );
}

function RouteScreen(props: Parameters<typeof ScreenRenderer>[0]) {
  return (
    <div>
      <Header title="Lộ trình" showBack onBack={props.onBack} dark={false} />
      <div className="px-5 py-5">
        <InputLike icon={MapPin} placeholder="Điểm đi" value={props.routeLabel.includes('→') ? 'Hà Nội' : ''} />
        <InputLike icon={MapPin} placeholder="Điểm đến" value={props.routeLabel.includes('→') ? 'Lạng Sơn' : ''} />
        <button className="mx-auto mt-8 flex items-center gap-2 rounded-full bg-slate-300 px-4 py-2 font-semibold text-slate-700">
          <Check size={16} />
          Thêm
        </button>
      </div>
    </div>
  );
}

function InsuranceScreen(props: Parameters<typeof ScreenRenderer>[0]) {
  return (
    <div>
      <Header title="Bảo hiểm của chủ xe ô tô" showBack onBack={props.onBack} />
      <div className="px-5 py-4">
        <div className="mb-4 flex items-center rounded-lg bg-white px-3 py-3 text-slate-500">
          <Search size={20} />
          <span className="ml-2">Tìm kiếm</span>
        </div>
        <div className="rounded-xl bg-sky-700 p-4 text-white">
          <p className="text-lg font-bold">Bảo hiểm bắt buộc TNDS của chủ xe ô tô</p>
          <p className="mt-2 text-sm leading-6">
            Đăng ký online nhanh, cấp giấy chứng nhận điện tử qua email.
          </p>
          <button className="mt-3 rounded-full bg-white px-5 py-2 font-bold text-sky-700">Bảo vệ ngay</button>
        </div>
        <p className="mt-5 font-bold">Sản phẩm bảo hiểm</p>
        <InsuranceItem
          focused={props.focusedCard === 'insurance-tnds' || props.focusedCard === 'insurance-buy'}
          title="Bảo hiểm bắt buộc TNDS của chủ xe ô tô"
          price="40.000đ/tháng"
          icon={Shield}
        />
        <InsuranceItem
          focused={props.focusedCard === 'insurance-physical'}
          title="Bảo hiểm Vật chất xe ô tô"
          price="240.000đ/tháng"
          icon={Car}
        />
      </div>
    </div>
  );
}

function DisplaySettingsScreen(props: Parameters<typeof ScreenRenderer>[0]) {
  return (
    <div>
      <Header title="Thông báo & Hiển thị" showBack onBack={props.onBack} />
      <div className="space-y-3 px-5 py-5">
        <ToggleRow icon={Bell} label="Nhận thông báo trên thiết bị" active={props.toggles.deviceNotification} />
        <ToggleRow icon={CircleGauge} label="Cảnh báo tốc độ" active={props.toggles.speedAlert} />
        <ToggleRow
          icon={Search}
          label="Cảnh báo điểm nóng vi phạm giao thông được phát hiện qua thiết bị giám sát"
          active={props.toggles.hotspotAlert}
          note="Khoảng cách đọc cảnh báo"
        />
      </div>
    </div>
  );
}

function PermissionSettingsScreen(props: Parameters<typeof ScreenRenderer>[0]) {
  return (
    <div>
      <Header title="Quản lý quyền truy cập" showBack onBack={props.onBack} />
      <div className="space-y-3 px-5 py-5">
        <ToggleRow icon={MapPin} label="Vị trí" active={props.toggles.location} />
        <ToggleRow icon={Search} label="Camera" active={props.toggles.camera} />
        <ToggleRow icon={Mic} label="Microphone" active={props.toggles.microphone} />
        <ToggleRow icon={Compass} label="Thư viện ảnh" active={props.toggles.gallery} />
      </div>
    </div>
  );
}

function BottomNav(props: {
  screen: ScreenId;
  pulseTab: ScreenId | null;
  onNavigate: (screen: ScreenId) => void;
  onAssistant: () => void;
}) {
  return (
    <div className="absolute inset-x-0 bottom-0 z-20 rounded-t-[28px] bg-white/95 px-5 pb-5 pt-3 shadow-[0_-10px_24px_rgba(15,23,42,0.13)]">
      <div className="grid grid-cols-[1fr_1fr_88px_1fr_1fr] items-end">
        {tabItems.slice(0, 2).map((item) => (
          <NavItem
            key={item.id}
            {...item}
            active={props.screen === item.id}
            pulse={props.pulseTab === item.id}
            onClick={props.onNavigate}
          />
        ))}
        <button
          type="button"
          onClick={props.onAssistant}
          className="mx-auto -mt-12 grid h-[76px] w-[76px] place-items-center rounded-full border-[6px] border-sky-100 bg-[#00447e] text-white shadow-xl"
        >
          <Bot size={38} />
        </button>
        {tabItems.slice(2).map((item) => (
          <NavItem
            key={item.id}
            {...item}
            active={props.screen === item.id}
            pulse={props.pulseTab === item.id}
            onClick={props.onNavigate}
          />
        ))}
      </div>
      <div className="mx-auto mt-2 h-1 w-32 rounded-full bg-black" />
    </div>
  );
}

function NavItem(props: {
  id: ScreenId;
  label: string;
  icon: LucideIcon;
  active: boolean;
  pulse?: boolean;
  onClick: (screen: ScreenId) => void;
}) {
  const Icon = props.icon;
  return (
    <button
      type="button"
      onClick={() => props.onClick(props.id)}
      className={['grid justify-items-center gap-1 text-xs font-semibold', props.active ? 'text-sky-700' : 'text-slate-500'].join(' ')}
    >
      <span className={['inline-grid', props.pulse ? 'gt-tab-pulse' : ''].join(' ')}>
        <Icon size={22} />
      </span>
      <span>{props.label}</span>
    </button>
  );
}

function ActionToastStack({ toasts }: { toasts: ActionToast[] }) {
  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-28 z-30 flex flex-col items-center gap-2 px-4">
      {toasts.map((toast) => {
        const Icon = toast.icon;
        const toneClass =
          toast.tone === 'warn'
            ? 'bg-amber-500 text-white'
            : toast.tone === 'info'
              ? 'bg-slate-800 text-white'
              : 'bg-sky-700 text-white';
        return (
          <div
            key={toast.id}
            className={[
              'gt-toast-pop pointer-events-auto inline-flex max-w-[88%] items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold shadow-lg',
              toneClass,
            ].join(' ')}
          >
            <Icon size={16} />
            <span className="truncate">{toast.text}</span>
          </div>
        );
      })}
    </div>
  );
}

function MiniRadioPlayer(props: {
  channelName: string;
  onPause: () => void;
  onNext: () => void;
  onOpen: () => void;
}) {
  return (
    <div className="absolute inset-x-3 bottom-[96px] z-20 gt-mini-slide">
      <div className="flex items-center gap-2 rounded-full bg-slate-900/95 px-3 py-2 text-white shadow-lg">
        <button
          type="button"
          onClick={props.onOpen}
          className="grid h-9 w-9 place-items-center rounded-full bg-sky-600"
        >
          <Radio size={17} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-wider text-white/60">Đang phát</p>
          <p className="truncate text-sm font-semibold">{props.channelName}</p>
        </div>
        <button
          type="button"
          onClick={props.onPause}
          className="grid h-8 w-8 place-items-center rounded-full bg-white/15"
          aria-label="Tắt đài"
        >
          <Pause size={15} />
        </button>
        <button
          type="button"
          onClick={props.onNext}
          className="grid h-8 w-8 place-items-center rounded-full bg-white/15"
          aria-label="Chuyển kênh"
        >
          <SkipForward size={15} />
        </button>
      </div>
    </div>
  );
}

function AssistantOverlay(props: {
  state: AssistantState;
  pending: PendingConfirmation | null;
  hints: string[];
  listening: boolean;
  interim: string;
  audioLevel: number;
  voiceError: string;
  speaking: boolean;
  ttsEnabled: boolean;
  onClose: () => void;
  onCommand: (command: string) => void;
  onToggleMic: () => void;
  onToggleTts: () => void;
}) {
  return (
    <div className="fixed bottom-5 left-1/2 z-50 w-[min(620px,calc(100vw-24px))] -translate-x-1/2 rounded-2xl border border-sky-200 bg-white p-4 shadow-2xl">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-full bg-sky-700 text-white">
            <Bot />
          </div>
          <div>
            <p className="font-bold">GT365 Assistant</p>
            <p className="text-sm text-slate-500">
              {props.pending
                ? 'Đang chờ xác nhận'
                : props.listening
                  ? 'Đang nghe qua ASR'
                  : props.speaking
                    ? 'Đang đọc phản hồi'
                    : props.state === 'fallback'
                      ? 'Cần nói lại lệnh'
                      : 'Sẵn sàng nhận lệnh'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={props.onToggleTts}
            className={[
              'grid h-9 w-9 place-items-center rounded-full',
              props.ttsEnabled ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500',
            ].join(' ')}
            title={props.ttsEnabled ? 'Tắt TTS' : 'Bật TTS'}
          >
            <Speaker size={18} />
          </button>
          <button
            type="button"
            onClick={props.onClose}
            className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-slate-600"
          >
            <X size={18} />
          </button>
        </div>
      </div>
      {props.pending ? (
        /* ── Voice-confirm UI ── */
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-3">
            <div className="relative grid h-12 w-12 shrink-0 place-items-center">
              {props.listening && (
                <>
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-40" />
                  <span className="absolute inline-flex h-10 w-10 animate-ping rounded-full bg-amber-300 opacity-30 [animation-delay:150ms]" />
                </>
              )}
              <div
                className={[
                  'relative grid h-12 w-12 place-items-center rounded-full text-white shadow-sm transition-colors',
                  props.listening ? 'bg-amber-500' : 'bg-amber-400',
                ].join(' ')}
              >
                <Mic size={22} />
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-amber-900">
                {props.listening ? 'Đang nghe...' : 'Chờ xác nhận bằng giọng nói'}
              </p>
              <p className="truncate text-sm text-amber-700">
                {props.interim || 'Nói "đồng ý" để tiếp tục hoặc "hủy" để bỏ qua'}
              </p>
            </div>
          </div>
          {props.listening && (
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-amber-100">
              <div
                className="h-full rounded-full bg-amber-500 transition-all"
                style={{ width: `${Math.max(8, props.audioLevel * 100)}%` }}
              />
            </div>
          )}
          <div className="mt-3 flex gap-2">
            <span className="rounded-full border border-amber-300 bg-white px-3 py-1.5 text-sm font-semibold text-amber-800">
              Đồng ý
            </span>
            <span className="rounded-full border border-amber-300 bg-white px-3 py-1.5 text-sm font-semibold text-amber-800">
              Hủy
            </span>
          </div>
        </div>
      ) : (
        /* ── Normal mic UI ── */
        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={props.onToggleMic}
              className={[
                'grid h-12 w-12 place-items-center rounded-full text-white shadow-sm',
                props.listening ? 'bg-red-600' : 'bg-sky-700',
              ].join(' ')}
            >
              {props.listening ? <MicOff size={22} /> : <Mic size={22} />}
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-800">
                {props.listening ? 'Đang nghe, nói một lệnh ngắn...' : 'Bấm mic để nói lệnh thật'}
              </p>
              <p className="truncate text-sm text-slate-500">
                {props.interim || props.voiceError || 'Ví dụ: Mở radio, Tra cứu phạt nguội, Báo kẹt xe'}
              </p>
            </div>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
            <div
              className={['h-full rounded-full transition-all', props.listening ? 'bg-sky-600' : 'bg-slate-300'].join(' ')}
              style={{ width: props.listening ? `${Math.max(8, props.audioLevel * 100)}%` : '8%' }}
            />
          </div>
        </div>
      )}
      {!props.pending && (
        <div className="mt-3 flex flex-wrap gap-2">
          {props.hints.slice(0, 5).map((hint) => (
            <button
              key={hint}
              type="button"
              onClick={() => props.onCommand(hint)}
              className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700"
            >
              {hint}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TranscriptPanel({ transcript }: { transcript: TranscriptEntry[] }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-bold text-slate-800">Transcript</h2>
      <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
        {transcript.map((entry) => (
          <div
            key={entry.id}
            className={[
              'rounded-lg px-3 py-2 text-sm leading-5',
              entry.speaker === 'user'
                ? 'ml-8 bg-sky-600 text-white'
                : entry.speaker === 'bot'
                  ? 'mr-8 bg-slate-100 text-slate-800'
                  : 'bg-amber-50 text-amber-900',
            ].join(' ')}
          >
            <span className="mb-1 block text-[11px] font-bold uppercase opacity-70">
              {entry.speaker}
            </span>
            {entry.text}
          </div>
        ))}
      </div>
    </div>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-2 truncate text-sm font-bold text-slate-900">{value}</p>
    </div>
  );
}

function SectionTitle({ title, icon: Icon }: { title: string; icon?: LucideIcon }) {
  return (
    <div className="mt-5 flex items-center gap-2 rounded-t-xl bg-sky-100 px-2 py-3 font-bold text-sky-700">
      {Icon && <Icon size={20} />}
      {title}
    </div>
  );
}

function ContentRow({ title, sub, active }: { title: string; sub: string; active?: boolean }) {
  return (
    <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-2 py-3">
      <div className="grid h-12 w-12 place-items-center rounded-lg bg-sky-700 text-white">
        <Radio size={22} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-bold">{title}</p>
        <p className="text-sm">
          {sub} <span className="text-green-600">● 56 người nghe</span>
        </p>
      </div>
      <button className="inline-flex items-center gap-1 rounded-full bg-green-500 px-4 py-2 text-sm font-bold text-white">
        {active ? <Play size={15} fill="white" /> : <Pause size={15} />}
        Nghe
      </button>
    </div>
  );
}

function AlertCircle({ icon: Icon, label, tone }: { icon: LucideIcon; label: string; tone: 'red' | 'blue' }) {
  return (
    <div className="grid place-items-center">
      <div
        className={[
          'grid h-20 w-20 place-items-center rounded-full border-4 bg-white shadow-md',
          tone === 'red' ? 'border-red-500 text-red-500' : 'border-sky-500 text-sky-700',
        ].join(' ')}
      >
        <Icon size={30} />
      </div>
      {label !== '!' && <span className="-mt-3 rounded border border-red-500 bg-white px-4 text-red-600">{label}</span>}
    </div>
  );
}

function AudioWave() {
  return (
    <div className="flex h-16 items-center justify-center gap-1">
      {Array.from({ length: 11 }).map((_, index) => (
        <span
          key={index}
          className="w-2 rounded-full bg-current"
          style={{ height: `${16 + (5 - Math.abs(5 - index)) * 8}px` }}
        />
      ))}
    </div>
  );
}

function RoundAction({ icon: Icon, tone }: { icon: LucideIcon; tone: 'gray' | 'red' | 'blue' }) {
  const toneClass =
    tone === 'red' ? 'bg-red-600' : tone === 'blue' ? 'bg-sky-700' : 'bg-slate-400';
  return (
    <button className={`grid h-16 w-16 place-items-center rounded-full ${toneClass} text-white shadow-lg`}>
      <Icon size={30} />
    </button>
  );
}

function LoyaltyCard() {
  return (
    <div className="mx-5 overflow-hidden rounded-xl bg-white shadow">
      <div className="bg-gradient-to-r from-[#006ed3] to-[#68b8ff] p-4 text-white">
        <p className="font-bold">Điểm tích lũy</p>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-5xl font-bold">10.000</span>
          <button className="rounded-full bg-green-500 px-5 py-2 font-bold">Đổi quà</button>
        </div>
      </div>
      <div className="flex items-center justify-between p-3 text-sky-700">
        <span>Hạn mức khả dụng:</span>
        <strong>đ 10.000.000</strong>
      </div>
    </div>
  );
}

function VehicleCard() {
  return (
    <div className="mx-5 rounded-xl bg-gradient-to-r from-[#005fb0] to-[#31b5ff] p-4 text-white shadow">
      <div className="flex items-center gap-3">
        <div className="grid h-12 w-12 place-items-center rounded-lg bg-white text-sky-700">
          <Car />
        </div>
        <div className="flex-1">
          <p className="text-lg font-bold">30H - 123.45</p>
          <button className="mt-3 rounded-full bg-orange-500 px-5 py-2 text-sm font-bold">Bật thông báo</button>
        </div>
        <div className="text-right text-xs leading-7">
          <p>Hạn đăng kiểm 0 ngày</p>
          <p>Hạn bảo hiểm TNDS 0 ngày</p>
        </div>
      </div>
    </div>
  );
}

function UtilityGroup({
  title,
  items,
  hotIndexes = [],
}: {
  title: string;
  items: Array<[string, LucideIcon]>;
  hotIndexes?: number[];
}) {
  return (
    <div className="bg-white px-5 py-4">
      <p className="mb-3 font-bold">{title}</p>
      <div className="grid grid-cols-4 gap-4">
        {items.map(([label, Icon], index) => (
          <div key={label} className="relative rounded-lg bg-white p-3 text-center text-[11px] shadow">
            {hotIndexes.includes(index) && (
              <span className="absolute -right-1 -top-1 rounded bg-red-500 px-1.5 py-0.5 text-[9px] font-bold text-white">
                Hot
              </span>
            )}
            <Icon className="mx-auto mb-2 text-sky-700" size={26} />
            <span>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AdBanner() {
  return (
    <div className="mt-5 overflow-hidden rounded-xl bg-white shadow">
      <div className="flex min-h-28 items-center bg-red-600 text-white">
        <img src="/assets/logo-gt365.png" alt="" className="ml-4 h-16 w-16 object-contain" />
        <div className="p-4">
          <p className="text-lg font-bold">TỔNG ĐẠI LÝ</p>
          <p className="text-sm">Bảo hiểm trách nhiệm dân sự ô tô</p>
        </div>
      </div>
    </div>
  );
}

function ViolationLine({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="mt-5">
      <p className="flex items-center gap-2 text-sm text-slate-500">
        <Icon size={18} className="text-sky-600" />
        {label}
      </p>
      <p className="mt-2 font-bold leading-6">{value}</p>
    </div>
  );
}

function SettingsRow({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-4 text-sky-700">
      <Icon size={20} />
      <span className="font-semibold">{label}</span>
    </div>
  );
}

function InputLike({ icon: Icon, placeholder, value }: { icon: LucideIcon; placeholder: string; value?: string }) {
  return (
    <div className="mb-3 flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-3 text-sm text-slate-500">
      <Icon size={16} className="text-red-500" />
      <span>{value || placeholder}</span>
    </div>
  );
}

function InsuranceItem({
  focused,
  title,
  price,
  icon: Icon,
}: {
  focused: boolean;
  title: string;
  price: string;
  icon: LucideIcon;
}) {
  return (
    <div className={['mt-4 rounded-xl bg-white p-4 shadow', focused ? 'ring-2 ring-orange-400' : 'ring-1 ring-sky-600'].join(' ')}>
      <div className="flex gap-4">
        <Icon size={46} className="text-sky-700" />
        <div className="min-w-0 flex-1">
          <p className="font-bold">{title}</p>
          <div className="mt-2 flex flex-wrap gap-1 text-[11px]">
            <span className="bg-slate-200 px-2">Bắt buộc khi tham gia giao thông</span>
            <span className="bg-slate-200 px-2">Chi trả thiệt hại</span>
          </div>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between border-t pt-3 text-sm">
        <button className="font-semibold text-sky-700">Xem chi tiết</button>
        <p>
          Giá chỉ từ <strong className="block text-lg text-green-600">{price}</strong>
        </p>
      </div>
    </div>
  );
}

function ToggleRow({
  icon: Icon,
  label,
  active,
  note,
}: {
  icon: LucideIcon;
  label: string;
  active: boolean;
  note?: string;
}) {
  return (
    <div className="rounded-lg bg-white p-4">
      <div className="flex items-center gap-3">
        <Icon className="text-sky-700" size={19} />
        <span className="min-w-0 flex-1 font-semibold">{label}</span>
        <span className={['flex h-6 w-10 items-center rounded-full p-0.5', active ? 'bg-sky-200' : 'bg-slate-300'].join(' ')}>
          <span className={['h-5 w-5 rounded-full', active ? 'ml-auto bg-sky-700' : 'bg-slate-500'].join(' ')} />
        </span>
      </div>
      {note && <p className="mt-3 pl-8 text-sm text-slate-500">{note}</p>}
    </div>
  );
}

export default App;
