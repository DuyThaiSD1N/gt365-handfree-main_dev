# CHANGELOG - BUG FIXES

Tài liệu này mô tả các bug đã được fix và phân tích bugs mới trong hệ thống handfree voice assistant.

---

## Bug #1: Câu lệnh "mở màn Tài khoản" không có feedback khi đang ở màn Tài khoản

### Mô tả lỗi
- **Hiện tượng**: User ở màn Tài khoản, nói "mở màn Tài khoản" thì app không phản hồi gì cả
- **Mong đợi**: Bot nói "Mình đang ở Tài khoản rồi nhé, bạn cần gì cứ nói" và mở mic lại 5s để nghe lệnh tiếp

### Nguyên nhân
Backend API đã xử lý đúng logic noop (đang ở đúng màn rồi) nhưng trả về response thiếu metadata hướng dẫn Android **mở mic lại** sau khi bot nói xong. Android không biết phải mở mic nên kết thúc luôn.

### API Response (Đã fix)

**Request:**
```json
POST /api/handfree/command
{
  "text": "mở màn tài khoản",
  "screen": "profile"
}
```

**Response:**
```json
{
  "type": "noop",
  "reply": "Mình đang ở Tài khoản rồi nhé, bạn cần gì cứ nói.",
  "noopMeta": {
    "openMicAfterReply": true,
    "silenceTimeoutSeconds": 5
  },
  "meta": {
    "intentCode": "NAV_PROFILE",
    "confidence": 1,
    "source": "noop",
    "latencyMs": 12
  }
}
```

**Giải thích:**
- `type: "noop"`: Backend nhận ra đang ở đúng màn rồi
- `noopMeta.openMicAfterReply: true`: Báo Android mở mic lại sau khi TTS nói xong
- `noopMeta.silenceTimeoutSeconds: 5`: Nếu user im lặng 5s thì tự động đóng assistant

---

## Bug #2: Từ xác nhận "ừ", "ok", "đồng ý" không được nhận trong confirm flow

### Mô tả lỗi
- **Hiện tượng**: User nói lệnh nguy hiểm (ví dụ "tắt cảnh báo"), bot hỏi xác nhận, user nói "ừ" hoặc "ok" nhưng không được
- **Mong đợi**: Bot nhận "ừ", "ok", "đồng ý" như xác nhận YES

### Nguyên nhân
1. **Thiếu từ xác nhận**: Command `CONFIRM_YES` thiếu nhiều biến thể confirm thông dụng như "ừ", "ok", "được"
2. **Normalize vấn đề**: Từ "ừ" sau normalize thành "u" (1 ký tự) quá ngắn, bị loại bởi logic substring match
3. **Threshold quá cao**: Confidence threshold 0.9 quá cao, các từ tiếng Việt có dấu bị giảm confidence

### API Response (Đã fix)

**Request 1: Lệnh nguy hiểm → yêu cầu confirm**
```json
POST /api/handfree/command
{
  "text": "tắt cảnh báo",
  "screen": "home"
}
```

**Response 1:**
```json
{
  "type": "confirm",
  "reply": "Mình tắt cảnh báo cho bạn nhé?",
  "pending": {
    "intentCode": "VIOLATION_ALERT_OFF",
    "originalText": "tắt cảnh báo"
  },
  "confirmMeta": {
    "maxSilenceRetries": 2,
    "retryPrompt": "Mình chưa nghe rõ, bạn nói \"đồng ý\" hoặc \"hủy\" giúp mình nhé.",
    "cancelMessage": "Mình hủy lệnh vì không nhận được xác nhận.",
    "silenceTimeoutSeconds": 10
  },
  "meta": {...}
}
```

