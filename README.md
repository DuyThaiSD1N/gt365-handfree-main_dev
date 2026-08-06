# GT365 Handfree MVP

Ứng dụng web điều khiển bằng giọng nói (hands-free) dành cho nền tảng giao thông GT365. Hướng tới tài xế ô tô tại Việt Nam: cho phép thao tác toàn bộ ứng dụng (điều hướng màn hình, lộ trình, radio, tra cứu phạt nguội, báo cáo sự cố...) **mà không cần chạm tay vào màn hình**.

> Tài liệu chi tiết về luồng giọng nói, tập lệnh, an toàn khi lái xe và kiến trúc ASR/TTS xem tại [`docs/HANDFREE.md`](docs/HANDFREE.md).

---

## 1. Tính năng chính

- **Voice Command Engine** — nhận diện ~80+ lệnh tiếng Việt, kèm hỗ trợ tiếng Mông (Hmong).
- **Context-aware matching** — cùng một câu nói chỉ kích hoạt action phù hợp với màn hình hiện tại.
- **ASR streaming (gRPC)** — đẩy audio PCM 16kHz lên upstream ASR theo thời gian thực, nhận transcript dần.
- **TTS streaming (WebSocket)** — phản hồi bằng giọng `phuongnhi-north`, phát PCM base64 qua Web Audio API.
- **Safety layer** — các action nguy hiểm (xoá lộ trình khi đang lái...) yêu cầu xác nhận; chặn lệnh `blockedWhileDriving`.
- **UI sẵn sàng**: Trang chủ, Radio (nội dung & On-air talk), Tiện ích (phạt nguội, cứu hộ, cây xăng, đăng kiểm, định giá xe), Hồ sơ, Quản lý lộ trình, Trung tâm thông báo, Cài đặt.

## 2. Tech stack

| Layer | Stack |
|---|---|
| Frontend | React 19, TypeScript, Vite 7, Tailwind CSS 4, lucide-react, Web Audio API |
| Backend (voice bridge) | Node.js + Express, TypeScript, `ws`, `@grpc/grpc-js`, `@grpc/proto-loader` |
| ASR upstream | gRPC `streaming_voice.proto` — `103.253.20.28:9112` (VI), `:9113` (Hmong) |
| TTS upstream | WebSocket — `ws://103.253.20.27:8767` |

## 3. Cấu trúc thư mục

```
gt365-handfree/
├── src/                       # Frontend
│   ├── App.tsx                # UI + state + command flow
│   ├── main.tsx
│   ├── styles.css
│   └── voice/                 # Voice engine
│       ├── types.ts           # ScreenId, IntentCode, ActionCode...
│       ├── commands.ts        # Tập lệnh tiếng Việt (~80+)
│       ├── matcher.ts         # Transcript → Intent
│       ├── normalizer.ts      # Chuẩn hoá tiếng Việt (dấu, tone)
│       ├── screenActions.ts   # Intent → Action theo màn hình
│       ├── asrClient.ts       # WebSocket client → /ws/asr
│       ├── ttsClient.ts       # WebSocket client → /ws/tts
│       └── audioUtils.ts      # Capture mic, downsample, PCM16
├── be/                        # Voice bridge (Node)
│   └── src/
│       ├── index.ts           # Express + WS upgrade
│       ├── proto/streaming_voice.proto
│       └── ws/
│           ├── asr-proxy.ts   # WS ↔ gRPC (ASR)
│           └── tts-proxy.ts   # WS ↔ WS  (TTS)
├── md_tmp/                    # Tài liệu nội bộ (BA, integration plan)
├── docs/HANDFREE.md           # Doc chi tiết tính năng handfree
├── design/                    # Tham chiếu Figma
├── start.sh / stop.sh         # Khởi chạy / dừng cả FE + BE
├── vite.config.ts             # Proxy /api, /ws/asr, /ws/tts → BE
└── .env                       # Cấu hình ASR/TTS/port
```

## 4. Yêu cầu môi trường

- Node.js ≥ 20
- npm (hoặc tương đương)
- Trình duyệt hỗ trợ Web Audio API + getUserMedia (Chrome/Edge khuyên dùng)
- Truy cập mạng tới upstream ASR/TTS

## 5. Cài đặt & chạy

```bash
# 1. Cài deps
npm install

# 2. Cấu hình .env (xem mục 6)
cp .env .env.local   # nếu cần

# 3. Khởi chạy cả FE + BE
./start.sh

# Stop
./stop.sh
```

Sau khi chạy:

- Frontend: http://localhost:5175/
- Voice bridge health: http://localhost:14673/api/voice-health
- Logs: `tail -f logs/be.log` và `tail -f logs/fe.log`

### Scripts npm

| Script | Mô tả |
|---|---|
| `npm run dev` | Vite dev server (FE) |
| `npm run dev:be` | tsx watch backend |
| `npm run build` | Build FE + tsc -b |
| `npm run build:be` | Build backend TypeScript |
| `npm run preview` | Vite preview bản build |

## 6. Biến môi trường (`.env`)

```env
# ASR (gRPC upstream)
ASR_GRPC_URI=103.253.20.28:9112
ASR_HMONG_GRPC_URI=103.253.20.28:9113
ASR_TOKEN=...
ASR_RATE=16000
ASR_FORMAT=S16LE
ASR_SILENCE_TIMEOUT=10
ASR_SPEECH_TIMEOUT=1.8
ASR_HMONG_SPEECH_TIMEOUT=2.0
ASR_SPEECH_MAX=30

# TTS (WebSocket upstream)
TTS_WS_URL=ws://103.253.20.27:8767
TTS_API_KEY=...
TTS_VOICE_ID=phuongnhi-north
TTS_RESAMPLE_RATE=16000
TTS_TEMPO=0.95

# Voice bridge
PORT=14673
HOST=0.0.0.0
```

> `ASR_TOKEN` và `TTS_API_KEY` chỉ tồn tại ở backend, **không bao giờ** lộ ra FE.

## 7. API

**HTTP**

- `GET /api/voice-health` — trả cấu hình ASR/TTS, trạng thái bridge.

**WebSocket**

- `WS /ws/asr` — FE gửi PCM16LE 16kHz (binary frames) → nhận transcript JSON (interim + final).
- `WS /ws/tts` — FE gửi text + voice settings → nhận chunks audio base64 PCM.

Vite dev server proxy `/api`, `/ws/asr`, `/ws/tts` sang `VITE_VOICE_BRIDGE_TARGET` (mặc định `http://localhost:14673`).

## 8. Tài liệu liên quan

- [`docs/HANDFREE.md`](docs/HANDFREE.md) — Doc chi tiết tính năng handfree (luồng, command list, an toàn, troubleshooting).
- [`md_tmp/BA_HANDSFREE_MVP_PLAN.md`](md_tmp/BA_HANDSFREE_MVP_PLAN.md) — Yêu cầu BA.
- [`md_tmp/ASR_TTS_INTEGRATION_PLAN.md`](md_tmp/ASR_TTS_INTEGRATION_PLAN.md) — Kế hoạch tích hợp ASR/TTS.

## 9. Trạng thái

MVP — phục vụ demo và thử nghiệm tích hợp ASR/TTS. Chưa phải production.
