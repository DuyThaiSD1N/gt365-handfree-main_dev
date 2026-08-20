# GT365 Handfree — Thông tin API đấu nối (Android / iOS)

## Địa chỉ đấu nối

| Môi trường | REST | WebSocket |
|---|---|---|
| **Production** (khuyến nghị) | `https://gt365-handfree.vnekyc.vn` | `wss://gt365-handfree.vnekyc.vn` |
| Dev (mạng nội bộ) | `http://10.1.10.21:14673` | `ws://10.1.10.21:14673` |

**URL đầy đủ từng endpoint (production):**

| Chức năng | URL |
|---|---|
| Gửi lệnh thoại | `POST https://gt365-handfree.vnekyc.vn/api/handfree/command` |
| ASR streaming | `wss://gt365-handfree.vnekyc.vn/ws/asr` |
| TTS streaming | `wss://gt365-handfree.vnekyc.vn/ws/tts` |
| Đồng bộ kênh radio | `POST https://gt365-handfree.vnekyc.vn/api/handfree/radio-channels` |
| Health check | `GET https://gt365-handfree.vnekyc.vn/api/voice-health` |

Health check trả 200 nếu server sống — gọi thử endpoint này đầu tiên để xác nhận đấu nối được.

---

## 1. Gửi lệnh thoại — `POST /api/handfree/command`

App gửi câu user nói (text) + màn hình hiện tại, nhận về action code để thực thi + câu trả lời để đọc TTS.

**Request** (`Content-Type: application/json`, timeout client nên ≥ 8s):

```json
{
  "text": "mở radio",
  "screen": "home",
  "hotspotAlertEnabled": true,
  "radioPlaying": false,
  "pending": null
}
```

| Field | Bắt buộc | Mô tả |
|---|---|---|
| `text` | ✅ | Câu user vừa nói |
| `screen` | ✅ | Màn hình hiện tại: `home`, `radio`, `radioOnAir`, `utilities`, `community`, `profile`, `notifications`, `route`, `fineLookup`, `fineResult`, `insurance`, `displaySettings`, `permissionSettings` |
| `hotspotAlertEnabled` | nên gửi | Trạng thái cảnh báo điểm nóng — thiếu thì server luôn hỏi xác nhận |
| `radioPlaying` | nên gửi | Radio đang phát hay không |
| `pending` | khi confirm | Object `pending` nhận từ response `confirm` ở turn trước |

**Response** — luôn 200, phân biệt theo `type`:

```json
{
  "type": "action",
  "reply": "Mình mở Radio cho bạn rồi đó.",
  "action": { "code": "OPEN_RADIO_SCREEN", "nextScreen": "radio" }
}
```

| `type` | App làm gì |
|---|---|
| `action` | Đọc `reply` qua TTS → thực thi `action.code` → chuyển màn `action.nextScreen` (nếu có) |
| `confirm` | Đọc `reply` (câu hỏi xác nhận) → lưu `pending` → user trả lời "đồng ý"/"không" thì gọi lại API kèm `pending` |
| `noop` | Chỉ đọc `reply` (trạng thái đã đúng rồi, không làm gì thêm) |
| `fallback` | Đọc `reply` (bot không hiểu), mở mic cho user nói lại |

Field kèm theo:
- `silenceMeta`: `{ timeoutSeconds, message, closeAssistant }` — nếu mở mic mà im lặng quá `timeoutSeconds` giây thì đọc `message` rồi đóng trợ lý (không cần gọi API).
- `shouldCloseAssistant: true` → đóng trợ lý sau khi đọc xong reply.
- `action.target` + `action.value` (lệnh bật/tắt): ghi thẳng `app[target] = value`, vd `{ "target": "hotspotAlertEnabled", "value": false }`.

**Lỗi**: `400` thiếu `text`/`screen` · `429` quá 60 req/phút.

**Danh sách đầy đủ ActionCode + ScreenId**: xem [API_HANDFREE.md](./API_HANDFREE.md) §4–5. Action code lạ → chỉ đọc reply, bỏ qua, đừng crash.

**Test nhanh:**

```bash
curl -X POST https://gt365-handfree.vnekyc.vn/api/handfree/command \
  -H 'Content-Type: application/json' \
  -d '{"text":"mở radio","screen":"home"}'
```

---

## 2. ASR (nói → chữ) — WebSocket `/ws/asr`

Chỉ cần nếu app dùng ASR của server (app có ASR riêng thì bỏ qua mục này).

1. Connect `wss://<host>/ws/asr`
2. Gửi text frame: `{"type":"start","lang":"vi","rate":16000}`
3. Stream audio dạng **binary frame**: PCM 16-bit LE, mono, 16000 Hz (không WAV header), chunk ~100–250ms
4. Nhận text frame:
   ```json
   { "type": "transcript", "data": { "transcript": "mở radio", "isFinal": true, "confidence": 0.92 } }
   ```
   - `isFinal: false` → caption tạm; `isFinal: true` → câu chốt, đem gọi `/api/handfree/command`
   - `{"type":"end"}` → server đóng phiên (hết timeout im lặng)
5. Dừng: gửi `{"type":"stop"}` rồi close socket

---

## 3. TTS (chữ → giọng nói) — WebSocket `/ws/tts`

Chỉ cần nếu app dùng TTS của server (app có TTS riêng thì bỏ qua mục này).

1. Connect `wss://<host>/ws/tts`
2. Chờ nhận `{"ready":true}`
3. Gửi 2 frame: `{"text":"<câu cần đọc>"}` rồi `{"text":""}` (flush)
4. Nhận các frame `{"audio":"<base64>"}` — decode base64 ra PCM 16-bit LE mono 16000 Hz, phát nối tiếp
5. Nhận `{"isFinal":true}` → hết audio, phát xong thì close socket

Mỗi câu nói mở 1 kết nối mới. Muốn ngắt giọng đang đọc: dừng player + close socket.

---

## 4. Lưu ý nhanh

- **Không** vừa thu mic vừa phát TTS — đóng ASR trước khi phát, mở lại sau.
- Dev dùng `http/ws` phải mở cleartext: Android `network_security_config`, iOS thêm ATS exception.
- Đồng bộ danh sách kênh radio (nếu app có): `POST /api/handfree/radio-channels` body `[{"id":1,"name":"VOV Giao thông"}]`.
