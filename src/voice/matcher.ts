import { commands } from './commands';
import { normalizeVietnamese, stripTrailingFillers, tokenOverlapScore } from './normalizer';
import type { AssistantState, CommandCandidate, MatchResult, ScreenId } from './types';

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
  const hasListSignal =
    normalized.includes('liet ke')
    || normalized.includes('danh sach')
    || normalized.includes('co nhung')
    || normalized.includes('ke ten')
    || normalized.includes('co may');

  if (normalized.length < 2) {
    return { type: 'noMatch' };
  }

  const candidates: CommandCandidate[] = [];

  for (const command of commands) {
    if (!screenAllowed(command.allowedScreens, screen, assistantState)) {
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
          // Câu hỏi liệt kê danh sách kênh/chuyên mục không được rơi vào nhánh PLAY_BY_NAME.
          if (hasListSignal) {
            confidence = 0;
          } else if (
            (normalizedPhrase === 'kenh'
              || normalizedPhrase === 'chuyen muc'
              || normalizedPhrase === 'channel'
              || normalizedPhrase === 'chuyen sang tin')
            && (
              normalized.includes('kenh')
              || normalized.includes('chuyen muc')
              || normalized.includes('channel')
              || normalized.includes('chuyen sang tin')
            )
          ) {
            // Nếu phrase là từ khóa đơn hoặc cụm từ và input có từ đó → match cao
            confidence = 0.88; // Match rất cao để ưu tiên
          } else if (
            overlap >= 0.5
            && (
              normalized.includes('kenh')
              || normalized.includes('chuyen muc')
              || normalized.includes('channel')
              || normalized.includes('chuyen sang')
              || normalized.includes('doi sang')
            )
          ) {
            // Nếu input chứa ít nhất 50% từ trong phrase và có từ khóa liên quan
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
