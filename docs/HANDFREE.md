# Tính năng Handfree — Chi tiết kỹ thuật & vận hành

> Doc này mô tả sâu về tính năng **handfree** (điều khiển không chạm) của GT365 Handfree MVP: triết lý thiết kế, kiến trúc, luồng xử lý voice end-to-end, tập lệnh, lớp an toàn khi lái xe, và hướng dẫn mở rộng / debug.
>
> Đối tượng đọc: developer FE/BE, BA, QA, người tích hợp ASR/TTS.

---

## Mục lục

1. [Vì sao có Handfree?](#1-vì-sao-có-handfree)
2. [Tổng quan kiến trúc](#2-tổng-quan-kiến-trúc)
3. [Luồng xử lý một lệnh thoại (end-to-end)](#3-luồng-xử-lý-một-lệnh-thoại-end-to-end)
4. [Voice Engine (FE)](#4-voice-engine-fe)
5. [Voice Bridge (BE)](#5-voice-bridge-be)
6. [Tập lệnh (Command catalog)](#6-tập-lệnh-command-catalog)
7. [Lớp an toàn khi lái xe](#7-lớp-an-toàn-khi-lái-xe)
8. [Đa ngôn ngữ (VI / Hmong)](#8-đa-ngôn-ngữ-vi--hmong)
9. [UX của Assistant Overlay](#9-ux-của-assistant-overlay)
10. [Mở rộng: thêm lệnh / màn hình mới](#10-mở-rộng-thêm-lệnh--màn-hình-mới)
11. [Test & Debug](#11-test--debug)
12. [Giới hạn đã biết & Roadmap](#12-giới-hạn-đã-biết--roadmap)

---

## 1. Vì sao có Handfree?

Tài xế đang lái xe **không thể** (và không nên) chạm vào màn hình điện thoại để:

- Mở radio, đổi bài, bật/tắt loa.
- Tra cứu phạt nguội, gọi cứu hộ, tìm cây xăng.
- Đặt / xoá lộ trình.
- Báo cáo sự cố giao thông (kẹt xe, tai nạn, vật cản).

Mục tiêu của Handfree: **mọi tác vụ phổ biến trong app GT365 phải làm được bằng giọng nói**, đồng thời đảm bảo:

- **An toàn**: không cho phép thao tác nguy hiểm khi đang chạy nếu chưa xác nhận.
- **Phản hồi tức thời**: hiển thị transcript dần (interim) + TTS xác nhận.
- **Không nhập nhằng**: cùng một câu chỉ làm điều phù hợp với màn hình đang xem.

---

## 2. Tổng quan kiến trúc

```
┌────────────────────────┐         ┌────────────────────────┐         ┌────────────────────┐
│     Browser (FE)       │         │   Voice Bridge (BE)     │         │   Upstream voice    │
│  React 19 + Vite        │         │   Node + Express + ws   │         │   services          │
│                         │         │                         │         │                     │
│  Mic ──► AudioWorklet ──┼─ WS ───►│  /ws/asr  ──► gRPC  ──┼────────►│ ASR  103.253.20.28 │
│         (PCM16 16kHz)   │         │   asr-proxy.ts          │         │   :9112 (VI)        │
│                         │◄─ WS ───┤                         │◄────────│   :9113 (Hmong)     │
│  Transcript ◄──────     │  JSON   │                         │  text   │                     │
│                         │         │                         │         │                     │
│  Bot text ────────►     │─ WS ───►│  /ws/tts  ──► WS  ────┼────────►│ TTS 103.253.20.27   │
│                         │         │   tts-proxy.ts          │         │   :8767             │
│  PCM chunks ◄───────    │◄─ WS ───┤                         │◄────────│                     │
│  Web Audio API plays    │  base64 │                         │  audio  │                     │
└────────────────────────┘         └────────────────────────┘         └────────────────────┘
```

**Tách 2 tầng** vì 2 lý do:

1. **Bảo mật**: `ASR_TOKEN` + `TTS_API_KEY` chỉ tồn tại ở BE.
2. **Chuyển giao protocol**: ASR upstream là gRPC (browser không gọi trực tiếp được), TTS là WS thuần.

Vite dev server proxy `/api`, `/ws/asr`, `/ws/tts` sang BE qua `VITE_VOICE_BRIDGE_TARGET`.

---

## 3. Luồng xử lý một lệnh thoại (end-to-end)

Ví dụ: tài xế nói **"Mở radio"** trong khi đang ở Trang chủ.

```
1. User nhấn nút mic (hoặc trigger tự động) trên Assistant Overlay
2. FE: AsrClient gọi getUserMedia → AudioWorklet → downsample 48kHz→16kHz → PCM16LE
3. FE: gửi binary frames qua WS /ws/asr
4. BE: asr-proxy mở gRPC stream tới ASR_GRPC_URI, kèm metadata (token, timeout, language)
5. BE: forward audio bytes vào gRPC stream
6. ASR upstream trả TextReply (interim + final) → BE forward về FE dưới dạng JSON
7. FE: hiển thị transcript interim ngay trong overlay
8. FE: khi có transcript final → normalizer.ts chuẩn hoá (bỏ dấu, lower, trim, ...)
9. FE: matcher.ts tính score giữa transcript chuẩn hoá và từng command phrase
   → chọn top match có score >= threshold
10. FE: lookup intent → screenActions.ts(intent, currentScreen)
    → resolve thành ActionCode hoặc null nếu không hợp lệ ở màn hình này
11. FE: chạy action handler → dispatch state (chuyển sang RadioScreen)
12. FE: sinh câu phản hồi (vd "Đã mở radio") → TtsClient gửi qua WS /ws/tts
13. BE: tts-proxy mở/giữ WS upstream, gửi config (voice, tempo, sample rate) + text
14. TTS upstream stream chunks PCM base64 → BE forward về FE
15. FE: decode base64 → AudioBuffer → AudioContext.play() (Web Audio API)
16. Assistant Overlay hiện nhãn "Đã mở radio" + animation đang phát
```

---

## 4. Voice Engine (FE)

Toàn bộ ở `src/voice/`.

### 4.1 `types.ts`
Khai báo các union type chính:

- `ScreenId` — id của các màn hình (`HOME`, `RADIO`, `UTILITIES`, `FINE_LOOKUP`, ...).
- `IntentCode` — mã ý định, ví dụ `NAV_RADIO`, `LIST_SCROLL_DOWN`, `ROUTE_CLEAR`.
- `ActionCode` — hành động UI cụ thể được dispatch.
- `Danger` — `'safe' | 'confirm' | 'blockedWhileDriving'`.

### 4.2 `commands.ts`
Mảng các `CommandDef`:

```ts
{
  intent: 'NAV_RADIO',
  phrases: ['mở radio', 'vào radio', 'bật radio', ...],
  allowedScreens: ['HOME', 'UTILITIES', 'PROFILE', ...],
  danger: 'safe',
  priority: 1.0
}
```

### 4.3 `normalizer.ts`
Chuẩn hoá tiếng Việt trước khi so khớp:

- Lower-case, trim, gộp khoảng trắng.
- Bỏ dấu Unicode (NFD + remove combining marks) — tuỳ chế độ; matcher giữ song song bản có-dấu để cho điểm thưởng.
- Map biến thể chính tả phổ biến (vd "ô tô" / "oto").

### 4.4 `matcher.ts`
Thuật toán matching (đại ý):

1. Với mỗi command, lấy `phrases`.
2. Tính token-overlap + edit-distance bonus giữa transcript và mỗi phrase.
3. Cộng `priority` boost.
4. Trả về top-1 nếu score ≥ ngưỡng (~0.6); kèm `confidence`.

### 4.5 `screenActions.ts`
Bảng `intent × screen → action`. Vai trò: **disambiguate**.

Ví dụ:
- `LIST_SELECT_FIRST` chỉ có nghĩa ở `FINE_LOOKUP` step "chọn xe", không có ở `HOME`.
- `MEDIA_PAUSE` chỉ chạy ở `RADIO`.

Nếu không có entry → bỏ qua + nói "Không thực hiện được lệnh này ở đây".

### 4.6 `asrClient.ts`
- Mở `WebSocket('/ws/asr')`.
- Bắt mic qua `navigator.mediaDevices.getUserMedia({ audio: true })`.
- AudioWorklet downsample 48k → 16k, đóng gói PCM16LE.
- Gửi binary frame liên tục; nhận JSON `{type: 'interim'|'final', text}`.
- Tự động reconnect khi đứt.

### 4.7 `ttsClient.ts`
- Mở `WebSocket('/ws/tts')`.
- Gửi config + text. Nhận chunks `{type: 'audio', data: base64}`.
- Decode base64 → Float32Array PCM → `AudioBuffer` → phát.
- Hỗ trợ huỷ phát giữa chừng (khi user nói tiếp).

### 4.8 `audioUtils.ts`
Tiện ích PCM: downsample, encode/decode base64, mix mono.

---

## 5. Voice Bridge (BE)

### 5.1 `index.ts`
- Khởi tạo Express, route `GET /api/voice-health`.
- Tạo `WebSocketServer` ở `noServer: true`.
- Bắt `upgrade` HTTP, route theo path:
  - `/ws/asr` → `attachAsrProxy(ws, query)`.
  - `/ws/tts` → `attachTtsProxy(ws, query)`.

### 5.2 `proto/streaming_voice.proto`
Định nghĩa RPC:

```proto
rpc SendVoice(stream VoiceRequest) returns (stream TextReply);
```

`VoiceRequest` mang audio PCM bytes. `TextReply` mang transcript + metadata.

### 5.3 `ws/asr-proxy.ts`
- Load proto bằng `@grpc/proto-loader`.
- Tạo gRPC client tới `ASR_GRPC_URI` (hoặc `ASR_HMONG_GRPC_URI` nếu `?lang=hmong`).
- Metadata gửi kèm: `authorization`, `silence_timeout`, `speech_timeout`, `speech_max`, `format`, `rate`.
- Forward 2 chiều: WS binary ↔ gRPC stream messages.
- Đóng đúng cách khi 1 trong 2 phía ngắt.

### 5.4 `ws/tts-proxy.ts`
- Mở WS upstream `TTS_WS_URL`, gửi handshake config.
- Buffer message từ FE cho tới khi upstream `ready`.
- Forward chunks audio (đã base64) ngược về FE.
- Hỗ trợ override `voice_id`, `tempo`, `resample_rate` qua query string.

### 5.5 Health endpoint
`GET /api/voice-health` trả:

```json
{
  "ok": true,
  "asr": { "uri": "...", "rate": 16000, "format": "S16LE", ... },
  "tts": { "url": "...", "voiceId": "phuongnhi-north", ... }
}
```

(Không trả token / api key.)

---

## 6. Tập lệnh (Command catalog)

> Khoảng 80+ lệnh, gom theo nhóm. Danh sách phrase chi tiết xem `src/voice/commands.ts`.

### Điều hướng (NAV)
| Intent | Câu mẫu |
|---|---|
| `NAV_HOME` | "Mở trang chủ", "Về trang chủ" |
| `NAV_RADIO` | "Mở radio", "Bật radio" |
| `NAV_UTILITIES` | "Vào tiện ích" |
| `NAV_PROFILE` | "Mở tài khoản", "Mở hồ sơ" |
| `NAV_NOTIFICATIONS` | "Mở thông báo" |
| `NAV_BACK` | "Quay lại" |

### Lộ trình (ROUTE)
| Intent | Câu mẫu | Danger |
|---|---|---|
| `ROUTE_OPEN` | "Mở lộ trình" | safe |
| `ROUTE_SET` | "Đặt lộ trình Hà Nội Lạng Sơn" | safe |
| `ROUTE_CLEAR` | "Xoá lộ trình" | **confirm** |

### Danh sách (LIST)
| Intent | Câu mẫu |
|---|---|
| `LIST_SCROLL_DOWN` / `UP` | "Cuộn xuống", "Cuộn lên" |
| `LIST_SELECT_FIRST` ... `THIRD` | "Chọn mục đầu tiên", "Chọn mục thứ hai" |

### Media (MEDIA)
| Intent | Câu mẫu |
|---|---|
| `MEDIA_PLAY` / `PAUSE` | "Phát radio", "Tạm dừng" |
| `MEDIA_NEXT` / `PREV` | "Bài tiếp theo", "Bài trước" |

### Báo cáo sự cố (REPORT)
| Intent | Câu mẫu |
|---|---|
| `REPORT_TRAFFIC_JAM` | "Báo kẹt xe" |
| `REPORT_ACCIDENT` | "Báo tai nạn" |
| `REPORT_OBSTACLE` | "Báo vật cản" |

### Cài đặt (SETTINGS)
| Intent | Câu mẫu |
|---|---|
| `SETTINGS_SPEED_ALERT_ON` / `OFF` | "Bật cảnh báo tốc độ" |

### Radio talk (TALK)
| Intent | Câu mẫu |
|---|---|
| `TALK_OPEN` | "Mở trò chuyện" |
| `TALK_MIC_OFF` / `ON` | "Tắt mic", "Bật mic" |
| `TALK_SPEAKER_ON` / `OFF` | "Bật loa", "Tắt loa" |

### Khác
| Intent | Câu mẫu |
|---|---|
| `HELP` | "Trợ giúp", "Tôi nói được gì" |

---

## 7. Lớp an toàn khi lái xe

Mỗi command có `danger`:

- `safe` — chạy ngay.
- `confirm` — assistant hỏi lại "Bạn xác nhận xoá lộ trình?" → chờ "có" / "không".
- `blockedWhileDriving` — chặn nếu state app phát hiện đang di chuyển (dành cho các action quá phức tạp).

Cơ chế xác nhận:

1. Khi gặp action `confirm`, FE chuyển sang trạng thái "đang chờ xác nhận".
2. TTS đọc câu hỏi.
3. ASR tiếp tục lắng nghe; matcher ưu tiên các phrase YES/NO trong cửa sổ chờ.
4. YES → thực thi; NO / timeout → huỷ.

---

## 8. Đa ngôn ngữ (VI / Hmong)

- Mặc định: tiếng Việt → `ASR_GRPC_URI`.
- Khi UI chọn Hmong → FE thêm `?lang=hmong` vào `/ws/asr` → BE chuyển sang `ASR_HMONG_GRPC_URI`.
- `ASR_HMONG_SPEECH_TIMEOUT` riêng vì phát âm Hmong dài hơn.
- Tập lệnh hiện tại tối ưu cho tiếng Việt; tiếng Hmong sẽ map intent qua transcript đã dịch (roadmap).

---

## 9. UX của Assistant Overlay

Floating overlay luôn hiển thị, gồm:

- **Mic button** — toggle ASR.
- **Trạng thái**: `idle / listening / thinking / speaking / error`.
- **Transcript box** — hiện interim (mờ) → final (đậm).
- **Bot reply** — text TTS đang đọc.
- **Hint** — gợi ý lệnh hợp lệ trên màn hình hiện tại (lấy từ `screenActions`).
- **Input simulator** — ô text để gõ tay test khi không có mic / khi debug matching.

---

## 10. Mở rộng: thêm lệnh / màn hình mới

### Thêm 1 lệnh thoại mới

1. Thêm `IntentCode` mới vào `src/voice/types.ts`.
2. Thêm entry `CommandDef` vào `src/voice/commands.ts` với `phrases` đa dạng (≥ 3 cách nói).
3. Thêm `ActionCode` (nếu cần action UI mới) vào `types.ts`.
4. Thêm mapping `intent × screen → action` vào `src/voice/screenActions.ts`.
5. Trong `App.tsx` (hoặc component liên quan), implement handler cho `ActionCode` mới.
6. Thêm câu phản hồi TTS phù hợp.
7. Test bằng input simulator trước, sau đó test bằng mic.

### Thêm 1 màn hình mới

1. Thêm `ScreenId` mới vào `types.ts`.
2. Tạo component màn hình.
3. Cập nhật `allowedScreens` cho các command nên hoạt động ở đó.
4. Thêm entry vào `screenActions.ts` cho intent ↔ action ở màn hình đó.

---

## 11. Test & Debug

### Health check
```bash
curl http://localhost:14673/api/voice-health
```

### Logs
```bash
tail -f logs/be.log    # voice bridge: gRPC errors, WS lifecycle
tail -f logs/fe.log    # vite, ASR transcripts (nếu bật log)
```

### Debug matching mà không cần mic
Dùng **Input simulator** ở Assistant Overlay → gõ câu cần test → quan sát:
- Transcript chuẩn hoá.
- Top match + score.
- Action được resolve (hoặc nil).

### Các lỗi thường gặp

| Triệu chứng | Nguyên nhân khả dĩ | Fix |
|---|---|---|
| `/api/voice-health` 502 | BE chưa chạy hoặc port khác | `./start.sh`, kiểm tra `BE_PORT` |
| ASR không trả transcript | Sai `ASR_TOKEN`, mạng chặn gRPC | Test gRPC bằng `grpcurl`, xem `logs/be.log` |
| TTS im lặng | Sai `TTS_API_KEY`, hoặc browser block autoplay | Mở DevTools console, kiểm tra AudioContext state, cần user gesture đầu tiên |
| Mic không bắt | Trang chạy http (không phải https/localhost) | Dùng `http://localhost:5175` (browser cho phép) hoặc cấu hình https |
| Lệnh đúng nhưng "không thực hiện được ở đây" | Thiếu mapping trong `screenActions.ts` | Bổ sung entry intent × screen |

---

## 12. Giới hạn đã biết & Roadmap

**Hiện trạng (MVP)**:

- Chưa có wake-word ("Hey GT365") — phải bấm mic.
- Tiếng Hmong: chỉ ASR, chưa có command catalog tương đương.
- Chưa có barge-in thực sự (cắt TTS giữa chừng khi user bắt đầu nói còn đơn giản).
- Không có persistence cho lịch sử lệnh.
- Confirm flow cứng nhắc — chưa hiểu các biến thể "ờ", "ừ", "đồng ý đi".

**Roadmap đề xuất**:

1. Tích hợp wake-word offline (Porcupine / Snowboy).
2. Logging / analytics: lưu transcript + intent + score để cải thiện matcher.
3. Định danh người nói (per-driver profile).
4. Cache TTS cho các câu phản hồi phổ biến để giảm độ trễ.
5. Tách `commands.ts` thành file YAML/JSON cho phép BA chỉnh không cần build.
6. Thêm test tự động cho matcher (golden set transcript → intent).
