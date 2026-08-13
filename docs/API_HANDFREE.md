# GT365 Handfree Assistant — API tích hợp

> **Mục đích**: tài liệu API cho ứng dụng **Giao thông 365** gọi vào trợ lý handfree. App tự xử lý ASR (Speech-to-Text) và TTS (Text-to-Speech) ở client. Server chỉ làm "bộ não": nhận text user nói, trả về **action code** (để app tự thực hiện trên UI) + **text phản hồi** (để app đọc qua TTS).
>
> Server thực hiện 3 việc: (1) match transcript với danh sách lệnh, (2) LLM cứu intent khi ASR sai/nói lệch chuẩn, (3) sinh câu phản hồi tự nhiên theo style guide handfree.

---

## 1. Tổng quan luồng

```
┌──────────────────────────┐                          ┌──────────────────────────┐
│       GT365 App          │   text + screen + ctx    │   Handfree Bot Server    │
│  (mobile / web client)   │ ───────────────────────► │   (this API)             │
│                          │                          │                          │
│  - ASR: speech → text    │   actionCode + reply     │   - Match intent         │
│  - Execute action local  │ ◄─────────────────────── │   - LLM rescue if no-match│
│  - TTS: reply → speech   │                          │   - Pick reply text      │
└──────────────────────────┘                          └──────────────────────────┘
```

**Trách nhiệm**:
| Phần | Thuộc về |
|---|---|
| ASR (mic → text) | App GT365 |
| Match intent + LLM rescue | Server |
| Pick reply text Tiếng Việt tự nhiên | Server |
| Execute UI action (mở màn, bật radio, navigate…) | App GT365 |
| TTS (reply → giọng nói) | App GT365 |

**Base URL**:
```
https://gt365-handfree.vnekyc.vn
```

---

## 2. Endpoint chính

### `POST /api/handfree/command`

App gửi text user vừa nói, nhận về action code + reply.

#### Request

**Headers**
| Key | Value |
|---|---|
| `Content-Type` | `application/json` |
| `Authorization` | `Bearer <token>` *(production, khuyến nghị)* |

**Body**:

```json
{
  "text": "phát nhạc cho mình",
  "screen": "home",
  "pending": null,
  "context": {
    "plate": "30H12345",
    "channelName": "VOV Giao thông",
    "routeOrigin": "Hà Nội",
    "routeDest": "Lạng Sơn",
    "notificationCount": 3,
    "nearestGasDistance": "450 mét"
  },
  "recentActions": [
    { "actionCode": "OPEN_HOME_SCREEN", "msAgo": 8000 }
  ]
}
```

**Schema**:

| Field | Type | Required | Mô tả |
|---|---|---|---|
| `text` | string | ✅ | Câu user vừa nói (từ ASR) hoặc gõ tay. Không cần normalize, không cần trim. |
| `screen` | string | ✅ | Màn hình app đang hiển thị. Xem §6 cho danh sách `ScreenId` hợp lệ. |
| `pending` | object \| null | optional | Nếu user đang ở trạng thái xác nhận (vừa nhận response `type:"confirm"` ở turn trước), gửi lại object pending để server biết. |
| `context` | object | optional | Slot động để personalize reply. Server interpolate `{plate}`, `{channelName}`,…vào câu phản hồi. |
| `recentActions` | array | optional | Tối đa 3 action gần nhất user đã thực hiện. Giúp server debounce + cải thiện độ chính xác LLM. |
| `hotspotAlertEnabled` | boolean | **khuyến nghị** | Trạng thái cảnh báo điểm nóng hiện tại trong app. Bắt buộc phải gửi nếu muốn server phát hiện no-op cho lệnh bật/tắt cảnh báo. Alias được chấp nhận: `hotspotAlert`, `violationAlertEnabled`, `alertEnabled`, và bản trong `context` (`context.hotspotAlert`,…). |
| `radioPlaying` | boolean | optional | Radio đang phát hay không. Dùng để phát hiện no-op/clarification cho `RADIO_PLAY` / `RADIO_PAUSE`. Cũng chấp nhận `context.radioPlaying`. |
| `currentChannelId` | string | optional | ID kênh đang phát, để server tính kênh tiếp/trước. Cũng chấp nhận `context.currentChannelId`. |
| `channels` | array | optional | Danh sách kênh `{ id, name }` của app — override danh sách mặc định của server khi match kênh theo tên. |
| `consecutiveFallbacks` | number | optional | Số lần fallback liên tiếp phía client, để server quyết định hỏi lại hay đóng trợ lý. |