**Request 2: User xác nhận "ok"**
```json
POST /api/handfree/command
{
  "text": "ok",
  "screen": "home",
  "pending": {
    "intentCode": "VIOLATION_ALERT_OFF",
    "originalText": "tắt cảnh báo"
  }
}
```
**Response 2:**
```json
{
  "type": "action",
  "reply": "Mình tắt cảnh báo cho bạn rồi đấy, bạn nhớ giữ tốc độ giùm mình nhé.",
  "action": {
    "code": "DISABLE_VIOLATION_ALERTS"
  },
  "meta": {
    "intentCode": "VIOLATION_ALERT_OFF",
    "confidence": 1,
    "source": "confirm",
    "latencyMs": 8
  }
}
```

**Known Issues**
- Từ "ừ" (normalize thành "u") vẫn khó match do quá ngắn → User có thể dùng "ok", "được", "đồng ý" thay thế

---

## Bug #5: Khi nói câu lệnh mà BOT không bắt dc key được 2 lần

### Mô tả lỗi  
- **Hiện tượng**: User nói lệnh lần 1 bot không hiểu → fallback + mở mic. User nói lần 2 bot vẫn không hiểu → đóng assistant luôn
- **Mong đợi**: Lần 1 fallback + mở mic, lần 2+ fallback + đóng assistant

### Nguyên nhân phân tích
**Backend HOẠT ĐỘNG ĐÚNG theo thiết kế:**

```javascript
// File: be/src/ws/handfree-http.ts - buildFallbackResponse()
function buildFallbackResponse(p: ParsedBody, latencyMs: number): HandfreeResponse {
  const fallbackCount = (p.consecutiveFallbacks || 0) + 1;

  // Lần 1: Hỏi lại + mở mic tự động
  if (fallbackCount === 1) {
    return {
      type: 'fallback',
      reply: pickFeedback(FALLBACK_REPLIES_FIRST, p.text),
      suggestions: getFallbackSuggestions(p.screen).slice(0, 6),
      openMicAfterReply: true, // ✅ Mở mic lại
      consecutiveFallbacks: fallbackCount,
      shouldCloseAssistant: undefined, // ✅ Không đóng
      meta: { intentCode: null, confidence: 0, source: 'fallback', latencyMs }
    };
  }

  // Lần 2+: Bảo thôi, đóng trợ lý
  return {
    type: 'fallback',
    reply: pickFeedback(FALLBACK_REPLIES_SECOND, p.text),
    suggestions: [],
    shouldCloseAssistant: true, // ✅ Đóng assistant
    openMicAfterReply: false,
    consecutiveFallbacks: fallbackCount,
    meta: { intentCode: null, confidence: 0, source: 'fallback', latencyMs }
  };
}
```

### API Flow (Backend hoạt động ĐÚNG)

**Request 1: Lệnh không rõ lần đầu**
```json
POST /api/handfree/command
{
  "text": "lệnh không rõ xyz", 
  "screen": "home",
  "consecutiveFallbacks": 0
}
```

**Response 1:**
```json
{
  "type": "fallback",
  "reply": "Mình chưa nghe rõ lệnh này, bạn nói lại giúp mình nhé.",
  "suggestions": ["Về trang chủ", "Mở radio", "Bật cảnh báo"],
  "openMicAfterReply": true,
  "consecutiveFallbacks": 1,
  "meta": {"source": "fallback"}
}
```
**Request 2: Lệnh không rõ lần 2**
```json
POST /api/handfree/command
{
  "text": "lệnh không rõ abc",
  "screen": "home", 
  "consecutiveFallbacks": 1
}
```

**Response 2:**
```json
{
  "type": "fallback",
  "reply": "Mình vẫn chưa nghe rõ, thôi bạn dùng nút bấm cho nhanh nhé, mình tạm nghỉ đây.",
  "suggestions": [],
  "shouldCloseAssistant": true,
  "openMicAfterReply": false,
  "consecutiveFallbacks": 2,
  "meta": {"source": "fallback"}
}
```

