import { downsampleBuffer } from './audioUtils';

const ASR_RATE_VI = 16000;
const ASR_RATE_HMONG = 16000;

export type AsrLanguage = 'vi' | 'hmong';

export type AsrEventMap = {
  started: CustomEvent<void>;
  ended: CustomEvent<{ transcript: string }>;
  interim: CustomEvent<{ transcript: string }>;
  final: CustomEvent<{ transcript: string; confidence: number }>;
  level: CustomEvent<{ rms: number }>;
  error: CustomEvent<{ message: string; fatal: boolean }>;
};

type TranscriptMessage = {
  type: 'transcript';
  data: {
    transcript?: string;
    isFinal?: boolean;
    confidence?: number;
  };
};

type ErrorMessage = {
  type: 'error';
  message?: string;
};

type EndMessage = {
  type: 'end';
};

type AsrServerMessage = TranscriptMessage | ErrorMessage | EndMessage;

export class AsrClient extends EventTarget {
  private generation = 0;
  private ws: WebSocket | null = null;
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private gain: GainNode | null = null;
  private isListening = false;
  private lastTranscript = '';

  get listening() {
    return this.isListening;
  }

  addEventListener<K extends keyof AsrEventMap>(
    type: K,
    listener: (event: AsrEventMap[K]) => void,
    options?: boolean | AddEventListenerOptions,
  ): void;
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ): void;
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ): void {
    super.addEventListener(type, listener, options);
  }

  removeEventListener<K extends keyof AsrEventMap>(
    type: K,
    listener: (event: AsrEventMap[K]) => void,
    options?: boolean | EventListenerOptions,
  ): void;
  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions,
  ): void;
  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions,
  ): void {
    super.removeEventListener(type, listener, options);
  }

  async start(lang: AsrLanguage = 'vi') {
    const generation = this.generation + 1;
    this.generation = generation;
    this.cleanup();
    this.lastTranscript = '';

    const outputRate = lang === 'hmong' ? ASR_RATE_HMONG : ASR_RATE_VI;

    let mediaStream: MediaStream;
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
    } catch (error) {
      const message =
        error instanceof DOMException && error.name === 'NotAllowedError'
          ? 'not-allowed'
          : error instanceof Error
            ? error.message
            : 'Mic error';
      this.dispatch('error', { message, fatal: true });
      return;
    }

    if (this.generation !== generation) {
      mediaStream.getTracks().forEach((track) => track.stop());
      return;
    }

    this.stream = mediaStream;

    let audioContext: AudioContext;
    try {
      audioContext = new AudioContext({ sampleRate: outputRate });
    } catch {
      audioContext = new AudioContext();
    }
    this.ctx = audioContext;

    const source = audioContext.createMediaStreamSource(mediaStream);
    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    const silentGain = audioContext.createGain();
    silentGain.gain.value = 0;

    this.source = source;
    this.processor = processor;
    this.gain = silentGain;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const MAX_RETRIES = 3;

    const connectWs = (retryCount: number) => {
      if (this.generation !== generation) return;

      const ws = new WebSocket(`${protocol}//${window.location.host}/ws/asr`);
      ws.binaryType = 'arraybuffer';
      this.ws = ws;
      let wsConnected = false;

      ws.onopen = () => {
        if (this.generation !== generation) return;
        wsConnected = true;

        ws.send(JSON.stringify({ type: 'start', lang, rate: outputRate }));
        source.connect(processor);
        processor.connect(silentGain);
        silentGain.connect(audioContext.destination);

        processor.onaudioprocess = (event) => {
          if (this.generation !== generation || ws.readyState !== WebSocket.OPEN) return;
          const input = event.inputBuffer.getChannelData(0);
          let sum = 0;
          for (let index = 0; index < input.length; index += 1) {
            sum += input[index] * input[index];
          }
          this.dispatch('level', { rms: Math.sqrt(sum / input.length) });
          const pcm = downsampleBuffer(input, audioContext.sampleRate, outputRate);
          ws.send(pcm.buffer.slice(0));
        };

        this.isListening = true;
        this.dispatch('started', undefined);
      };

      ws.onmessage = (event) => {
        if (this.generation !== generation) return;

        try {
          const message = JSON.parse(String(event.data)) as AsrServerMessage;
          if (message.type === 'transcript') {
            const transcript = message.data.transcript || '';
            this.lastTranscript = transcript;
            if (message.data.isFinal) {
              this.dispatch('final', {
                transcript,
                confidence: message.data.confidence || 0,
              });
            } else if (transcript) {
              this.dispatch('interim', { transcript });
            }
          } else if (message.type === 'error') {
            this.dispatch('error', {
              message: message.message || 'ASR error',
              fatal: false,
            });
          } else if (message.type === 'end') {
            this.stop();
          }
        } catch {
          // ignore malformed upstream frames
        }
      };

      ws.onerror = () => {
        if (this.generation !== generation) return;
        // Chỉ retry nếu chưa kết nối được (connect fail), không retry khi đang stream dở
        if (!wsConnected && retryCount < MAX_RETRIES) {
          const delay = 500 * Math.pow(2, retryCount); // 500ms, 1s, 2s
          console.warn(`[ASR] connect error, retry ${retryCount + 1}/${MAX_RETRIES} in ${delay}ms`);
          setTimeout(() => connectWs(retryCount + 1), delay);
        } else {
          // Phân biệt lỗi kết nối vs lỗi stream
          const errorMessage = !wsConnected
            ? 'network-error' // Không kết nối được ngay từ đầu
            : 'stream-interrupted'; // Đang stream bị ngắt
          this.dispatch('error', { message: errorMessage, fatal: true });
          this.cleanupAndEnd();
        }
      };

      ws.onclose = () => {
        if (this.generation !== generation) return;
        this.cleanupAndEnd();
      };
    };

    connectWs(0);
  }

  stop() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({ type: 'stop' }));
      } catch {
        // noop
      }
    }
    this.cleanupAndEnd();
  }

  destroy() {
    this.generation += 1;
    this.cleanup();
  }

  private cleanupAndEnd() {
    const wasListening = this.isListening;
    this.generation += 1;
    this.cleanup();
    if (wasListening) {
      this.isListening = false;
      this.dispatch('ended', { transcript: this.lastTranscript });
    }
  }

  private cleanup() {
    if (this.processor) {
      this.processor.onaudioprocess = null;
      try {
        this.processor.disconnect();
      } catch {
        // noop
      }
      this.processor = null;
    }

    if (this.source) {
      try {
        this.source.disconnect();
      } catch {
        // noop
      }
      this.source = null;
    }

    if (this.gain) {
      try {
        this.gain.disconnect();
      } catch {
        // noop
      }
      this.gain = null;
    }

    if (this.ctx && this.ctx.state !== 'closed') {
      this.ctx.close().catch(() => undefined);
      this.ctx = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    if (this.ws) {
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        try {
          this.ws.close();
        } catch {
          // noop
        }
      }
      this.ws = null;
    }

    this.isListening = false;
  }

  private dispatch<K extends keyof AsrEventMap>(
    type: K,
    detail: AsrEventMap[K] extends CustomEvent<infer T> ? T : never,
  ) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }
}