> **Lưu ý trạng thái bật/tắt**: server chỉ so trạng thái khi client thực sự gửi field lên. Nếu thiếu `hotspotAlertEnabled`, server không biết cảnh báo đang bật hay tắt nên sẽ hỏi xác nhận (`type:"confirm"`) kể cả khi trạng thái đã đúng.

**`pending`** object:
| Field | Type | Mô tả |
|---|---|---|
| `intentCode` | string | Intent đang chờ xác nhận, ví dụ `"VIOLATION_ALERT_OFF"`. |
| `originalText` | string | Text gốc user nói (lấy từ response trước). |

**`context`** object (mọi field optional):
| Field | Type | Mô tả |
|---|---|---|
| `plate` | string | Biển số xe mặc định, ví dụ `"30H12345"`. |
| `channelName` | string | Tên kênh radio đang phát. |
| `routeOrigin` | string | Điểm xuất phát của lộ trình. |
| `routeDest` | string | Điểm đến của lộ trình. |
| `notificationCount` | number | Số thông báo chưa đọc. |
| `nearestGasDistance` | string | Khoảng cách trạm xăng gần nhất. |
| `hotspotAlert` | boolean | Trạng thái cảnh báo điểm nóng (tương đương `hotspotAlertEnabled` ở top-level). |
| `radioPlaying` | boolean | Trạng thái radio (tương đương `radioPlaying` ở top-level). |

---

#### Response

**`200 OK`** — server trả về 1 trong 4 `type`:

##### 2.1 `type: "action"` — Lệnh hợp lệ, app thực hiện ngay

```json
{
  "type": "action",
  "reply": "Mình bật Radio GT365 cho bạn rồi đây, bạn nghe thoải mái nha.",
  "action": {
    "code": "PLAY_RADIO",
    "nextScreen": "radio"
  },
  "meta": {
    "intentCode": "RADIO_PLAY",
    "confidence": 0.93,
    "source": "llm",
    "latencyMs": 1305
  }
}
```

App cần:
1. **Đọc `reply` qua TTS** ngay.
2. **Thực thi `action.code`** (xem §5 cho mapping action → UI behavior).
3. Nếu có `action.nextScreen` → navigate sang màn hình đó.

##### 2.1.1 `action.target` / `action.value` / `state` — đồng bộ tên field với app

Với các lệnh bật/tắt toggle, response nói thẳng **toggle nào cần ghi và ghi giá trị gì** — app không phải tự map từ `action.code`. Tên field trả về trùng với tên field ở request (`hotspotAlertEnabled`) để hai chiều đọc giống nhau:

```json
{
  "type": "action",
  "reply": "Mình tắt cảnh báo điểm nóng cho bạn rồi đấy, bạn lái cẩn thận giùm mình nhé.",
  "action": {
    "code": "DISABLE_VIOLATION_ALERTS",
    "target": "hotspotAlertEnabled",
    "value": false
  },
  "state": { "hotspotAlertEnabled": false }
}
```

| Field | Có ở | Ý nghĩa |
|---|---|---|
| `action.target` | chỉ action ghi toggle | Tên field trong app cần ghi. Hiện chỉ có `"hotspotAlertEnabled"`. |
| `action.value` | chỉ action ghi toggle | Giá trị cần ghi (`true`/`false`). App chỉ việc `hotspotAlertEnabled = value`. |
| `state.hotspotAlertEnabled` | **mọi** response (`action`/`confirm`/`noop`/`clarification`/`fallback`) | Trạng thái toggle mà app **nên có sau khi xử lý response này**. Với action bật/tắt là giá trị mới; các type còn lại là giá trị hiện tại app vừa gửi lên. Dùng để đối chiếu, phát hiện lệch state giữa app và server. |