**Kết luận**: Backend xử lý ĐÚNG. Có thể vấn đề nằm ở Android không truyền đúng `consecutiveFallbacks` hoặc không xử lý đúng `shouldCloseAssistant: true`.

---

## Bug #6: Bật BOT và nói lệnh "Dừng nghe"

### Mô tả lỗi
- **Hiện tượng**: User bật BOT và nói "Dừng nghe" → BOT không tắt
- **Mong đợi**: BOT tắt và nói "Mình tạm nghỉ đây ạ, cần gì bạn cứ gọi GT365 ơi"

### Nguyên nhân phân tích  
**Backend HOẠT ĐỘNG ĐÚNG:**

```javascript
// File: be/src/voice/commands.ts
{
  intentCode: 'ASSISTANT_CLOSE',
  phrases: [
    'đóng trợ lý',
    'tắt trợ lý', 
    'ngủ đi',
    'nghỉ đi gt365',
    'thoát trợ lý',
    'dừng nghe',  // ✅ Có phrase này
    'đủ rồi gt365',
    'thôi nhé',
  ],
  allowedScreens: 'all',
  dangerLevel: 'safe',
  priority: 4,
}
```

```javascript
// File: be/src/voice/screenActions.ts  
{
  intentCode: 'ASSISTANT_CLOSE',
  screen: 'all',
  actionCode: 'CLOSE_ASSISTANT', // ✅ Action đúng
  feedback: [
    'Mình tạm nghỉ đây ạ, cần gì bạn cứ gọi "GT365 ơi" là mình nghe lại liền nhé.',
    'Mình nghỉ đây nha, lúc nào cần bạn cứ kêu "GT365 ơi" là mình bật lại liền.',
    // ... more feedback options
  ],
}
```

### API Response (Backend hoạt động ĐÚNG)

**Request:**
```json
POST /api/handfree/command
{
  "text": "dừng nghe",
  "screen": "home"
}
```

**Response:**
```json
{
  "type": "action",
  "reply": "Mình tạm nghỉ đây ạ, cần gì bạn cứ gọi \"GT365 ơi\" là mình nghe lại liền nhé.",
  "action": {
    "code": "CLOSE_ASSISTANT"
  },
  "meta": {
    "intentCode": "ASSISTANT_CLOSE",
    "confidence": 1,
    "source": "matcher",
    "latencyMs": 5
  }
}
```

**Kết luận**: Backend trả đúng `action.code: "CLOSE_ASSISTANT"`. Vấn đề có thể ở Android không xử lý action này hoặc có conflict với logic khác.

---

## Bug #7: Bật BOT và không nói gì, Nói lệnh "Bắt cảnh báo" khi mà trạng thái cảnh báo đang ở ON

### Mô tả lỗi
- **Hiện tượng**: Cảnh báo đang BẬT, user nói "Bắt cảnh báo" → BOT vẫn thực hiện thay vì nói "đang bật rồi"
- **Mong đợi**: BOT nói "Cảnh báo đang bật rồi, bạn có muốn mình hỗ trợ gì cứ nói nhé" + mở mic 5s

### Nguyên nhân phân tích
**Backend HOẠT ĐỘNG ĐÚNG:**
```javascript
// File: be/src/ws/handfree-http.ts - Alert noop logic
if (action.actionCode === 'ENABLE_VIOLATION_ALERTS') {
  const bothOn = parsed.speedAlertEnabled === true && parsed.hotspotAlertEnabled === true;
  if (bothOn) {
    const response = buildNoopResponse(parsed, intentCode, action.actionCode, Date.now() - startedAt);
    setCached(key, response);
    console.log(`[handfree] ✅ alert-noop ENABLE (both already on)`);
    res.json(response);
    return;
  }
}

// File: be/src/ws/handfree-http.ts - buildNoopResponse()  
case 'ENABLE_VIOLATION_ALERTS':
  return 'Cảnh báo đang bật rồi, bạn có muốn mình hỗ trợ gì cứ nói nhé.';

// File: be/src/ws/handfree-http.ts - buildNoopMeta()
const NOOP_OPEN_MIC_ACTIONS = new Set<ActionCode>([
  'ENABLE_VIOLATION_ALERTS', // ✅ Có trong danh sách mở mic
  // ... other actions
]);

function buildNoopMeta(actionCode: ActionCode): NoopMeta {
  return {
    openMicAfterReply: NOOP_OPEN_MIC_ACTIONS.has(actionCode), // ✅ true
    silenceTimeoutSeconds: 5,
  };
}
```

