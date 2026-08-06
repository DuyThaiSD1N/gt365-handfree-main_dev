# GT365 Handfree Bot - Bug Fixes & API

## 🔧 Bug #1: Bổ sung từ xác nhận đa dạng

### Mô tả lỗi
Bot chỉ nhận một số từ xác nhận hạn chế khi user cần confirm lệnh nguy hiểm (tắt cảnh báo, xóa lộ trình...).

### Fix đã thực hiện
Bổ sung thêm 30+ từ xác nhận tiếng Việt vào `CONFIRM_YES`:
- Các biến thể "ừ": `ừa`, `ừm`, `uhm`, `um`, `à ừ`, `ờ ừ`
- Các biến thể "ok": `okay`, `okie`, `oke`
- Từ khẳng định: `được`, `được rồi`, `được đó`, `rồi`, `ngon`, `ngon rồi`, `tốt`, `tốt thôi`
- Từ mệnh lệnh: `làm luôn`, `tiếp đi`, `cứ làm`, `cứ đi`, `go`
- Từ trang trọng: `vâng`, `dạ`, `dạ được`, `chắc chắn`, `chắc rồi`, `nhất định`
- Tiếng Anh: `yes`, `yeah`, `yup`

### API liên quan

**Request khi đang confirm:**
```json
POST /api/handfree/command
{
  "text": "ok",
  "screen": "home",
  "assistantState": "confirming",
  "pending": {
    "intentCode": "VIOLATION_ALERT_OFF",
    "originalText": "tắt cảnh báo"
  }
}
```

**Response khi accept confirm:**
```json
{
  "type": "action",
  "reply": "Mình tắt cảnh báo cho bạn rồi đấy, bạn lái cẩn thận giùm mình nhé.",
  "action": {
    "code": "DISABLE_VIOLATION_ALERTS"
  },
  "meta": {
    "intentCode": "VIOLATION_ALERT_OFF",
    "confidence": 1,
    "source": "confirm",
    "latencyMs": 4
  }
}
```

---

## 🔧 Bug #2: Câu phản hồi màn Tài khoản

### Mô tả lỗi
Câu phản hồi khi vào màn Tài khoản chưa theo yêu cầu của team.

### Fix đã thực hiện
Thêm câu phản hồi mới ưu tiên đầu tiên:
```
"Mình đã đưa bạn vào mục Tài khoản nha, bạn cần gì tiếp cứ bảo mình."
```

### API liên quan

**Request:**
```json
POST /api/handfree/command
{
  "text": "mở tài khoản",
  "screen": "home",
  "assistantState": "listening"
}
```

**Response:**
```json
{
  "type": "action",
  "reply": "Mình đã đưa bạn vào mục Tài khoản nha, bạn cần gì tiếp cứ bảo mình.",
  "action": {
    "code": "OPEN_PROFILE_SCREEN",
    "nextScreen": "profile"
  },
  "meta": {
    "intentCode": "NAV_PROFILE",
    "confidence": 0.95,
    "source": "matcher",
    "latencyMs": 50
  }
}
```

---

## 🔧 Bug #3: Lệnh vào Radio → BOT idle

### Mô tả lỗi
Từ màn Tài khoản → lệnh vào màn Radio → BOT idle (không phản hồi).

### Nguyên nhân
**Backend hoạt động ĐÚNG**. Vấn đề nằm ở Android không xử lý response type `action`.

### API Backend trả về

**Request:**
```json
POST /api/handfree/command
{
  "text": "vào radio",
  "screen": "profile",
  "assistantState": "listening"
}
```

**Response:**
```json
{
  "type": "action",
  "reply": "Mình mở Radio cho bạn rồi ạ, bạn nói tên kênh là mình thao tác liền cho.",
  "action": {
    "code": "OPEN_RADIO_SCREEN",
    "nextScreen": "radio"
  },
  "meta": {
    "intentCode": "NAV_RADIO",
    "confidence": 0.95,
    "source": "llm",
    "latencyMs": 4800
  }
}
```

---

## 🔧 Bug #4: Về màn Home khi đang ở Home → không nói

### Mô tả lỗi
Đang ở Home → bảo về Home → BOT listening nhưng không nói gì.

### Nguyên nhân
**Backend hoạt động ĐÚNG** - trả response type `noop`. Vấn đề nằm ở Android không đọc TTS trong response type `noop`.

### API Backend trả về

**Request:**
```json
POST /api/handfree/command
{
  "text": "về trang chủ",
  "screen": "home",
  "assistantState": "listening"
}
```

**Response:**
```json
{
  "type": "noop",
  "reply": "Mình đang ở trang chủ rồi đó, bạn cần gì nữa cứ bảo.",
  "noopMeta": {
    "openMicAfterReply": true,
    "silenceTimeoutSeconds": 5
  },
  "meta": {
    "intentCode": "NAV_HOME",
    "confidence": 1,
    "source": "noop",
    "latencyMs": 10
  }
}
```