- `action.code` **giữ nguyên** tên cũ (`ENABLE_VIOLATION_ALERTS` / `DISABLE_VIOLATION_ALERTS`) → app bản cũ không bị vỡ.
- `state` bị **bỏ khỏi response** nếu request không gửi trạng thái lên (server không đoán mò).
- Action không liên quan toggle (ví dụ `OPEN_HOME_SCREEN`) thì không có `target`/`value`, nhưng vẫn có `state` để app đối chiếu.

##### 2.2 `type: "confirm"` — Lệnh nguy hiểm, cần user xác nhận

```json
{
  "type": "confirm",
  "reply": "Mình tắt cảnh báo cho bạn nhé?",
  "pending": {
    "intentCode": "VIOLATION_ALERT_OFF",
    "originalText": "tắt cảnh báo"
  },
  "meta": {
    "intentCode": "VIOLATION_ALERT_OFF",
    "confidence": 1.0,
    "source": "matcher",
    "latencyMs": 12
  }
}
```

App cần:
1. **Đọc `reply` qua TTS** (đây là câu hỏi xác nhận).
2. **Lưu lại `pending` object**.
3. Khi user nói tiếp `"đồng ý"` / `"không"`, gọi lại API với `pending` đã lưu.

Server xử lý turn confirm tiếp theo:
- User nói `"đồng ý"` / `"ok"` / `"ừ"` / `"đúng"` → `type:"action"` với action thực sự.
- User nói `"không"` / `"hủy"` / `"thôi"` → `type:"action"` với `code:"CANCEL_PENDING"`, app chỉ cần đọc reply rồi quên `pending`.

##### 2.3 `type: "noop"` — Lệnh OK nhưng app đang ở trạng thái đó rồi

```json
{
  "type": "noop",
  "reply": "Cảnh báo điểm nóng đang tắt sẵn rồi đó, bạn cần bật lại thì bảo mình nha.",
  "noopMeta": {
    "openMicAfterReply": true,
    "silenceTimeoutSeconds": 5
  },
  "state": { "hotspotAlertEnabled": false },
  "meta": {
    "intentCode": "VIOLATION_ALERT_OFF",
    "confidence": 1.0,
    "source": "noop",
    "latencyMs": 8
  }
}
```

App cần:
1. **Chỉ đọc `reply` qua TTS**.
2. **KHÔNG** thực thi action nào (vì state đã đúng rồi).
3. **KHÔNG** lưu `pending` — đây không phải turn xác nhận, tuyệt đối không hỏi "bạn có muốn…?" thêm lần nữa.
4. Nếu `noopMeta.openMicAfterReply = true` → mở mic lại (quay về `listening`) và chờ tối đa `noopMeta.silenceTimeoutSeconds` giây; im lặng thì đóng trợ lý.

**Bảng hành vi lệnh bật/tắt cảnh báo điểm nóng** (server dựa hoàn toàn vào `hotspotAlertEnabled` app gửi lên):

| Trạng thái trong app | User nói | Response | App làm gì |
|---|---|---|---|
| Đang BẬT | "bật cảnh báo" | `noop` — "Cảnh báo điểm nóng đã bật rồi mà…" | TTS reply → mở mic → `listening` |
| Đang BẬT | "tắt cảnh báo" | `confirm` — "Mình tắt cảnh báo điểm nóng cho bạn nhé?" | TTS reply → lưu `pending` → `confirming` |
| Đang TẮT | "tắt cảnh báo" | `noop` — "Cảnh báo điểm nóng đã tắt rồi mà…" | TTS reply → mở mic → `listening` |
| Đang TẮT | "bật cảnh báo" | `confirm` — "Mình bật cảnh báo điểm nóng cho bạn nhé?" | TTS reply → lưu `pending` → `confirming` |
| Không gửi state | bất kỳ | `confirm` | Server không đoán mò → luôn hỏi xác nhận |