### API Response (Backend hoạt động ĐÚNG)

**Request:**
```json
POST /api/handfree/command
{
  "text": "bắt cảnh báo",
  "screen": "home",
  "speedAlertEnabled": true,
  "hotspotAlertEnabled": true
}
```

**Response:**  
```json
{
  "type": "noop",
  "reply": "Cảnh báo đang bật rồi, bạn có muốn mình hỗ trợ gì cứ nói nhé.",
  "noopMeta": {
    "openMicAfterReply": true,
    "silenceTimeoutSeconds": 5
  },
  "meta": {
    "intentCode": "VIOLATION_ALERT_ON", 
    "confidence": 1,
    "source": "noop",
    "latencyMs": 8
  }
}
```

**Kết luận**: Backend trả đúng `type: "noop"` khi cả 2 alert đều đã bật. Vấn đề có thể ở Android không gửi đúng `speedAlertEnabled` và `hotspotAlertEnabled` trong request.

---

## Bug #8: Vẫn thực hiện các câu lệnh confirm

### Mô tả lỗi
- **Hiện tượng**: Trong confirm flow, user nói lệnh khác (không phải yes/no) → BOT vẫn thực hiện lệnh đó thay vì nhắc "nói đồng ý hoặc hủy"
- **Mong đợi**: BOT nhắc lại "Bạn trả lời đồng ý hoặc hủy giúp mình trước nhé"

### Nguyên nhân phân tích
**Backend HOẠT ĐỘNG ĐÚNG:**

```javascript
// File: be/src/ws/handfree-http.ts - Confirm flow
if (parsed.pending) {
  // ... xử lý CONFIRM_YES/NO trước

  // Pending nhưng user nói lệnh khác → nhắc lại yêu cầu xác nhận
  const CONFIRM_ONLY_REPLIES = [
    'Bạn trả lời "đồng ý" hoặc "hủy" giúp mình trước nhé.',
    'Mình đang chờ bạn xác nhận, bạn nói "đồng ý" hoặc "hủy" nhé.',
    'Cho mình xin xác nhận trước: nói "đồng ý" hoặc "hủy" giúp mình nha.',
  ];
  const confirmOnlyReply = CONFIRM_ONLY_REPLIES[Math.floor(Math.random() * CONFIRM_ONLY_REPLIES.length)];
  const confirmOnlyResponse: HandfreeResponse = {
    type: 'confirm',
    reply: confirmOnlyReply,
    pending: parsed.pending, // ✅ Giữ nguyên pending
    confirmMeta: DEFAULT_CONFIRM_META,
    meta: { intentCode: parsed.pending.intentCode, confidence: 1, source: 'confirm', latencyMs }
  };
  res.json(confirmOnlyResponse);
  return; // ✅ Không xử lý lệnh mới
}
```
### API Flow (Backend hoạt động ĐÚNG)

**Request 1: Lệnh nguy hiểm**
```json
POST /api/handfree/command
{
  "text": "tắt cảnh báo",
  "screen": "home"
}
```

**Response 1:**
```json
{
  "type": "confirm",
  "reply": "Mình tắt cảnh báo cho bạn nhé?",
  "pending": {
    "intentCode": "VIOLATION_ALERT_OFF",
    "originalText": "tắt cảnh báo"
  },
  "confirmMeta": {...}
}
```

