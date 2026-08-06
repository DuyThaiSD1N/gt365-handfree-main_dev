import { WebSocket, WebSocketServer } from 'ws';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const protoPath = path.join(__dirname, '../proto/streaming_voice.proto');

const packageDef = protoLoader.loadSync(protoPath, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const proto = grpc.loadPackageDefinition(packageDef) as any;

type StartMessage = {
  type: 'start';
  lang?: string;
  rate?: string | number;
};

type StopMessage = {
  type: 'stop';
};

type ClientMessage = StartMessage | StopMessage;

export function setupASRProxy() {
  const wss = new WebSocketServer({ noServer: true });

  wss.on('connection', (clientWs) => {
    let grpcStream: any = null;
    let isStreamStarted = false;
    let currentLang = 'vi';
    let clientRate = process.env.ASR_RATE || '16000';

    const startStream = (lang?: string, rate?: string | number) => {
      if (isStreamStarted) return;
      if (lang) currentLang = lang;
      if (rate) clientRate = String(rate);

      const isHmong = currentLang === 'hmong';
      const grpcUri = isHmong
        ? process.env.ASR_HMONG_GRPC_URI || '103.253.20.28:9113'
        : process.env.ASR_GRPC_URI || '103.253.20.28:9112';

      const client = new proto.streaming_voice.StreamVoice(
        grpcUri,
        grpc.credentials.createInsecure(),
      );

      const metadata = new grpc.Metadata();
      metadata.add('token', process.env.ASR_TOKEN || 'test_token');
      metadata.add('id', `gt365_${Date.now()}`);
      metadata.add('silence_timeout', process.env.ASR_SILENCE_TIMEOUT || '10');

      if (isHmong) {
        metadata.add('speech_timeout', process.env.ASR_HMONG_SPEECH_TIMEOUT || '2.0');
      } else {
        metadata.add('channels', '1');
        metadata.add('rate', clientRate || process.env.ASR_RATE || '16000');
        metadata.add('format', process.env.ASR_FORMAT || 'S16LE');
        metadata.add('speech_timeout', process.env.ASR_SPEECH_TIMEOUT || '1.8');
        metadata.add('speech_max', process.env.ASR_SPEECH_MAX || '30');
      }

      grpcStream = client.SendVoice(metadata);
      isStreamStarted = true;

      if (isHmong) {
        try {
          grpcStream.write({ byte_buff: Buffer.alloc(0) });
        } catch {
          // noop
        }
      }

      console.log(`[ASR] stream started lang=${currentLang} endpoint=${grpcUri} rate=${clientRate}`);

      grpcStream.on('data', (response: any) => {
        if (clientWs.readyState !== WebSocket.OPEN) return;
        if (response.status === 0 && response.result?.hypotheses?.length > 0) {
          const hyp = response.result.hypotheses[0];
          clientWs.send(
            JSON.stringify({
              type: 'transcript',
              data: {
                transcript: hyp.transcript || '',
                isFinal: response.result.final || false,
                confidence: hyp.confidence || 0,
              },
            }),
          );
          if (response.result.final) {
            console.log(`[ASR] final: ${hyp.transcript || ''}`);
          }
          return;
        }

        if (response.status !== 0) {
          const message = response.msg || `ASR status ${response.status}`;
          console.error(`[ASR] upstream error: ${message}`);
          clientWs.send(JSON.stringify({ type: 'error', message }));
        }
      });

      grpcStream.on('error', (error: Error) => {
        console.error('[ASR] gRPC error:', error.message);
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(JSON.stringify({ type: 'error', message: error.message }));
        }
      });

      grpcStream.on('end', () => {
        isStreamStarted = false;
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(JSON.stringify({ type: 'end' }));
        }
      });
    };

    const stopStream = () => {
      if (!grpcStream || !isStreamStarted) return;
      try {
        grpcStream.end();
      } catch {
        // noop
      }
      isStreamStarted = false;
      grpcStream = null;
      console.log('[ASR] stream stopped');
    };

    clientWs.on('message', (message: Buffer, isBinary: boolean) => {
      if (isBinary) {
        if (!grpcStream || !isStreamStarted) return;
        try {
          grpcStream.write({ byte_buff: message });
        } catch (error) {
          const messageText = error instanceof Error ? error.message : 'unknown write error';
          console.error('[ASR] gRPC write error:', messageText);
        }
        return;
      }

      try {
        const parsed = JSON.parse(message.toString()) as ClientMessage;
        if (parsed.type === 'start') {
          startStream(parsed.lang, parsed.rate);
        } else if (parsed.type === 'stop') {
          stopStream();
        }
      } catch {
        // ignore malformed client frames
      }
    });

    clientWs.on('close', stopStream);
    clientWs.on('error', stopStream);
  });

  return { wss };
}
