
# Bug #1: Alert Noop Detection

### 🔴 Problem Description
**Scenario:** User bật cảnh báo khi ít nhất 1 cảnh báo đã bật  
**Expected:** Bot trả về NOOP (không cần làm gì) + mở mic  
**Actual:** Bot hỏi confirm "Mình bật cảnh báo cho bạn nhé?"  

**Root Cause:**
```typescript
// ❌ Logic cũ - Chỉ noop khi CẢ 2 đều bật
const bothOn = parsed.speedAlertEnabled === true && parsed.hotspotAlertEnabled === true;
```

### ✅ Solution
```typescript
// ✅ Logic mới - Noop nếu ít nhất 1 đã bật
const anyOn = parsed.speedAlertEnabled === true || parsed.hotspotAlertEnabled === true;
```

### 📊 API Response Examples

**Test Case 1:** Cả 2 cảnh báo đã bật
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
    "latencyMs": 12
  }
}
```

**Test Case 2:** Chỉ hotspot bật (như Android screenshot)
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

**Test Case 3:** Cả 2 tắt → Cần confirm
```json
{
  "type": "confirm",
  "reply": "Mình bật cảnh báo cho bạn nha ạ?",
  "pending": {
    "intentCode": "VIOLATION_ALERT_ON",
    "originalText": "bật cảnh báo"
  },
  "confirmMeta": {
    "maxSilenceRetries": 2,
    "retryPrompt": "Mình chưa nghe rõ, bạn nói \"đồng ý\" hoặc \"hủy\" giúp mình nhé.",
    "cancelMessage": "Mình hủy lệnh vì không nhận được xác nhận, bạn cần gì cứ bảo mình nhé.",
    "silenceTimeoutSeconds": 10
  },
  "meta": {
    "intentCode": "VIOLATION_ALERT_ON",
    "confidence": 1,
    "source": "matcher",
    "latencyMs": 15
  }
}
```

### 📝 Files Changed
- `be/src/ws/handfree-http.ts` (line ~1033-1045)

### ✅ Test Results
```
✅ Test 1: Cả 2 bật → NOOP ✓
✅ Test 2: Chỉ hotspot bật → NOOP ✓
✅ Test 3: Chỉ speed bật → NOOP ✓
✅ Test 4: Cả 2 tắt → CONFIRM ✓
```

---

## Bug #2: Fallback Flow - Multiple Failures

### 🔴 Problem Description
**Scenario:** Bot không hiểu lệnh 2 lần liên tiếp  
**Expected (Lần 2):**
- Bot: "Xin lỗi, mình vẫn không nghe rõ. Tạm thời mình sẽ dừng lại ở đây. Lúc nào cần bạn chạm nút trợ lý để mình trở lại nhé."
- State: IDLE (đóng assistant)
- `shouldCloseAssistant: true`

**Actual:**
- Bot: Câu khác nhau (random từ 4 variants)
- State: Listening (vẫn mở mic)

**Root Cause:**
```typescript
// ❌ Có nhiều variants không consistent
const FALLBACK_REPLIES_SECOND = [
  'Xin lỗi, mình vẫn không nghe rõ...',
  'Mình vẫn chưa nghe rõ, thôi bạn dùng nút bấm...',
  'Mình chưa hiểu được ý bạn...',
  'Ui, mình không rõ lệnh này...',
];
```

### ✅ Solution
```typescript
// ✅ Chỉ 1 message chuẩn, professional
const FALLBACK_REPLIES_SECOND = [
  'Xin lỗi, mình vẫn không nghe rõ. Tạm thời mình sẽ dừng lại ở đây. Lúc nào cần bạn chạm nút trợ lý để mình trở lại nhé.',
];

