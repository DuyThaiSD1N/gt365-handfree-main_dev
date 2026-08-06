# GT365 Voice Bridge — Intent LLM Fallback API

> **Mục đích**: tài liệu tích hợp tầng LLM phân loại intent dự phòng cho ứng dụng **Giao thông 365** (web + mobile). API này nhận transcript ASR Tiếng Việt (có thể bị nhận dạng sai), trả về `intentCode` từ danh sách candidate mà client cung cấp, kèm confidence score để client quyết định auto-execute hay xác nhận lại với user.

## 1. Tổng quan

```
┌─────────────────┐   transcript    ┌─────────────────┐   prompt    ┌─────────────────┐
│   GT365 client  │ ──────────────► │  Voice Bridge   │ ──────────► │   OpenAI LLM    │
│  (web/mobile)   │ ◄────────────── │  (this server)  │ ◄────────── │ (gpt-5.4-mini)  │
└─────────────────┘  intent + conf  └─────────────────┘   intent    └─────────────────┘
```

- Client chạy ASR (offline matcher) trước. Khi matcher trả `noMatch` (confidence quá thấp), gọi API này để LLM "cứu" intent.
- Server forward tới OpenAI Chat Completions với prompt voice-first cho ngữ cảnh handfree tài xế.
- Client nhận `intentCode + confidence + reason`, áp threshold để execute action.

**Base URL**:
```
http://<voice-bridge-host>:14673
```
- Local dev: `http://localhost:14673`
- Hoặc qua Vite proxy: `http://localhost:5175/api/...`
- Production: cấu hình qua reverse proxy / API gateway của bạn

---

## 2. Endpoint chính

### `POST /api/intent-llm`

Phân loại intent từ transcript ASR.

#### Request

**Headers**
| Key | Value |
|---|---|
| `Content-Type` | `application/json` (bắt buộc) |

**Body** (JSON):

| Field | Type | Required | Mô tả |
|---|---|---|---|
| `transcript` | string | ✅ | Câu thoại từ ASR, ví dụ `"phát nhạc cho mình"`. Đã trim trắng nhưng không cần normalize. |
| `screen` | string | ✅ | Màn hình client đang ở. Ví dụ: `"home"`, `"radio"`, `"fineLookup"`, `"insurance"`, `"utilities"`. Server không validate — chỉ truyền vào prompt LLM. |
| `assistantState` | string | ✅ | Trạng thái trợ lý: `"listening"`, `"recognizing"`, `"assistantOpen"`, `"confirming"`, `"idle"`, ... |
| `candidates` | `Candidate[]` | ✅ (≥1) | Danh sách intent ứng viên mà LLM được phép chọn. **KHÔNG** truyền toàn bộ ~75 intent — chỉ lọc theo screen hiện tại để giảm token cost và tránh hallucination. |
| `recentActions` | `RecentAction[]` | optional | Tối đa 3 action gần nhất user đã exec (giúp LLM tránh re-trigger). |

**`Candidate`** object:
| Field | Type | Mô tả |
|---|---|---|
| `intentCode` | string | Mã intent (ví dụ `"NAV_RADIO"`, `"FINE_OPEN"`). |
| `phrases` | string[] | 3–6 phrase tiêu biểu để LLM so khớp homophone. Lấy từ `commands.ts` của client. |

**`RecentAction`** object:
| Field | Type | Mô tả |
|---|---|---|
| `actionCode` | string | ActionCode đã exec, ví dụ `"PLAY_RADIO"`. |
| `msAgo` | number | Đã thực hiện cách đây bao nhiêu mili-giây. |

#### Ví dụ request đầy đủ

```json
POST /api/intent-llm
Content-Type: application/json

{
  "transcript": "phát nhạc cho mình đi",
  "screen": "home",
  "assistantState": "listening",
  "candidates": [
    {
      "intentCode": "NAV_RADIO",
      "phrases": ["mở radio", "vào radio", "nghe radio"]
    },
    {
      "intentCode": "RADIO_PLAY",
      "phrases": ["phát radio", "bật radio", "mở đài"]
    },
    {
      "intentCode": "FINE_OPEN",
      "phrases": ["tra cứu phạt nguội", "kiểm tra phạt nguội"]
    },
    {
      "intentCode": "NAV_HOME",
      "phrases": ["về trang chủ", "trang chủ"]
    }
  ],
  "recentActions": [
    { "actionCode": "OPEN_HOME_SCREEN", "msAgo": 12000 }
  ]
}
```