**Request 2: User nói lệnh khác thay vì yes/no**
```json
POST /api/handfree/command
{
  "text": "mở radio",
  "screen": "home",
  "pending": {
    "intentCode": "VIOLATION_ALERT_OFF", 
    "originalText": "tắt cảnh báo"
  }
}
```

**Response 2:**
```json
{
  "type": "confirm",
  "reply": "Bạn trả lời \"đồng ý\" hoặc \"hủy\" giúp mình trước nhé.",
  "pending": {
    "intentCode": "VIOLATION_ALERT_OFF",
    "originalText": "tắt cảnh báo"
  },
  "confirmMeta": {...}
}
```

**Kết luận**: Backend KHÔNG thực hiện lệnh "mở radio", mà nhắc lại yêu cầu confirm. Logic đúng hoàn toàn.

---

## Summary - Phân tích 4 Bugs mới từ Android team

| Bug | Backend Logic | Kết luận | Khuyến nghị |
|-----|---------------|----------|-------------|
| **#5** | ✅ ĐÚNG - Lần 1 `openMicAfterReply: true`, Lần 2+ `shouldCloseAssistant: true` | Backend hoạt động đúng thiết kế | Kiểm tra Android xử lý `consecutiveFallbacks` và `shouldCloseAssistant` |
| **#6** | ✅ ĐÚNG - "dừng nghe" → `CLOSE_ASSISTANT` action | Backend match đúng lệnh và trả đúng action | Kiểm tra Android xử lý action `CLOSE_ASSISTANT` |  
| **#7** | ✅ ĐÚNG - Khi `speedAlertEnabled: true` + `hotspotAlertEnabled: true` → `noop` | Backend logic noop đúng | Kiểm tra Android gửi đúng `speedAlertEnabled`/`hotspotAlertEnabled` |
| **#8** | ✅ ĐÚNG - Khi có `pending`, bỏ qua lệnh mới, nhắc lại confirm | Backend không thực hiện lệnh khác khi đang confirm | Logic đúng, không cần fix |

### Kết luận chung

**TẤT CẢ 4 BUGS backend đều hoạt động ĐÚNG theo thiết kế.** Vấn đề có thể nằm ở:

1. **Android không gửi đúng data**: `consecutiveFallbacks`, `speedAlertEnabled`, `hotspotAlertEnabled`
2. **Android không xử lý đúng response**: `shouldCloseAssistant`, `openMicAfterReply`, action `CLOSE_ASSISTANT`
3. **Timing issues**: Race condition hoặc async handling
4. **Caching**: Android cache response cũ hoặc không update state đúng

**Khuyến nghị**: Android team cần debug log request/response để xác định chính xác nguyên nhân.

---

## Summary tất cả bugs

| Bug | Loại | Status | Backend API |
|-----|------|--------|-------------|
| #1 | Noop không mở mic lại | ✅ Fixed | Thêm `noopMeta.openMicAfterReply` |
| #2 | Confirm không nhận từ tiếng Việt | ✅ Fixed | Bổ sung phrases + Levenshtein + giảm threshold |
| #3 | Không tìm được kênh → im lặng | ✅ Fixed | Trả `clarification` với gợi ý + mở mic |
| #4 | Nhầm "liệt kê" với "mở kênh" | ✅ Fixed | Thêm list keyword logic trong matcher |
| #5 | Fallback 2 lần không đóng assistant | ✅ Backend OK | Kiểm tra Android xử lý `shouldCloseAssistant` |
| #6 | "Dừng nghe" không tắt BOT | ✅ Backend OK | Kiểm tra Android xử lý `CLOSE_ASSISTANT` |  
| #7 | "Bắt cảnh báo" khi đã ON | ✅ Backend OK | Kiểm tra Android gửi đúng alert state |
| #8 | Confirm flow thực hiện lệnh khác | ✅ Backend OK | Logic đúng, Android cần debug |