##### 2.4 `type: "fallback"` — Server không hiểu lệnh

```json
{
  "type": "fallback",
  "reply": "Hửm, mình chưa rõ lệnh này, bạn nói lại ngắn hơn giúp mình nhé.",
  "suggestions": ["mở radio", "tra cứu phạt nguội", "báo kẹt xe"],
  "meta": {
    "intentCode": null,
    "confidence": 0,
    "source": "fallback",
    "latencyMs": 1450
  }
}
```

App cần:
1. **Đọc `reply` qua TTS**.
2. Optionally hiển thị `suggestions` dưới dạng chip để user tap (nếu UI có chỗ).
3. Giữ trạng thái listening để user nói lại.

---

#### Error responses

| HTTP | Body | Khi nào |
|---|---|---|
| `400 Bad Request` | `{"error":"invalid-body"}` | Thiếu `text` hoặc `screen`. |
| `429 Too Many Requests` | `{"error":"rate-limited"}` | Vượt 60 req/phút/client. |
| `503 Service Unavailable` | `{"error":"llm-disabled"}` | LLM rescue tắt, nhưng vẫn dùng được matcher offline. Server vẫn cố trả `type:"action"`/`"fallback"` nếu match offline được. |

---

## 3. Đầy đủ flow ví dụ

### 3.1 Flow đơn giản (lệnh khớp ngay)

**App ↔ Server** trên màn hình `home`:

```
App  → POST /api/handfree/command
      { "text": "mở radio", "screen": "home" }

Server → 200
      {
        "type": "action",
        "reply": "Mình mở Radio cho bạn rồi đó, bạn muốn nghe kênh nào mình bật liền cho nhé?",
        "action": { "code": "OPEN_RADIO_SCREEN", "nextScreen": "radio" },
        "meta": { "intentCode": "NAV_RADIO", "confidence": 1.0, "source": "matcher", "latencyMs": 5 }
      }
```

App: TTS reply + navigate to radio screen.

---

### 3.2 Flow LLM rescue (ASR sai)

```
App  → POST /api/handfree/command
      { "text": "phát nhàn cho mình đi", "screen": "home" }

Server → 200 (sau ~1.3s vì LLM call)
      {
        "type": "action",
        "reply": "Mình bật Radio GT365 cho bạn rồi đây, bạn nghe thoải mái nha.",
        "action": { "code": "PLAY_RADIO", "nextScreen": "radio" },
        "meta": { "intentCode": "RADIO_PLAY", "confidence": 0.86, "source": "llm", "latencyMs": 1305 }
      }
```

LLM phát hiện `"phát nhàn"` ≈ `"phát radio"` → trả về action chuẩn.

---

### 3.3 Flow confirm 2 turn (lệnh nguy hiểm)

**Turn 1** — user nói:
```
App  → POST /api/handfree/command
      { "text": "tắt cảnh báo", "screen": "home" }

Server → 200
      {
        "type": "confirm",
        "reply": "Mình tắt cảnh báo cho bạn nhé?",
        "pending": { "intentCode": "VIOLATION_ALERT_OFF", "originalText": "tắt cảnh báo" },
        "meta": { "intentCode": "VIOLATION_ALERT_OFF", "confidence": 1.0, "source": "matcher", "latencyMs": 6 }
      }
```

App: TTS reply, lưu `pending`.

**Turn 2** — user trả lời:
```
App  → POST /api/handfree/command
      {
        "text": "đồng ý",
        "screen": "home",
        "pending": { "intentCode": "VIOLATION_ALERT_OFF", "originalText": "tắt cảnh báo" }
      }

Server → 200
      {
        "type": "action",
        "reply": "Mình tắt cảnh báo cho bạn rồi đấy, bạn lái cẩn thận giùm mình nhé.",
        "action": { "code": "DISABLE_VIOLATION_ALERTS" },
        "meta": { "intentCode": "VIOLATION_ALERT_OFF", "confidence": 1.0, "source": "confirm", "latencyMs": 4 }
      }
```

