import { commands } from './commands.js';
import { normalizeVietnamese, stripTrailingFillers, tokenOverlapScore } from './normalizer.js';
import type { AssistantState, CommandCandidate, MatchResult, ScreenId } from './types.js';

// Các từ khóa chỉ rõ ý người dùng muốn chọn kênh cụ thể (không chỉ mở màn radio)
const RADIO_CHANNEL_KEYWORDS = ['kenh', 'chuyen muc', 'channel', 'chuyen sang', 'doi sang', 'doi kenh', 'chuyen kenh'];

// Các từ khóa chỉ rõ ý hỏi danh sách kênh (không phải chọn kênh cụ thể)
const LIST_CHANNEL_KEYWORDS = [
  'danh sach', 'liet ke', 'ke ten', 'co nhung', 'co may', 'co gi', 'co san',
  'xem danh sach', 'list', 'bao nhieu kenh', 'co bao nhieu', 'nen nghe',
  'nghe kenh nao', 'gioi thieu kenh', 'co kenh gi', 'radio co gi',
  'dang phat', 'dang co', 'hom nay co', 'co gi nghe',
];

// Các từ khóa chỉ rõ ý chuyển kênh next/prev (không phải mở kênh theo tên)
const CHANNEL_NAV_KEYWORDS = [
  'tiep theo', 'ke tiep', 'tiep', 'truoc', 'lui lai', 'next', 'prev', 'previous', 'luc nay',
  'doi kenh', 'doi di', 'kenh khac', 'kenh cu', 'vua roi', 'skip', 'back', 'lui',
  'doi sang kenh khac', 'bat kenh khac', 'nghe kenh khac',
];

function hasChannelKeyword(normalized: string): boolean {
  return RADIO_CHANNEL_KEYWORDS.some((kw) => normalized.includes(kw));
}

function hasListKeyword(normalized: string): boolean {
  return LIST_CHANNEL_KEYWORDS.some((kw) => normalized.includes(kw));
}

function hasChannelNavKeyword(normalized: string): boolean {
  return CHANNEL_NAV_KEYWORDS.some((kw) => normalized.includes(kw));
}
function screenAllowed(
  allowedScreens: (ScreenId[] | 'all' | 'confirming'),
  screen: ScreenId,
  assistantState: AssistantState,
) {
  if (assistantState === 'confirming') {
    // Khi đang confirming chỉ nhận đúng commands confirming, không nhận 'all'
    return allowedScreens === 'confirming';
  }
  if (allowedScreens === 'all') return true;
  if (allowedScreens === 'confirming') return false;
  return allowedScreens.includes(screen);
}

export function matchTranscript(
  transcript: string,
  screen: ScreenId,
  assistantState: AssistantState,
): MatchResult {
  const normalized = stripTrailingFillers(normalizeVietnamese(transcript));

  if (normalized.length < 2) {
    return { type: 'noMatch' };
  }

  const candidates: CommandCandidate[] = [];

  for (const command of commands) {
    if (!screenAllowed(command.allowedScreens, screen, assistantState)) {
      continue;
    }


    // Nếu input hỏi danh sách kênh ("danh sách kênh", "liệt kê kênh"...)
    // thì bỏ qua RADIO_PLAY_BY_NAME để tránh match nhầm → RADIO_LIST_CHANNELS
    if (command.intentCode === 'RADIO_PLAY_BY_NAME' && hasListKeyword(normalized)) {
      continue;
    }

    for (const phrase of command.phrases) {
      const normalizedPhrase = normalizeVietnamese(phrase);
      let confidence = 0;

      if (normalized === normalizedPhrase) {
        confidence = 1;
      } else if (
        normalized.length >= 5 &&
        (normalized.includes(normalizedPhrase) || normalizedPhrase.includes(normalized))
      ) {
        // Substring match: chỉ dùng nếu phrase đủ dài (≥ 4 ký tự) để tránh false positive
        // với các phrase 1 từ ngắn như "ừ", "có", "phải"
        if (normalizedPhrase.split(' ').length >= 2 || normalizedPhrase.length >= 4) {
          confidence = 0.82;
        }
      } else {
        const overlap = tokenOverlapScore(normalized, normalizedPhrase);
        const phraseTokenCount = normalizedPhrase.split(' ').length;
        const inputTokenCount = normalized.split(' ').length;

        // Special handling cho RADIO_PLAY_BY_NAME: cho phép match partial
        // Ví dụ: "mở cho tôi kênh tán dóc" khớp với phrase "mở kênh" hoặc "kênh"
        // Hoặc: "chuyển sang tin thể thao" khớp với "chuyển sang tin"
        if (command.intentCode === 'RADIO_PLAY_BY_NAME') {
          // Nếu phrase là từ khóa đơn hoặc cụm từ và input có từ đó → match cao
          if ((normalizedPhrase === 'kenh' || normalizedPhrase === 'chuyen muc' || normalizedPhrase === 'channel' || normalizedPhrase === 'chuyen sang tin')
            && (normalized.includes('kenh') || normalized.includes('chuyen muc') || normalized.includes('channel') || normalized.includes('chuyen sang tin'))) {
            confidence = 0.88; // Match rất cao để ưu tiên
          }
          // Nếu input chứa ít nhất 50% từ trong phrase và có từ khóa liên quan
          else if (overlap >= 0.5 && (normalized.includes('kenh') || normalized.includes('chuyen muc') || normalized.includes('channel') || normalized.includes('chuyen sang') || normalized.includes('doi sang'))) {
            confidence = 0.78 + (overlap * 0.08); // 0.78 - 0.86
          }
        } else {
          // Logic cũ cho các intent khác
          // Với phrase 1 token, chỉ match nếu input cũng ngắn (≤ 3 từ)
          // tránh "được tiện ích cho tôi" khớp phrase "được/có/ừ"
          if (overlap >= 0.8 && inputTokenCount >= 2) {
            if (phraseTokenCount === 1 && inputTokenCount > 3) {
              confidence = 0; // bỏ qua — input quá dài so với phrase 1 từ
            } else {
              confidence = 0.72;
            }
          }
        }
      }

      if (confidence > 0) {
        const priorityBoost = (command.priority ?? 0) / 100;
        candidates.push({
          command,
          confidence: confidence + priorityBoost,
          phrase,
        });
      }
    }
  }

  const ranked = candidates.sort((a, b) => b.confidence - a.confidence);
  const top = ranked[0];

  if (!top || top.confidence < 0.65) {
    return { type: 'noMatch' };
  }

  const competing = ranked.find(
    (candidate) =>
      candidate.command.intentCode !== top.command.intentCode &&
      top.confidence - candidate.confidence < 0.08,
  );

  if (competing && top.confidence < 0.98) {
    return { type: 'ambiguous', candidates: [top, competing] };
  }

  return { type: 'matched', candidate: top };
}
