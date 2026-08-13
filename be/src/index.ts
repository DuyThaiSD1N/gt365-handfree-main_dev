import dotenv from 'dotenv';
import express from 'express';
import { createServer } from 'node:http';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { setupASRProxy } from './ws/asr-proxy.js';
import { setupTTSProxy } from './ws/tts-proxy.js';
import { intentLlmHandler, isLlmEnabled } from './ws/intent-http.js';
import { handfreeCommandHandler } from './ws/handfree-http.js';
import { feLogHandler } from './ws/fe-log.js';
import { getRadioChannels, setRadioChannels } from './store/radioChannels.js';

for (const envPath of ['.env.local', '.env', 'be/.env.local', 'be/.env']) {
  dotenv.config({ path: envPath, override: false });
}

// ── Dấu vân tay build ────────────────────────────────────────────────────
// Để biết CHẮC tiến trình đang phục vụ domain chạy từ commit nào, thư mục nào.
// Bump BUILD_TAG mỗi lần có thay đổi hành vi đáng kể để kiểm tra deploy trong 2 giây.
const BUILD_TAG = 'hotspot-alert-sync-2026-08-13';
const BUILD_COMMIT = (() => {
  try {
    return execSync('git rev-parse --short HEAD', {
      cwd: resolve(dirname(fileURLToPath(import.meta.url)), '..', '..'),
      stdio: ['ignore', 'pipe', 'ignore'],
    }).toString().trim();
  } catch {
    return 'unknown';
  }
})();
const STARTED_AT = new Date().toISOString();

const app = express();
app.use(express.json({ limit: '64kb' }));

app.get('/api/voice-health', (_request, response) => {
  response.json({
    status: 'ok',
    service: 'gt365-voice-bridge',
    timestamp: new Date().toISOString(),
    build: {
      tag: BUILD_TAG,
      commit: BUILD_COMMIT,
      startedAt: STARTED_AT,
      cwd: process.cwd(),
      pid: process.pid,
    },
    asr: {
      vi: process.env.ASR_GRPC_URI || '103.253.20.28:9112',
      hmong: process.env.ASR_HMONG_GRPC_URI || '103.253.20.28:9113',
      rate: Number(process.env.ASR_RATE || 16000),
      format: process.env.ASR_FORMAT || 'S16LE',
    },
    tts: {
      configured: Boolean(process.env.TTS_WS_URL && process.env.TTS_API_KEY),
      voiceId: process.env.TTS_VOICE_ID || 'phuongnhi-north',
      resampleRate: Number(process.env.TTS_RESAMPLE_RATE || 16000),
    },
    llm: {
      enabled: isLlmEnabled(),
      model: process.env.LLM_MODEL || 'Qwen/Qwen3.6-35B-A3B',
      fallbackModel: process.env.OPENLLM_MODEL || 'gpt-4o-mini',
      timeoutMs: Number(process.env.LLM_INTENT_TIMEOUT_MS || process.env.LLM_TIMEOUT_MS || 15000),
    },
  });
});

app.post('/api/intent-llm', intentLlmHandler());
app.post('/api/handfree/command', handfreeCommandHandler());
app.post('/api/fe-log', feLogHandler());

// GET /api/handfree/radio-channels — đọc danh sách kênh hiện tại
app.get('/api/handfree/radio-channels', (_req: express.Request, res: express.Response) => {
  res.json({ channels: getRadioChannels() });
});

// POST /api/handfree/radio-channels — app gửi danh sách kênh lên, lưu vào file
// Body: [{ "id": 1, "name": "VOV Giao thông" }, ...]
app.post('/api/handfree/radio-channels', (req: express.Request, res: express.Response) => {
  if (!Array.isArray(req.body)) {
    res.status(400).json({ error: 'invalid-body', message: 'Body phải là Array<{ id, name }>' });
    return;
  }
  const channels = setRadioChannels(req.body);
  console.log(`[radio-channels] updated: ${channels.length} channels`);
  res.json({ ok: true, channelCount: channels.length, channels });
});

const port = Number(process.env.PORT || 14673);
const host = process.env.HOST || '0.0.0.0';
const server = createServer(app);
const asrProxy = setupASRProxy();
const ttsProxy = setupTTSProxy();

server.on('upgrade', (request, socket, head) => {
  if (!request.url || !request.headers.host) {
    socket.destroy();
    return;
  }

  const { pathname } = new URL(request.url, `http://${request.headers.host}`);

  if (pathname === '/ws/asr') {
    asrProxy.wss.handleUpgrade(request, socket, head, (ws) => {
      asrProxy.wss.emit('connection', ws, request);
    });
    return;
  }

  if (pathname === '/ws/tts') {
    ttsProxy.wss.handleUpgrade(request, socket, head, (ws) => {
      ttsProxy.wss.emit('connection', ws, request);
    });
    return;
  }

  socket.destroy();
});

server.listen(port, host, () => {
  console.log('='.repeat(58));
  console.log(`GT365 voice bridge running at http://${host}:${port}`);
  console.log('WebSocket endpoints: /ws/asr, /ws/tts');
  console.log(`BUILD: ${BUILD_TAG} | commit=${BUILD_COMMIT} | pid=${process.pid}`);
  console.log(`CWD:   ${process.cwd()}`);
  console.log('='.repeat(58));
});