App: TTS reply, thực thi DISABLE_VIOLATION_ALERTS (tắt toggle cảnh báo trong app), quên `pending`.

---

### 3.4 Flow no-op (đang ở trạng thái đó rồi)

```
App  → POST /api/handfree/command
      {
        "text": "phát radio",
        "screen": "radio",
        "context": { "channelName": "VOV Giao thông" }
      }
      (radio đã đang phát)

Server → 200
      {
        "type": "noop",
        "reply": "Đài đang phát VOV Giao thông rồi mà, bạn muốn đổi kênh khác không?",
        "meta": { "intentCode": "RADIO_PLAY", "confidence": 1.0, "source": "matcher", "latencyMs": 7 }
      }
```

App: chỉ TTS reply, không action.

> **Quan trọng**: server chỉ phát hiện no-op khi app gửi trạng thái hiện tại lên. Cụ thể:
> - Radio: `radioPlaying` (+ `context.channelName`, `currentChannelId`).
> - Cảnh báo điểm nóng: `hotspotAlertEnabled` (hoặc `context.hotspotAlert`).
> - Ngoài ra `recentActions` giúp debounce khi user lặp lệnh trong 30 giây.
>
> Ví dụ request cho lệnh cảnh báo:
> ```json
> {
>   "text": "tắt cảnh báo",
>   "screen": "home",
>   "hotspotAlertEnabled": false,
>   "context": { "hotspotAlert": false }
> }
> ```
> → server trả `type:"noop"` ("Cảnh báo đang tắt rồi…") thay vì hỏi xác nhận.

---

### 3.5 Flow fallback (server không hiểu)

```
App  → POST /api/handfree/command
      { "text": "hôm nay trời đẹp quá", "screen": "home" }

Server → 200
      {
        "type": "fallback",
        "reply": "Hửm, mình chưa rõ lệnh này, bạn nói lại ngắn hơn giúp mình nhé.",
        "suggestions": ["mở radio", "tra cứu phạt nguội", "báo kẹt xe"],
        "meta": { "intentCode": null, "confidence": 0, "source": "fallback", "latencyMs": 1450 }
      }
```

App: TTS reply, optionally hiển thị suggestions để user tap khi tiện.

---

## 4. Danh sách ScreenId

App cần truyền `screen` chính xác cho mỗi request. Danh sách hợp lệ:

| ScreenId | Mô tả |
|---|---|
| `home` | Trang chủ |
| `radio` | Màn hình Radio (danh sách kênh) |
| `radioOnAir` | Đang trong phòng trò chuyện MC |
| `utilities` | Tiện ích |
| `community` | Cộng đồng |
| `profile` | Tài khoản |
| `notifications` | Thông báo |
| `route` | Lộ trình |
| `fineLookup` | Tra cứu phạt nguội |
| `fineResult` | Kết quả phạt nguội |
| `insurance` | Bảo hiểm xe |
| `displaySettings` | Cài đặt hiển thị (màn "Thông báo & Hiển thị") |
| `permissionSettings` | Quản lý quyền |

⚠️ **Tiện ích là `utilities` (số nhiều)**, không phải `utility` — và **không phải** `displaySettings`.

**Chuẩn hoá tên màn hình**: server bỏ qua hoa/thường và dấu `-` `_` khi so khớp, nên `radioOnAir` = `radio_on_air` = `RADIOONAIR`. Ngoài ra chấp nhận các alias thường gặp:

| Client gửi | Server hiểu là |
|---|---|
| `utility`, `util`, `tienich` | `utilities` |
| `main`, `trangchu` | `home` |
| `notification`, `thongbao` | `notifications` |
| `account`, `taikhoan` | `profile` |
| `setting`, `settings`, `displaySetting`, `notificationSettings` | `displaySettings` |
| `permission`, `permissionSetting` | `permissionSettings` |
| `onAir`, `radioRoom` | `radioOnAir` |
| `fine` | `fineLookup` |

Tên hoàn toàn lạ → server ghi cảnh báo vào log rồi **tạm coi là `home`** và vẫn trả lời bình thường (thà trả lời hơi lệch ngữ cảnh còn hơn để tài xế nói mà bot im lặng). Chỉ khi **thiếu hẳn** `screen` mới trả `400 invalid-body`.