#### Response

**`200 OK`** — phân loại thành công:

```json
{
  "intentCode": "RADIO_PLAY",
  "confidence": 0.93,
  "reason": "'phát nhạc' gần với 'phát radio', thêm 'cho mình đi' là đệm",
  "latencyMs": 1305,
  "cacheHit": false
}
```

| Field | Type | Mô tả |
|---|---|---|
| `intentCode` | string \| null | Mã intent đã chọn (PHẢI nằm trong `candidates`), hoặc `null` nếu không khớp gì. |
| `confidence` | number | `[0, 1]`. `0` khi `intentCode = null`. |
| `reason` | string | Lý do LLM chọn, Tiếng Việt ngắn. **Chỉ dùng cho log/debug, KHÔNG hiển thị/đọc cho user.** |
| `latencyMs` | number | Thời gian xử lý server-side (gồm OpenAI call). |
| `cacheHit` | boolean | `true` nếu hit cache 5 phút (cùng `transcript + screen`). |

**`400 Bad Request`** — body sai format:
```json
{ "error": "invalid-body" }
```
Nguyên nhân: thiếu `transcript`/`screen`/`candidates`, hoặc `candidates` rỗng/sai schema.

**`429 Too Many Requests`** — vượt rate limit:
```json
{ "error": "rate-limited" }
```
Default: 30 req/phút/IP. Cấu hình qua env `LLM_RATE_LIMIT` (nếu mở rộng).

**`500 Internal Server Error`** — OpenAI lỗi / parse JSON fail:
```json
{ "error": "llm-error", "detail": "<message>" }
```

**`503 Service Unavailable`** — LLM bị tắt:
```json
{ "error": "llm-disabled" }
```
Xảy ra khi server thiếu `OPENAI_API_KEY` hoặc `LLM_INTENT_ENABLED=false`. Client nên feature-detect qua `/api/voice-health` để fallback sang offline UX.

---

### `GET /api/voice-health`

Health check + feature flags. Client dùng để kiểm tra LLM có sẵn sàng không trước khi enable rescue flow.

#### Response (200)

```json
{
  "status": "ok",
  "service": "gt365-voice-bridge",
  "timestamp": "2026-05-22T10:33:00.000Z",
  "asr": {
    "vi": "103.253.20.28:9112",
    "hmong": "103.253.20.28:9113",
    "rate": 16000,
    "format": "S16LE"
  },
  "tts": {
    "configured": true,
    "voiceId": "phuongnhi-north",
    "resampleRate": 16000
  },
  "llm": {
    "enabled": true,
    "model": "gpt-5.4-mini",
    "timeoutMs": 5000
  }
}
```

- `llm.enabled = false` → client KHÔNG nên gọi `/api/intent-llm`, dùng matcher offline + fallback gợi ý.

---

## 3. Behavior chi tiết

### 3.1 Cache (server-side)

- Key: `normalized_transcript + "|" + screen` (lowercase + trim).
- TTL: **5 phút**.
- Hit khi user nói trùng câu trong cùng session → server không gọi OpenAI lại → `cacheHit: true`, `latencyMs` giảm xuống ~2ms.
- Client KHÔNG cần cache thêm; server đã handle.

### 3.2 Rate limit

- **30 requests / phút / IP** (in-memory).
- Vượt → HTTP 429.
- Để nâng giới hạn cho client tin cậy, dùng env `LLM_RATE_LIMIT` (mở rộng) hoặc whitelist IP qua reverse proxy.
- Production khuyến nghị đặt API gateway / token-based auth trước endpoint này.

### 3.3 Voice-first prompt rules

