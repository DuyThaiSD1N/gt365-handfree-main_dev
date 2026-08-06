/**
 * Đo "độ cứng" của dialog pool theo §5 plan/handfree_natural_dialog_v2.md
 *
 * Chạy: `npx tsx scripts/measureDialogStiffness.ts`
 */
import { screenActions } from '../src/voice/screenActions';

const PARTICLES = ['ạ', 'nhé', 'nha', 'đó', 'mà', 'nè', 'rồi', 'đấy', 'đi', 'nhỉ', 'chứ'];
const SUBJECT_PATTERNS = [
  /^Mình\b/, /^Bạn\b/, /^Đài\b/, /^Radio\b/, /^Cảnh báo\b/, /^Vị trí\b/,
  /^Mic\b/, /^Lộ trình\b/, /^Xe\b/, /^Gói\b/, /^Tiện ích\b/, /^Trang chủ\b/,
  /^Tài khoản\b/, /^Thông báo\b/, /^Cộng đồng\b/, /^Báo\b/, /^Phòng\b/,
  /^Hướng dẫn\b/, /^Danh sách\b/, /^Cứu hộ\b/, /^Trạm xăng\b/, /^Đăng kiểm\b/,
  /^Định giá\b/, /^Quản lý\b/, /^Chuyện dọc đường\b/, /^Kết bạn\b/, /^Phía trước\b/,
  /^Có\b/, /^Ờ\b/, /^Oke\b/, /^Alo\b/, /^Vâng\b/, /^Để\b/, /^Đây là\b/, /^Đây\b/, /^Đi\b/,
  /^Ui\b/, /^Hửm\b/, /^Chi tiết\b/, /^Tất cả\b/, /^Cẩn thận\b/, /^Đăng ký\b/,
  /^Hội\b/, /^\d+ mét\b/, /^\d{2,4}m\b/, /^\{channelName\}/, /^\{plate\}/,
];
const FORMAL_PREFIX = /^(Dạ|Vâng),/;
const ROBOTIC_DONE = /^Đã\s+\w+\.$/;
const REACTION_CASUAL = /^(Ờ|À|Ui|Nè|Oke|Alo)\b/;

// R16: cho bạn softener
const CHO_BAN = /\bcho bạn\b/i;

// R18: double-close pattern (kết câu hỏi + append follow-up)
const DOUBLE_CLOSE = /(nhé|nha|ạ|đó|rồi)[.!]\s*(Cứ bảo mình|Bạn cần gì thêm|Còn gì nữa|Bạn muốn làm gì tiếp)/i;