---

## 5. Danh sách ActionCode

App cần handle mỗi action code khi nhận trong response. Bảng đầy đủ:

### 5.1 Trợ lý
| ActionCode | App phải làm |
|---|---|
| `OPEN_ASSISTANT` | Hiển thị overlay trợ lý |
| `CLOSE_ASSISTANT` | Đóng overlay trợ lý |
| `SHOW_HELP` | Hiển thị danh sách lệnh gợi ý |

### 5.2 Navigation
| ActionCode | App phải làm |
|---|---|
| `OPEN_HOME_SCREEN` | Navigate về home |
| `OPEN_RADIO_SCREEN` | Navigate sang radio |
| `OPEN_UTILITIES_SCREEN` | Navigate sang utilities |
| `OPEN_COMMUNITY_SCREEN` | Navigate sang community |
| `OPEN_PROFILE_SCREEN` | Navigate sang profile |
| `OPEN_NOTIFICATIONS_SCREEN` | Navigate sang notifications |
| `OPEN_ROUTE_SCREEN` | Navigate sang route |
| `OPEN_FINE_LOOKUP` | Navigate sang fineLookup |
| `OPEN_FINE_LOOKUP_WITH_DEFAULT_VEHICLE` | Mở fineLookup + auto-fill biển xe default |
| `OPEN_INSURANCE_SCREEN` | Navigate sang insurance |
| `GO_BACK` | Back navigation |

### 5.3 Danh sách / Cuộn
| ActionCode | App phải làm |
|---|---|
| `SCROLL_DOWN` | Cuộn xuống ~1 màn |
| `SCROLL_UP` | Cuộn lên ~1 màn |
| `SELECT_FIRST_ITEM` | Chọn mục đầu tiên trong danh sách hiện tại |
| `SELECT_SECOND_ITEM` | Chọn mục thứ 2 |

### 5.4 Route
| ActionCode | App phải làm |
|---|---|
| `SET_ROUTE_HN_LS` | Đặt route Hà Nội → Lạng Sơn |
| `EDIT_ROUTE_ORIGIN` | Mở ô input điểm đi |
| `EDIT_ROUTE_DESTINATION` | Mở ô input điểm đến |
| `CLEAR_ROUTE` | Xóa route hiện tại |

### 5.5 Cảnh báo
| ActionCode | App phải làm |
|---|---|
| `READ_DRIVE_ALERTS` | Hiển thị + đọc cảnh báo phía trước |
| `REPEAT_DRIVE_ALERT` | Đọc lại cảnh báo gần nhất |
| `ENABLE_SPEED_ALERT` | Bật toggle cảnh báo tốc độ |
| `DISABLE_SPEED_ALERT` | Tắt toggle cảnh báo tốc độ |
| `ENABLE_HOTSPOT_ALERT` | Bật toggle cảnh báo điểm nóng |
| `ENABLE_VIOLATION_ALERTS` | Bật tất cả cảnh báo vi phạm |
| `DISABLE_VIOLATION_ALERTS` | Tắt tất cả cảnh báo vi phạm |

### 5.6 Báo cáo phản ánh
| ActionCode | App phải làm |
|---|---|
| `OPEN_REPORT_DRAFT` | Mở form phản ánh |
| `DRAFT_TRAFFIC_JAM_REPORT` | Tạo draft phản ánh kẹt xe |
| `DRAFT_ACCIDENT_REPORT` | Tạo draft phản ánh tai nạn |
| `DRAFT_OBSTACLE_REPORT` | Tạo draft phản ánh chướng ngại vật |
| `SUBMIT_REPORT` | Gửi phản ánh |