LLM được instruct hiểu ngữ cảnh handfree tài xế:
- Verb thị giác (`xem`/`lướt`/`đọc`) trong transcript → vẫn map về intent (vì bot sẽ đọc to giúp user, không yêu cầu nhìn).
- Verb thao tác tay (`bấm`/`vuốt`/`tap`) trong transcript → vẫn map về intent (bot tự thao tác).
- Câu vô nghĩa (1-2 từ đệm, ASR garbage) → trả `null` thay vì đoán bừa.
- Intent có `dangerLevel: 'confirm'` (tắt cảnh báo, xóa lộ trình...) → confidence ≤ 0.8, để client buộc 2-turn confirm.

### 3.4 Cấu trúc danh sách candidates

**Không nên** gửi toàn bộ ~75 intent. Lý do:
- Token cost: gấp 3-5x.
- Hallucination cao: LLM dễ chọn intent không phù hợp screen.
- Latency: prompt dài → response chậm.

**Khuyến nghị** filter:
```ts
function filterCandidatesByScreen(allCommands, screen, assistantState) {
  const confirming = assistantState === 'confirming';
  return allCommands
    .filter((cmd) => {
      if (cmd.allowedScreens === 'all') return true;
      if (cmd.allowedScreens === 'confirming') return confirming;
      return cmd.allowedScreens.includes(screen);
    })
    .map((cmd) => ({
      intentCode: cmd.intentCode,
      phrases: cmd.phrases.slice(0, 6), // 6 phrase đầu là đủ
    }));
}
```

Số lượng candidates điển hình: 25–40 mỗi màn hình.

---

## 4. Pattern tích hợp client (recommended)

### 4.1 Decision tree threshold

```
matchTranscript (offline)
  ├── matched      → execute ngay
  ├── ambiguous    → ask user chọn
  └── noMatch      → call /api/intent-llm
                     │
                     ├── intentCode = null              → fallback gợi ý
                     ├── confidence ≥ 0.75 + safe       → auto-execute
                     ├── confidence ≥ 0.55 + safe       → echo-question + execute
                     │     ("X hả? Mình làm liền đây nhé")
                     ├── confidence ≥ 0.50 + info-read  → mở screen + readback voice
                     │     (NAV_NOTIFICATIONS, FINE_*, INSURANCE_VIEW_*, UTILITY_GAS_OPEN)
                     ├── visual_required intent         → defer ("khi nào dừng xe bạn xem")
                     │     (INSURANCE_BUY, UTILITY_REGISTRATION_OPEN)
                     └── dangerLevel='confirm' intent   → BẮT BUỘC 2-turn confirm
                                                          (không quan tâm confidence)
```

### 4.2 Timeout + AbortController

LLM mất 1–3 giây. Khuyến nghị client timeout **5000ms**, có thể abort:

```ts
async function classifyIntentRemote({ transcript, screen, assistantState, candidates, recentActions }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch('http://localhost:14673/api/intent-llm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript, screen, assistantState, candidates, recentActions }),
      signal: controller.signal,
    });

    if (!res.ok) return null;
    const data = await res.json();
    if (data.error) return null;
    return data; // { intentCode, confidence, reason, latencyMs, cacheHit }
  } catch {
    return null; // timeout/abort/network — fallback xuống matcher offline
  } finally {
    clearTimeout(timer);
  }
}
```

### 4.3 Danger gating

Với intent nguy hiểm (tắt cảnh báo, rời phòng, xóa lộ trình, mua bảo hiểm, tắt mic/vị trí...), **KHÔNG** auto-execute kể cả LLM trả confidence 0.95:

```ts
const action = resolveAction(result.intentCode, screen);
const isDanger = action.requiresConfirmation || action.riskLevel === 'critical';

if (isDanger) {
  // 2-turn confirm
  showConfirmPrompt(action);
  setPendingConfirmation({ action, source: 'llm-rescue' });
  return;
}

// safe → auto-exec hoặc echo-question theo threshold
```

### 4.4 Feedback loop — giảm dần phụ thuộc LLM