// ✅ Đảm bảo đóng assistant
return {
  type: 'fallback',
  reply: pickFeedback(FALLBACK_REPLIES_SECOND, p.text),
  suggestions: [],
  shouldCloseAssistant: true,  // ← KEY
  openMicAfterReply: false,     // ← KEY
  consecutiveFallbacks: fallbackCount,
  meta: { intentCode: null, confidence: 0, source: 'fallback', latencyMs },
};
```

### 📊 API Response Examples

**Fallback Lần 1:** Hỏi lại
```json
{
  "type": "fallback",
  "reply": "Hửm, mình chưa rõ ý bạn, bạn nói gọn lại giúp mình nha.",
  "suggestions": [
    "về trang chủ",
    "mở radio",
    "bật cảnh báo",
    "tắt cảnh báo",
    "mở tiện ích",
    "tra cứu phạt nguội"
  ],
  "openMicAfterReply": true,
  "consecutiveFallbacks": 1,
  "meta": {
    "intentCode": null,
    "confidence": 0,
    "source": "fallback",
    "latencyMs": 18
  }
}
```

**Fallback Lần 2:** Đóng assistant
```json
{
  "type": "fallback",
  "reply": "Xin lỗi, mình vẫn không nghe rõ. Tạm thời mình sẽ dừng lại ở đây. Lúc nào cần bạn chạm nút trợ lý để mình trở lại nhé.",
  "suggestions": [],
  "shouldCloseAssistant": true,
  "openMicAfterReply": false,
  "consecutiveFallbacks": 2,
  "meta": {
    "intentCode": null,
    "confidence": 0,
    "source": "fallback",
    "latencyMs": 10
  }
}
```

### 📝 Files Changed
- `be/src/ws/handfree-http.ts` (line ~308-310)

### ✅ Test Results
```
✅ Fallback lần 1: openMicAfterReply=true, suggestions=6 items ✓
✅ Fallback lần 2: shouldCloseAssistant=true, openMicAfterReply=false ✓
✅ Fallback lần 3+: Same as lần 2 ✓
```

---

## Bug #3: Assistant Close Message Consistency

### 🔴 Problem Description
**Scenario:** User nói "dừng nghe" để tắt bot  
**Expected:** Luôn nói "Mình dừng lại đây, lúc nào cần bạn chạm nút trợ lý một cái là mình bật lại liền."  
**Actual:** Random từ 5 variants khác nhau (có "nghỉ", "tạm dừng"...)

**Root Cause:**
```typescript
// ❌ Nhiều variants không consistent
feedback: [
  'Mình dừng lại đây...',
  'Mình nghỉ đây nha...',      // ← Inconsistent
  'Mình tắt đây ạ...',
  'Ờ, mình nghỉ rồi đó...',    // ← Inconsistent
  'Mình tạm dừng nhé...',       // ← Inconsistent
]
```

### ✅ Solution
```typescript
// ✅ Chỉ 1 message chuẩn, professional
feedback: [
  'Mình dừng lại đây, lúc nào cần bạn chạm nút trợ lý một cái là mình bật lại liền.',
]
```

**Các chỗ đã update:**
1. `ASSISTANT_CLOSE` feedback
2. Silence response (khi user im lặng)
3. `FALLBACK_REPLIES_SECOND`
4. `RADIO_PAUSE` feedback ("tạm dừng" → "dừng")

### 📊 API Response Example

```json
{
  "type": "action",
  "reply": "Mình dừng lại đây, lúc nào cần bạn chạm nút trợ lý một cái là mình bật lại liền.",
  "action": {
    "code": "CLOSE_ASSISTANT"
  },
  "meta": {
    "intentCode": "ASSISTANT_CLOSE",
    "confidence": 1,
    "source": "matcher",
    "latencyMs": 8
  }
}
```

### 📝 Files Changed
- `be/src/voice/screenActions.ts` (ASSISTANT_CLOSE, RADIO_PAUSE)
- `be/src/ws/handfree-http.ts` (silence response, fallback)

### ✅ Test Results
```
✅ "dừng nghe" → "Mình dừng lại đây..." ✓
✅ "tắt trợ lý" → "Mình dừng lại đây..." ✓
✅ "đóng trợ lý" → "Mình dừng lại đây..." ✓
✅ Im lặng → "Mình dừng lại đây..." ✓
```

---

## Bug #4: Android Screen Name Conflict

### 🔴 Problem Description
**Scenario:** Android gửi `screen: "account"` nhưng backend expect `"profile"`  
**Expected:** Backend accept "account" và trả về `nextScreen: "account"`  
**Actual:** 
- Backend reject với HTTP 400 invalid-body
- Android hiển thị: "Không thể kết nối lúc này, vui lòng thử lại sau"

**Root Cause:**
```typescript
// ❌ Backend chỉ accept "profile"
const VALID_SCREENS = new Set([
  'home', 'radio', 'utilities', 'community', 
  'profile',  // ← Android gửi "account"
  'notifications', 'route'...
]);

// ❌ Response trả về "profile"
{
  nextScreen: 'profile'  // ← Android expect "account"
}
```

### ✅ Solution - Complete Migration

**Option 1 (Đã thử - Normalization):**
```typescript
// Normalize "account" → "profile" trong parseBody
if (screen === 'account') screen = 'profile';
```
❌ Vẫn inconsistent vì response trả "profile"

**Option 2 (Đã áp dụng - Full Rename):**
```typescript
// ✅ Đổi hoàn toàn "profile" → "account" trong toàn bộ codebase
export type ScreenId = 
  | 'home'
  | 'radio'
  | 'account'  // ← Thay thế "profile"
  | ...
```

### 📊 API Response Examples

**Before (Lỗi):**
```json
// Request từ Android
{
  "text": "về trang chủ",
  "screen": "account"  // ← Backend không nhận
}

// Response: HTTP 400
{
  "error": "invalid-body"
}
```

**After (Fixed):**
```json
// Request từ Android
{
  "text": "mở tài khoản",
  "screen": "home"
}

// Response: HTTP 200
{
  "type": "action",
  "reply": "Tài khoản của bạn đây rồi ạ, bạn cần đổi thông tin gì cứ nói, mình thao tác cho.",
  "action": {
    "code": "OPEN_PROFILE_SCREEN",
    "nextScreen": "account"  // ← Bây giờ trả "account"
  },
  "meta": {
    "intentCode": "NAV_PROFILE",
    "confidence": 1,
    "source": "matcher",
    "latencyMs": 12
  }
}
```

**Test: Android screen="account" → NOOP**
```json
// Request
{
  "text": "mở tài khoản cho tôi",
  "screen": "account"  // ← Đang ở màn account
}

// Response
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
    "latencyMs": 8
  }
}
```


### 📝 Files Changed

**Backend:**
1. `be/src/voice/types.ts` - ScreenId type
2. `be/src/voice/commands.ts` - listScreens, allowedScreens
3. `be/src/ws/handfree-http.ts` - VALID_SCREENS, SCREEN_NOOP_MAP
4. `be/src/voice/screenActions.ts` - screen, nextScreen

**Frontend:**
5. `src/voice/types.ts` - ScreenId type
6. `src/voice/commands.ts` - listScreens, allowedScreens
7. `src/voice/screenActions.ts` - screen, nextScreen
8. `src/App.tsx` - tabs, screenNames, switch case

**Total:** 8 files, ~20 changes

### ✅ Test Results
```
✅ screen="account" (Android) → ACCEPTED ✓
✅ screen="profile" (legacy) → REJECTED HTTP 400 ✓
✅ home → "mở tài khoản" → nextScreen="account" ✓
✅ account → "mở tài khoản" → NOOP ✓
✅ account → "về trang chủ" → ACTION to home ✓
✅ account → "mở radio" → ACTION to radio ✓
```