### 5.7 Radio
| ActionCode | App phải làm |
|---|---|
| `PLAY_RADIO` | Bắt đầu phát radio (kênh hiện tại) |
| `PAUSE_RADIO` | Tạm dừng radio |
| `PLAY_NEXT_CONTENT` | Sang nội dung kế tiếp |
| `PLAY_PREVIOUS_CONTENT` | Quay lại nội dung trước |
| `SWITCH_NEXT_CHANNEL` | Chuyển sang kênh kế |
| `SWITCH_PREV_CHANNEL` | Chuyển về kênh trước |
| `OPEN_RADIO_TALK` | Mở phòng trò chuyện MC |
| `MUTE_MIC` | Tắt mic trong phòng MC |
| `UNMUTE_MIC` | Bật mic trong phòng MC |
| `ENABLE_SPEAKER` | Bật loa ngoài |
| `LEAVE_RADIO_ROOM` | Rời phòng MC |
| `PLAY_ROAD_STORY` | Phát "Chuyện dọc đường" |
| `PLAY_FRIENDS_CONTENT` | Phát "Kết bạn bốn phương" |

### 5.8 Phạt nguội
| ActionCode | App phải làm |
|---|---|
| `RUN_FINE_LOOKUP` | Chạy tra cứu phạt nguội |
| `OPEN_VEHICLE_SELECTOR` | Mở picker chọn xe |
| `OPEN_FINE_RESULT_LIST` | Mở danh sách kết quả phạt nguội |
| `OPEN_FINE_DETAIL` | Mở chi tiết 1 lỗi |
| `OPEN_FINE_PAYMENT_GUIDE` | Mở hướng dẫn nộp phạt |
| `OPEN_FINE_SUBSCRIBE` | Mở form đăng ký thông báo phạt nguội |

### 5.9 Tiện ích / Bảo hiểm
| ActionCode | App phải làm |
|---|---|
| `OPEN_RESCUE_SERVICE` | Focus card cứu hộ |
| `OPEN_GAS_SERVICE` | Focus card trạm xăng |
| `OPEN_REGISTRATION_SERVICE` | Focus card đăng kiểm |
| `OPEN_CAR_VALUATION` | Focus card định giá xe |
| `FOCUS_INSURANCE_TNDS` | Focus gói TNDS |
| `FOCUS_INSURANCE_PHYSICAL` | Focus gói vật chất |
| `START_INSURANCE_BUY` | Mở flow mua bảo hiểm |

### 5.10 Cộng đồng / Profile
| ActionCode | App phải làm |
|---|---|
| `ENTER_FIRST_COMMUNITY` | Vào nhóm đầu tiên |
| `JOIN_COMMUNITY` | Gửi yêu cầu join nhóm |
| `OPEN_VEHICLE_MANAGEMENT` | Mở quản lý phương tiện |
| `OPEN_DISPLAY_SETTINGS` | Mở cài đặt hiển thị |
| `OPEN_PERMISSION_SETTINGS` | Mở quản lý quyền |

### 5.11 Quyền hệ thống
| ActionCode | App phải làm |
|---|---|
| `ENABLE_LOCATION_PERMISSION` | Bật quyền vị trí |
| `DISABLE_LOCATION_PERMISSION` | Tắt quyền vị trí |
| `ENABLE_MIC_PERMISSION` | Bật quyền mic |
| `DISABLE_MIC_PERMISSION` | Tắt quyền mic |

### 5.12 Confirm flow
| ActionCode | App phải làm |
|---|---|
| `CANCEL_PENDING` | User đã huỷ confirm, chỉ TTS reply, quên `pending` |

> **Convention**: Mọi ActionCode đều SCREAMING_SNAKE_CASE. App nên dùng `enum`/`sealed class` để type-safe.

---

## 6. cURL test nhanh

```bash
curl -X POST https://gt365-handfree.vnekyc.vn/api/handfree/command \
  -H 'Content-Type: application/json' \
  -d '{
    "text": "phát nhạc cho mình đi",
    "screen": "home",
    "context": { "plate": "30H12345" }
  }'
```

Kỳ vọng:
```json
{
  "type": "action",
  "reply": "Mình bật Radio GT365 cho bạn rồi đây, bạn nghe thoải mái nha.",
  "action": { "code": "PLAY_RADIO", "nextScreen": "radio" },
  "meta": { "intentCode": "RADIO_PLAY", "confidence": 0.86, "source": "llm", "latencyMs": 1305 }
}
```