Mỗi tuần, đọc `logs/llm-intent.jsonl` (server-side) để phát hiện transcript ASR-sai-thường-gặp:

```bash
# Top 20 transcript được LLM cứu thành công
cat logs/llm-intent.jsonl \
  | jq -r 'select(.intentCode != null) | "\(.transcript)\t\(.intentCode)"' \
  | sort | uniq -c | sort -rn | head -20
```

Thêm những transcript này vào `commands.ts` của client làm phrase chính thức → matcher offline xử lý được → giảm lưu lượng LLM → tiết kiệm cost.

---

## 5. Examples

### 5.1 cURL

```bash
curl -X POST http://localhost:14673/api/intent-llm \
  -H 'Content-Type: application/json' \
  -d '{
    "transcript": "mở ra đi ô giúp mình",
    "screen": "home",
    "assistantState": "listening",
    "candidates": [
      {"intentCode": "NAV_RADIO", "phrases": ["mở radio", "vào radio"]},
      {"intentCode": "RADIO_PLAY", "phrases": ["phát radio", "bật radio"]}
    ]
  }'
```

Response:
```json
{
  "intentCode": "NAV_RADIO",
  "confidence": 0.9,
  "reason": "'ra đi ô' = 'radio' bị tách âm",
  "latencyMs": 1031,
  "cacheHit": false
}
```

### 5.2 JavaScript / React Native (mobile)

```ts
import { Platform } from 'react-native';

const VOICE_BRIDGE_URL =
  Platform.OS === 'ios'
    ? 'http://localhost:14673'
    : 'http://10.0.2.2:14673'; // Android emulator host

export async function rescueIntent(transcript: string, screen: string, candidates: Candidate[]) {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 5000);

  const res = await fetch(`${VOICE_BRIDGE_URL}/api/intent-llm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      transcript,
      screen,
      assistantState: 'listening',
      candidates,
    }),
    signal: controller.signal,
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
```

### 5.3 Kotlin (Android native)

```kotlin
data class Candidate(val intentCode: String, val phrases: List<String>)
data class IntentLlmRequest(
    val transcript: String,
    val screen: String,
    val assistantState: String,
    val candidates: List<Candidate>,
)
data class IntentLlmResponse(
    val intentCode: String?,
    val confidence: Double,
    val reason: String?,
    val latencyMs: Long,
    val cacheHit: Boolean,
)

interface VoiceBridgeApi {
    @POST("api/intent-llm")
    suspend fun classifyIntent(@Body body: IntentLlmRequest): IntentLlmResponse
}

// Retrofit setup với timeout 5s
val ok = OkHttpClient.Builder()
    .callTimeout(5, TimeUnit.SECONDS)
    .build()

val retrofit = Retrofit.Builder()
    .baseUrl("http://voice-bridge.gt365.local:14673/")
    .client(ok)
    .addConverterFactory(MoshiConverterFactory.create())
    .build()

val api = retrofit.create(VoiceBridgeApi::class.java)
```

### 5.4 Swift (iOS native)

```swift
struct Candidate: Codable {
    let intentCode: String
    let phrases: [String]
}

struct IntentLlmRequest: Codable {
    let transcript: String
    let screen: String
    let assistantState: String
    let candidates: [Candidate]
}

struct IntentLlmResponse: Codable {
    let intentCode: String?
    let confidence: Double
    let reason: String?
    let latencyMs: Int
    let cacheHit: Bool
}