---

## 🔧 Bug #5: Về màn Home từ Radio → không nói

### Mô tả lỗi
Tương tự Bug #4 nhưng từ màn Radio.

### API Backend trả về

**Request:**
```json
POST /api/handfree/command
{
  "text": "về trang chủ",
  "screen": "radio",
  "assistantState": "listening"
}
```

**Response:**
```json
{
  "type": "action",
  "reply": "Mình mở trang chủ cho bạn rồi đó, bạn muốn làm gì tiếp cứ nói nhé.",
  "action": {
    "code": "OPEN_HOME_SCREEN",
    "nextScreen": "home"
  },
  "meta": {
    "intentCode": "NAV_HOME",
    "confidence": 0.85,
    "source": "llm",
    "latencyMs": 3440
  }
}
```

---

## 📋 Tổng kết Response Types

Backend trả 5 loại response. **Android cần xử lý đủ cả 5 loại:**

### 1. `type: "action"` - Thực hiện hành động
- Phát TTS: `reply`
- Thực hiện: `action.code`
- Navigate: `action.nextScreen` (nếu có)

### 2. `type: "noop"` - Đang ở đúng trạng thái
- **Phát TTS: `reply`** ← QUAN TRỌNG!
- Mở mic: `noopMeta.silenceTimeoutSeconds` giây
- KHÔNG thực hiện action

### 3. `type: "confirm"` - Cần xác nhận
- Phát TTS: `reply`
- Lưu: `pending`
- Mở mic chờ "đồng ý" / "hủy"

### 4. `type: "fallback"` - Không hiểu
- Phát TTS: `reply`
- Hiển thị: `suggestions` (optional)
- Đóng assistant nếu: `shouldCloseAssistant = true`

### 5. `type: "clarification"` - Cần làm rõ
- Phát TTS: `reply`
- Mở mic để user làm rõ

---

## ⚠️ Known Issues

### Từ "ừ" không được nhận dạng
**Lý do:** Sau normalize "ừ" → "u" (1 ký tự) rất khó phân biệt với noise.

**Workaround:** Dùng các từ thay thế:
- ✅ "ok", "oke", "okie"
- ✅ "đồng ý"
- ✅ "được", "rồi"
- ✅ "vâng", "dạ"

---

---

**Ngày cập nhật:** 2024-02-06  
**Version:** 0.2.1

### 1. ✅ Bổ sung từ xác nhận đa dạng
**Vấn đề:** Bot chỉ nhận một số từ xác nhận hạn chế.

**Fix:** Bổ sung thêm nhiều từ xác nhận tiếng Việt trong `CONFIRM_YES`:
- Các biến thể "ừ": `ừa`, `ừm`, `uhm`, `um`, `à ừ`, `ờ ừ`
- Các biến thể "ok": `okay`, `okie`, `oke`
- Từ khẳng định: `được`, `được rồi`, `được đó`, `rồi`, `ngon`, `ngon rồi`, `tốt`, `tốt thôi`
- Từ mệnh lệnh: `làm luôn`, `tiếp đi`, `cứ làm`, `cứ đi`, `go`
- Từ trang trọng: `vâng`, `dạ`, `dạ được`, `chắc chắn`, `chắc rồi`, `nhất định`
- Tiếng Anh: `yes`, `yeah`, `yup`

---

### 2. ✅ Chỉnh sửa câu phản hồi màn Tài khoản
**Vấn đề:** Câu phản hồi khi vào màn Tài khoản chưa theo yêu cầu.

**Fix:** Thêm câu phản hồi ưu tiên:
```
"Mình đã đưa bạn vào mục Tài khoản nha, bạn cần gì tiếp cứ bảo mình."
```

**Kết quả:** 
- App điều hướng đến màn hình Tài khoản
- BOT phản hồi câu mới
- BOT listening 5s

---

### 3. ✅ Cải thiện độ chính xác confirm
**Vấn đề:** Các từ xác nhận như "ok", "dong y" hoạt động nhưng threshold quá cao.

**Fix:** Giảm threshold từ `0.9` → `0.85` để các từ tiếng Việt có dấu được match tốt hơn.

---

### 4. ✅ Bổ sung logic matcher cho CONFIRM intent
**Vấn đề:** Matcher không xử lý đặc biệt cho các từ confirm ngắn.

**Fix:** 
- Thêm logic đặc biệt cho `CONFIRM_YES` và `CONFIRM_NO`
- Sử dụng Levenshtein distance để match các từ ngắn với tolerance 1 ký tự
- Bỏ qua constraint length cho confirm phrases