---

## 7. Best practices

### 7.1 Luôn truyền `context` đầy đủ

Reply tự nhiên hay khô là phụ thuộc vào context. Truyền càng đầy đủ càng tốt:
- `plate`: để câu phản hồi phạt nguội xưng đúng biển số xe user.
- `channelName`: để câu radio đọc tên kênh.
- `notificationCount`: để bot nói `"Bạn có 3 thông báo mới…"`
- `nearestGasDistance`: để bot nói `"Trạm xăng cách 450 mét"`

### 7.2 Truyền `recentActions` để debounce

Nếu user vừa nói `"phát radio"` xong, 3s sau lại nói `"phát radio"`, server muốn trả no-op `"Đài đang phát rồi mà"` nhưng cần biết action trước đó. Gửi tối đa 3 action gần nhất:

```json
"recentActions": [
  { "actionCode": "PLAY_RADIO", "msAgo": 3200 },
  { "actionCode": "OPEN_RADIO_SCREEN", "msAgo": 5100 }
]
```

### 7.3 Timeout client 8 giây

LLM rescue mất tới 3s. Cộng thêm network + buffer, set timeout HTTP client ≥ 8000ms. Nếu fail (network/timeout) → fallback offline (hiển thị "Có lỗi kết nối, bạn thử lại nhé").

### 7.4 Xử lý `type:"confirm"` chuẩn

KHÔNG auto-execute action khi nhận `type:"confirm"`. Đợi user nói tiếp `"đồng ý"`/`"không"`. Nếu user nói lệnh KHÁC trong khi đang pending → gửi request mới có `pending` hiện tại, server sẽ:
- Nếu match `"đồng ý"`/`"không"` → resolve pending.
- Nếu match lệnh mới khác → cancel pending, exec lệnh mới (server tự handle).

### 7.5 KHÔNG cache response ở client

Server đã cache 5 phút theo `(text, screen)`. Client cache thêm sẽ làm context (state) bị lệch.

### 7.6 Hiển thị `meta.source` cho debug

`meta.source` cho biết server lấy intent từ đâu:
- `"matcher"` — offline match, latency < 50ms, độ tin cậy cao.
- `"llm"` — LLM rescue, latency 1-3s, có thể sai context.
- `"confirm"` — turn xác nhận.
- `"noop"` — state đã đúng rồi.
- `"fallback"` — không match được.

Có thể log `meta.latencyMs` để monitor performance.

---

## 8. Performance & limits

| Metric | Giá trị |
|---|---|
| Matcher offline latency (p50) | ~5-15ms |
| LLM rescue latency (p50) | ~1,000-1,500ms |
| LLM rescue latency (p95) | ~2,500ms |
| Server cache TTL | 5 phút |
| Rate limit | 60 req/phút/client |
| Max body size | 64 KB |
| Confirm pending TTL (client-side) | nên 60s, sau đó tự reset |

---

## 9. Security

- **Auth**: production yêu cầu `Authorization: Bearer <token>` qua API gateway/reverse proxy. Endpoint dev hiện mở cho việc test.
- **PII trong `text`**: server có thể log câu user nói. Production cần config `LLM_INTENT_LOG=false` hoặc mask sensitive content.
- **Rate limit**: 60 req/phút/client (IP hoặc token). Vượt → 429.

---

## 10. Versioning

Hiện endpoint: `/api/handfree/command` (v0.1, unversioned).

Quy ước khi breaking change:
- Thêm prefix `/v1/`, `/v2/` (ví dụ `/api/v2/handfree/command`).
- Giữ `v1` tối thiểu 3 tháng song song với `v2`.
- Header `X-Handfree-API-Version: 1` để client tự đánh dấu.

**Changelog**:
- **v0.1** (current): endpoint duy nhất với 4 response type (action/confirm/noop/fallback), context interpolation, LLM rescue tự động.
- **v0.2** (planned): streaming response (SSE) cho LLM rescue để giảm perceived latency.