// R21: handfree — user không thể bấm/chạm/vuốt
const TAP_IMPERATIVE = /\bbạn\s+(?:cứ\s+|phải\s+)?(bấm|chạm|nhấn|vuốt|tap|cuộn tay)\b/i;
const TAP_EXCEPTION_WAKE_WORD = /(gọi\s+["']?GT365|kêu\s+["']?GT365|gọi tên mình|gọi mình)/i;

// R22: handfree — imperative thị giác phải kèm voice alternative
const VISUAL_IMPERATIVE = /\bbạn\s+(?:cứ\s+|chỉ\s+)?(xem|lướt|nhìn|đọc trên|đọc tin)\b/i;
const VOICE_ALT = /(mình đọc|mình kể|mình tóm tắt|mình giới thiệu|mình đọc to|mình đọc qua|mình đọc chi tiết|nghe mình|cho.*nghe|khi nào dừng xe|khi nào tiện|khi tiện|lúc nào tiện|lúc tiện|lúc dừng xe|cũng được)/i;

// R23: voice-readback offer (intent có nội dung)
const VOICE_READBACK_OFFER = /(mình đọc|mình kể|mình tóm tắt|mình giới thiệu|mình đọc qua|mình đọc chi tiết)/i;

type Sentence = { text: string; intentCode: string; field: 'feedback' | 'confirm' };

const sentences: Sentence[] = [];
for (const action of screenActions) {
  const items = Array.isArray(action.feedback) ? action.feedback : [action.feedback];
  for (const item of items) {
    sentences.push({ text: item, intentCode: action.intentCode, field: 'feedback' });
  }
  if (action.confirmPrompt) {
    const cps = Array.isArray(action.confirmPrompt) ? action.confirmPrompt : [action.confirmPrompt];
    for (const cp of cps) {
      sentences.push({ text: cp, intentCode: action.intentCode, field: 'confirm' });
    }
  }
  if (action.confirmPromptByScreen) {
    for (const cp of Object.values(action.confirmPromptByScreen)) {
      const cps = Array.isArray(cp) ? cp : [cp];
      for (const c of cps) {
        if (c) sentences.push({ text: c, intentCode: action.intentCode, field: 'confirm' });
      }
    }
  }
}

const wordCounts = sentences.map((s) => s.text.split(/\s+/).filter(Boolean).length);
const avgWords = wordCounts.reduce((a, b) => a + b, 0) / wordCounts.length;

const hasSubject = (text: string) => SUBJECT_PATTERNS.some((p) => p.test(text));
const subjectCount = sentences.filter((s) => hasSubject(s.text)).length;

const hasParticle = (text: string) => {
  if (text.endsWith('?')) return true;
  const trimmed = text.replace(/[.?!]+$/, '').trim();
  const tokens = trimmed.split(/\s+/);
  // Check last 5 tokens for any particle (handoff phrases push particle earlier)
  const last5 = tokens.slice(-5);
  return last5.some((token) => PARTICLES.includes(token));
};
const particleCount = sentences.filter((s) => hasParticle(s.text)).length;

const formalCount = sentences.filter((s) => FORMAL_PREFIX.test(s.text)).length;
const roboticDoneCount = sentences.filter((s) => ROBOTIC_DONE.test(s.text)).length;

// Tìm tiểu từ `ạ` đứng riêng — không phải `ạ` trong từ "Bạn"/"phạt"/"lại"...
// `\b` không hoạt động đúng với ký tự Việt; dùng lookbehind/lookahead Vietnamese letters.
const STANDALONE_A_REGEX = /(?<![A-Za-zÀ-ỹ])ạ(?![A-Za-zÀ-ỹ])/g;
const countStandaloneA = (text: string) => text.match(STANDALONE_A_REGEX)?.length ?? 0;

const SERVICE_INTENTS = /^(FINE_|REPORT_|INSURANCE_|ROUTE_|ASSISTANT_WAKE)/;
const serviceSentences = sentences.filter((s) => SERVICE_INTENTS.test(s.intentCode));
const aInServiceCount = serviceSentences.filter((s) => countStandaloneA(s.text) >= 1).length;
const aServiceRatio = serviceSentences.length ? (aInServiceCount / serviceSentences.length) * 100 : 0;

const doubleAViolations = sentences.filter((s) => countStandaloneA(s.text) >= 2);

const mixedToneViolations = sentences.filter(
  (s) => REACTION_CASUAL.test(s.text) && countStandaloneA(s.text) >= 1,
);

const variantCounts = new Map<string, number>();
for (const action of screenActions) {
  const items = Array.isArray(action.feedback) ? action.feedback : [action.feedback];
  variantCounts.set(`${action.intentCode}_${action.screen}`, items.length);
}
const intentsWithVariants = [...variantCounts.values()].filter((n) => n >= 3).length;
const variantRatio = (intentsWithVariants / variantCounts.size) * 100;

// R16: action statement ≥ 6 chữ → bao nhiêu % có "cho bạn"?
const actionStatements = sentences.filter((s) => {
  const words = s.text.split(/\s+/).filter(Boolean).length;
  return words >= 6 && s.field === 'feedback';
});
const choBanCount = actionStatements.filter((s) => CHO_BAN.test(s.text)).length;
const choBanRatio = actionStatements.length ? (choBanCount / actionStatements.length) * 100 : 0;

// R18: double-close violations
const doubleCloseViolations = sentences.filter((s) => DOUBLE_CLOSE.test(s.text));

// R21: tap-imperative violations (excluding wake-word exception)
const tapViolations = sentences.filter(
  (s) => TAP_IMPERATIVE.test(s.text) && !TAP_EXCEPTION_WAKE_WORD.test(s.text),
);

// R22: visual imperative without voice alternative
const visualViolations = sentences.filter(
  (s) => VISUAL_IMPERATIVE.test(s.text) && !VOICE_ALT.test(s.text),
);

// R23: intent có voice-readback offer
const VOICE_READBACK_INTENTS = new Set<string>();
for (const action of screenActions) {
  const items = Array.isArray(action.feedback) ? action.feedback : [action.feedback];
  if (items.some((item) => VOICE_READBACK_OFFER.test(item))) {
    VOICE_READBACK_INTENTS.add(action.intentCode);
  }
}

console.log('═══════════════════════════════════════════════');
console.log('  GT365 Dialog Stiffness Report');
console.log('═══════════════════════════════════════════════');
console.log(`Tổng số câu (feedback + confirm): ${sentences.length}`);
console.log('');
console.log('R3  Avg words / câu        : %s    (target: 8–12)', avgWords.toFixed(2));
console.log('R5  % câu có chủ ngữ rõ    : %s%%  (target: ≥ 95%)', ((subjectCount / sentences.length) * 100).toFixed(1));
console.log('R12 % câu có tiểu từ đuôi  : %s%%  (target: ≥ 90%)', ((particleCount / sentences.length) * 100).toFixed(1));
console.log('R1  % prefix Dạ/Vâng       : %s%%  (target: 0%%)', ((formalCount / sentences.length) * 100).toFixed(1));
console.log('R11 % prefix "Đã + verb."  : %s%%  (target: 0%%)', ((roboticDoneCount / sentences.length) * 100).toFixed(1));
console.log('    # intent ≥ 3 variants  : %s/%s (%s%%, target: ≥ 80%%)', intentsWithVariants, variantCounts.size, variantRatio.toFixed(1));
console.log('    % "ạ" trong service-oriented intent: %s%% (target: 30–50%%)', aServiceRatio.toFixed(1));
console.log('R15 # câu có ≥ 2 "ạ"       : %s    (target: 0)', doubleAViolations.length);
console.log('    # câu trộn reaction+ạ  : %s    (target: 0)', mixedToneViolations.length);
console.log('');
console.log('── V3 (handfree voice-first) ──────────────────');
console.log('R16 %% action statement ≥ 6 chữ có "cho bạn" : %s%% (target: ≥ 50%%)', choBanRatio.toFixed(1));
console.log('R18 # câu double-close       : %s    (target: 0)', doubleCloseViolations.length);
console.log('R21 # câu yêu cầu user bấm/chạm/vuốt : %s    (target: 0)', tapViolations.length);
console.log('R22 # câu visual imperative thiếu voice alt : %s    (target: 0)', visualViolations.length);
console.log('R23 # intent có voice-readback offer : %s    (target: ≥ 7)', VOICE_READBACK_INTENTS.size);
console.log('');

if (formalCount > 0) {
  console.log('❌ Câu có Dạ/Vâng prefix:');
  for (const s of sentences.filter((x) => FORMAL_PREFIX.test(x.text))) {
    console.log(`  [${s.intentCode}] ${s.text}`);
  }
}

if (roboticDoneCount > 0) {
  console.log('❌ Câu có "Đã + verb." khô:');
  for (const s of sentences.filter((x) => ROBOTIC_DONE.test(x.text))) {
    console.log(`  [${s.intentCode}] ${s.text}`);
  }
}

if (doubleAViolations.length > 0) {
  console.log('❌ Câu có 2+ "ạ":');
  for (const s of doubleAViolations) {
    console.log(`  [${s.intentCode}] ${s.text}`);
  }
}

if (mixedToneViolations.length > 0) {
  console.log('❌ Câu trộn reaction casual + ạ:');
  for (const s of mixedToneViolations) {
    console.log(`  [${s.intentCode}] ${s.text}`);
  }
}

if (doubleCloseViolations.length > 0) {
  console.log('❌ Câu double-close (R18):');
  for (const s of doubleCloseViolations) {
    console.log(`  [${s.intentCode}] ${s.text}`);
  }
}

if (tapViolations.length > 0) {
  console.log('❌ Câu yêu cầu user bấm/chạm/vuốt (R21):');
  for (const s of tapViolations) {
    console.log(`  [${s.intentCode}] ${s.text}`);
  }
}

if (visualViolations.length > 0) {
  console.log('❌ Câu visual imperative thiếu voice alt (R22):');
  for (const s of visualViolations) {
    console.log(`  [${s.intentCode}] ${s.text}`);
  }
}

console.log('');
console.log('R23 Intents có voice-readback offer:', [...VOICE_READBACK_INTENTS].join(', '));

const noSubject = sentences.filter((s) => !hasSubject(s.text));
if (noSubject.length > 0) {
  console.log('');
  console.log('⚠️  Câu không bắt đầu bằng chủ ngữ rõ (%s câu):', noSubject.length);
  for (const s of noSubject.slice(0, 10)) {
    console.log(`  [${s.intentCode}] ${s.text}`);
  }
  if (noSubject.length > 10) console.log(`  ... và ${noSubject.length - 10} câu khác`);
}

const noParticle = sentences.filter((s) => !hasParticle(s.text));
if (noParticle.length > 0) {
  console.log('');
  console.log('⚠️  Câu không có tiểu từ đuôi / câu hỏi (%s câu):', noParticle.length);
  for (const s of noParticle.slice(0, 10)) {
    console.log(`  [${s.intentCode}] ${s.text}`);
  }
  if (noParticle.length > 10) console.log(`  ... và ${noParticle.length - 10} câu khác`);
}
