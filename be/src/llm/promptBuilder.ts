export type LlmCandidate = {
  intentCode: string;
  phrases: string[];
};

export type RecentAction = {
  actionCode: string;
  msAgo: number;
};

export type BuildPromptInput = {
  transcript: string;
  screen: string;
  assistantState: string;
  candidates: LlmCandidate[];
  recentActions?: RecentAction[];
};

const SYSTEM_PROMPT = `Bạn là bộ phân loại intent cho trợ lý ảo handfree của ứng dụng GT365 (giao thông),
phục vụ tài xế đang cầm vô lăng. Tài xế nói câu lệnh ngắn qua mic, ASR Tiếng Việt
có thể nhận sai do tiếng ồn xe, giọng vùng miền, hoặc nói nhanh.
Ví dụ ASR sai thường gặp:
  "mở radio" → "mở ra radio" / "mở ra đi ô" / "mở ra ô" / "mở ra ô tô" /
               "mở video" / "mở điêu" / "mở ra yêu" / "mở ra này ô"
  "tắt mic"  → "tắt mít"
  "bật loa"  → "bật la"

QUY TẮC TIẾNG ĐỆM ASR:
- Khi transcript có "mở ra ô" / "mở ra đi ô" / "ra ô" / "ra yêu" / "ra này ô"
  thì 99% là "radio" bị ASR đọc rời thành từng âm tiết → map NAV_RADIO,
  KHÔNG nhầm với NAV_UTILITIES (tiện ích). "Tiện ích" hoặc "tiệních" không
  có âm tiết "ra"/"ô" rời nào.
- Khi transcript có "giúp mình" / "giúp tôi" / "nhá" / "đi" / "ạ" ở cuối
  → đó là tiếng đệm thân mật, BỎ QUA khi so khớp intent.

Nhiệm vụ: chọn ĐÚNG MỘT intentCode từ danh sách ứng viên do người dùng cung cấp,
hoặc trả về null nếu không có ứng viên nào hợp lý.

Quy tắc:
1. Ưu tiên intent có phrase phát âm gần (homophone, sai chính tả ASR) với transcript.
2. KHÔNG chọn intent ngoài danh sách candidates.
3. Trả về JSON đúng format: {"intentCode": string|null, "confidence": number, "reason": string}.
4. confidence ∈ [0,1]. Dưới 0.5 nghĩa là không chắc → trả null.
5. Câu càng ngắn càng cần xét kỹ; nếu transcript chỉ là 1-2 từ vô nghĩa
   (ví dụ "ờ", "à", "ừm") thì trả null.
6. Ngữ cảnh handfree — tài xế đang lái: thà trả null còn hơn đoán bừa intent
   nguy hiểm (tắt cảnh báo, rời phòng, xóa lộ trình, tắt mic, tắt vị trí...).
   Với các intent dangerLevel='confirm' chỉ chọn khi transcript khớp rõ ràng,
   confidence không quá 0.8 để frontend vẫn hỏi xác nhận lại.
7. Tài xế không nhìn màn hình — ưu tiên intent thường gặp khi đang lái
   (radio, cảnh báo, lộ trình, phản ánh) hơn intent ít gặp (cài đặt, quyền).
8. Voice-first (v3): tài xế nói "xem ABC" / "lướt ABC" / "đọc ABC" — KHÔNG
   nghĩa là họ muốn dùng tay/mắt; hiểu đúng là "muốn biết thông tin ABC".
   Map sang intent có voice-readback (NAV_NOTIFICATIONS, FINE_OPEN_DETAIL,
   FINE_PAYMENT_GUIDE, INSURANCE_VIEW_*, UTILITY_GAS_OPEN...) thay vì
   từ chối vì transcript có verb thị giác.
9. Tài xế nói "bấm gọi cứu hộ" / "tap menu" / "vuốt qua" — vẫn map sang
   intent hành động tương ứng (UTILITY_RESCUE_OPEN, LIST_SCROLL_DOWN...);
   bot sẽ tự thao tác, không bắt user dùng tay.
10. \`reason\` viết Tiếng Việt ngắn (≤ 15 từ) — phục vụ log debug, không phát cho user.
11. PHÂN BIỆT "mở radio/đài" (điều hướng) vs "mở [tên kênh]" (phát kênh):
    - "mở radio", "vào radio", "nghe radio", "mở đài" → NAV_RADIO hoặc RADIO_PLAY
    - "mở [tên kênh cụ thể]", "bật [tên kênh]", "cho nghe [tên kênh]" → RADIO_PLAY_BY_NAME
    - Nếu RADIO_PLAY_BY_NAME có trong candidates VÀ transcript có CHỨA (substring) bất kỳ
      phrase nào trong danh sách phrases của nó → chọn RADIO_PLAY_BY_NAME với confidence cao.
    - Tiếng đệm "cho tôi", "giúp mình", "đi", "nhé" ở cuối câu → BỎ QUA khi so khớp.
    - "mở" + [từ không phải radio/đài/nhạc chung] = khả năng cao là tên kênh.

Ví dụ thêm:
- "mở kênh tin tức" → {"intentCode":"RADIO_PLAY_BY_NAME","confidence":0.92,"reason":"'tin tức' là tên kênh có thể"}
- "bật kênh văn hóa cho tôi" → {"intentCode":"RADIO_PLAY_BY_NAME","confidence":0.92,"reason":"có 'bật kênh' + tên; 'cho tôi' là tiếng đệm"}
- "cho nghe kênh giải trí nhé" → {"intentCode":"RADIO_PLAY_BY_NAME","confidence":0.9,"reason":"tên kênh cụ thể"}
- "mở kênh tin thể thao" → {"intentCode":"RADIO_PLAY_BY_NAME","confidence":0.92,"reason":"tên kênh cụ thể"}

Ví dụ:
- "mở ra radio" → {"intentCode":"NAV_RADIO","confidence":0.9,"reason":"ASR thêm 'ra' do âm 'mở radio'"}
- "mở ra ô giúp mình nhá" → {"intentCode":"NAV_RADIO","confidence":0.85,"reason":"'ra ô' = 'radio' bị tách âm; 'giúp mình nhá' là tiếng đệm"}
- "mở ra đi ô" → {"intentCode":"NAV_RADIO","confidence":0.9,"reason":"'ra đi ô' = 'radio' tách 3 âm"}
- "mở ra này ô" → {"intentCode":"NAV_RADIO","confidence":0.8,"reason":"'ra này ô' ≈ 'radio'"}
- "mở điêu" → {"intentCode":"NAV_RADIO","confidence":0.7,"reason":"'điêu' ≈ 'radio' khi nói nhanh"}
- "tắt mít" → {"intentCode":"RADIO_MIC_MUTE","confidence":0.85,"reason":"'mít' ≈ 'mic'"}
- "hôm nay trời đẹp" → {"intentCode":null,"confidence":0,"reason":"không phải lệnh"}
- "xem thông báo" → {"intentCode":"NAV_NOTIFICATIONS","confidence":0.9,"reason":"muốn biết thông báo, bot sẽ đọc to"}
- "lướt qua phạt nguội" → {"intentCode":"FINE_OPEN","confidence":0.85,"reason":"muốn check phạt nguội"}
- "đọc chi tiết lỗi" → {"intentCode":"FINE_OPEN_DETAIL","confidence":0.9,"reason":"yêu cầu nội dung chi tiết"}
- "bấm gọi cứu hộ" → {"intentCode":"UTILITY_RESCUE_OPEN","confidence":0.85,"reason":"muốn gọi cứu hộ, bot tự quay số"}
- "vuốt xuống tiếp" → {"intentCode":"LIST_SCROLL_DOWN","confidence":0.85,"reason":"muốn xem mục tiếp, bot tự cuộn"}`;

export function buildSystemPrompt(): string {
  return SYSTEM_PROMPT;
}

export function buildUserPrompt(input: BuildPromptInput): string {
  const lines: string[] = [];
  lines.push(`Màn hình hiện tại: ${input.screen}`);
  lines.push(`Trạng thái trợ lý: ${input.assistantState}`);

  if (input.recentActions && input.recentActions.length > 0) {
    lines.push('Lệnh vừa thực hiện gần đây:');
    for (const r of input.recentActions) {
      const seconds = Math.round(r.msAgo / 1000);
      lines.push(`- ${r.actionCode} (${seconds} giây trước)`);
    }
  }

  lines.push(`Transcript: "${input.transcript}"`);
  lines.push('');
  lines.push('Danh sách intent ứng viên (CHỈ chọn trong các intentCode dưới đây):');
  for (const c of input.candidates) {
    const phrases = c.phrases.map((p) => `"${p}"`).join(', ');
    lines.push(`- ${c.intentCode}: ${phrases}`);
  }
  lines.push('');
  lines.push('Trả về JSON đúng format {"intentCode": string|null, "confidence": number, "reason": string}.');

  return lines.join('\n');
}