func rescueIntent(_ req: IntentLlmRequest) async throws -> IntentLlmResponse {
    let url = URL(string: "http://voice-bridge.gt365.local:14673/api/intent-llm")!
    var urlRequest = URLRequest(url: url, timeoutInterval: 5)
    urlRequest.httpMethod = "POST"
    urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
    urlRequest.httpBody = try JSONEncoder().encode(req)

    let (data, response) = try await URLSession.shared.data(for: urlRequest)
    guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
        throw URLError(.badServerResponse)
    }
    return try JSONDecoder().decode(IntentLlmResponse.self, from: data)
}
```

---

## 6. Performance & cost

| Metric | Typical | Notes |
|---|---|---|
| Latency p50 | ~1,000ms | OpenAI Chat Completions call |
| Latency p95 | ~2,500ms | Spike khi OpenAI load cao |
| Cache hit latency | ~5ms | In-memory map |
| Token input | ~900 | system prompt (~300) + candidates (~400) + user (~200) |
| Token output | ~50 | JSON 1 dòng |
| Cost / call | ~$0.0002 | gpt-5.4-mini pricing |
| Cost / 1000 fallback / ngày | ~$0.20 | Estimate |

**Tối ưu cost**:
- Filter candidates theo screen (đã nói §3.4)
- Server cache TTL 5 phút (đã có sẵn)
- Feedback loop (§4.4) — giảm số call qua thời gian

---

## 7. Error handling khuyến nghị

```ts
async function safeRescue(transcript, screen, candidates) {
  try {
    const health = await fetch(`${VOICE_BRIDGE_URL}/api/voice-health`).then((r) => r.json());
    if (!health.llm?.enabled) return null;  // disable rescue feature
    
    const result = await classifyIntentRemote({ transcript, screen, candidates, ... });
    
    if (!result || result.intentCode === null) return null;
    if (typeof result.confidence !== 'number') return null;
    
    return result;
  } catch (err) {
    console.warn('[intent-llm] failed, falling back to offline', err);
    return null;
  }
}
```

**Failure modes** khách hàng cần handle:
| Tình huống | Phản ứng đề xuất |
|---|---|
| HTTP 429 | Exponential backoff 1s/2s/4s, sau đó disable rescue trong 1 phút |
| HTTP 500/503 | Disable rescue trong 30 giây, hiển thị "Trợ lý đang bận, bạn thử lại sau nhé" |
| Network timeout | Fallback offline matcher, không hiển thị lỗi để giữ UX mượt |
| Response intentCode không nằm trong candidates đã gửi | Reject (security/sanity check), treat as null |

---

## 8. Security & privacy

- **PII**: `transcript` là câu thoại user → có thể chứa tên xe, biển số, địa điểm. Server log JSONL → cân nhắc:
  - Disable log production: `LLM_INTENT_LOG=false`.
  - Hoặc mask biển số trước khi log.
- **Auth**: hiện endpoint mở (chỉ rate-limit IP). Production cần đặt sau:
  - API gateway với token-based auth (Bearer/JWT).
  - mTLS giữa mobile client và server.
  - hoặc proxy qua existing GT365 backend auth.
- **OPENAI_API_KEY**: TUYỆT ĐỐI không expose ra client. Key chỉ ở server `.env`.

---

## 9. Environment variables (server)

| Var | Default | Mô tả |
|---|---|---|
| `OPENAI_API_KEY` | — | **Bắt buộc**. Key của OpenAI account. |
| `LLM_MODEL` | `gpt-5.4-mini` | Model name. Có thể đổi sang khi cần. |
| `LLM_INTENT_ENABLED` | `true` | Set `false` để tạm tắt endpoint (trả 503). |
| `LLM_INTENT_TIMEOUT_MS` | `5000` | Server-side timeout cho OpenAI call. |
| `LLM_INTENT_LOG` | `true` | Set `false` để không append `logs/llm-intent.jsonl`. |
| `PORT` | `14673` | Server port. |
| `HOST` | `0.0.0.0` | Bind address. |

---

## 10. Versioning & changelog

Hiện chưa có versioning chính thức. Khuyến nghị:
- Đặt prefix `/v1/` khi mở rộng (`/api/v1/intent-llm`).
- Breaking changes: thêm field mới optional, không xóa field cũ trong 2 release.

**v0.1 (hiện tại)** — initial release với endpoint `/api/intent-llm` + voice-first prompt + cache + rate limit.

---

## 11. Liên hệ

- Repo: `gt365-handfree`
- Backend code: `be/src/llm/`, `be/src/ws/intent-http.ts`
- Reference plan: `plan/llm_fallback_intent_v1.md`
- Style guide (cho copy bot phát ra sau khi LLM map intent): `plan/handfree_natural_dialog_v3.md`
