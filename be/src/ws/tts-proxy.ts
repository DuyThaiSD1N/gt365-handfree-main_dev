import { WebSocket, WebSocketServer } from 'ws';

export function setupTTSProxy() {
  const wss = new WebSocketServer({ noServer: true });

  wss.on('connection', (clientWs) => {
    const upstreamUrl = process.env.TTS_WS_URL;

    if (!upstreamUrl) {
      clientWs.send(JSON.stringify({ error: 'TTS_WS_URL not configured on server' }));
      clientWs.close();
      return;
    }

    const ttsWs = new WebSocket(upstreamUrl);
    const pendingMessages: string[] = [];
    let upstreamReady = false;

    ttsWs.on('open', () => {
      ttsWs.send(
        JSON.stringify({
          text: ' ',
          voice_settings: {
            voiceId: process.env.TTS_VOICE_ID || 'phuongnhi-north',
            resample_rate: Number(process.env.TTS_RESAMPLE_RATE) || 16000,
            tempo: Number(process.env.TTS_TEMPO) || 0.95,
            stability: 0.5,
            similarity_boost: 0.7,
          },
          generator_config: { chunk_length_schedule: [20] },
          xi_api_key: process.env.TTS_API_KEY,
        }),
      );

      upstreamReady = true;
      for (const message of pendingMessages) ttsWs.send(message);
      pendingMessages.length = 0;

      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ ready: true }));
      }
    });

    clientWs.on('message', (data) => {
      const message = data.toString();
      if (upstreamReady) {
        ttsWs.send(message);
      } else {
        pendingMessages.push(message);
      }
    });

    ttsWs.on('message', (data) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(data.toString());
      }
    });

    ttsWs.on('error', (error) => {
      console.error('[TTS] upstream error:', error.message);
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ error: error.message }));
      }
    });

    clientWs.on('close', () => {
      if (ttsWs.readyState === WebSocket.OPEN || ttsWs.readyState === WebSocket.CONNECTING) {
        ttsWs.close();
      }
    });

    clientWs.on('error', () => {
      if (ttsWs.readyState === WebSocket.OPEN || ttsWs.readyState === WebSocket.CONNECTING) {
        ttsWs.close();
      }
    });

    ttsWs.on('close', () => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.close();
      }
    });
  });

  return { wss };
}
