import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const voiceBridgeHttpTarget = process.env.VITE_VOICE_BRIDGE_TARGET || 'http://localhost:14673';
const voiceBridgeWsTarget = voiceBridgeHttpTarget.replace(/^http/, 'ws');

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    allowedHosts: ['gt365-handfree.vnekyc.vn', 'localhost', '127.0.0.1'],
    proxy: {
      '/ws/asr': {
        target: voiceBridgeWsTarget,
        ws: true,
      },
      '/ws/tts': {
        target: voiceBridgeWsTarget,
        ws: true,
      },
      '/api/voice-health': {
        target: voiceBridgeHttpTarget,
      },
      '/api/intent-llm': {
        target: voiceBridgeHttpTarget,
      },
      '/api/handfree': {
        target: voiceBridgeHttpTarget,
      },
      '/api/fe-log': {
        target: voiceBridgeHttpTarget,
      },
    },
  },
});

