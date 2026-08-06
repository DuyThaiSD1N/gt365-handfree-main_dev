import { base64ToPcm16Float32, getAudioContext } from './audioUtils';

const DIGIT_WORDS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];

const VIET_LETTER_NAMES: Record<string, string> = {
  A: 'A', B: 'Bê', C: 'Xê', D: 'Dê', Đ: 'Đê', E: 'E', F: 'Ép',
  G: 'Gờ', H: 'Hát', I: 'I', J: 'Gi', K: 'Ca', L: 'Lờ',
  M: 'Mờ', N: 'Nờ', O: 'O', P: 'Pê', Q: 'Quy', R: 'Rờ',
  S: 'Ét', T: 'Tê', U: 'U', V: 'Vê', W: 'Vê đúp', X: 'Ích',
  Y: 'Y', Z: 'Dét',
};

function spellDigits(digits: string): string {
  return digits
    .split('')
    .map((d) => (d >= '0' && d <= '9' ? DIGIT_WORDS[Number(d)] : d))
    .join(' ');
}

function spellLetters(letters: string): string {
  return letters
    .toUpperCase()
    .split('')
    .map((l) => VIET_LETTER_NAMES[l] ?? l)
    .join(' ');
}

function spellLicensePlate(
  province: string,
  letters: string,
  tail1: string,
  tail2?: string,
): string {
  const tail = (tail1 + (tail2 ?? '')).replace(/\D/g, '');
  return `${spellDigits(province)} ${spellLetters(letters)} ${spellDigits(tail)}`;
}

function numberToVietnamese(input: number): string {
  let n = input;
  if (n === 0) return 'không';
  if (n < 0) return `âm ${numberToVietnamese(-n)}`;

  const parts: string[] = [];
  if (n >= 1_000_000_000) {
    parts.push(`${numberToVietnamese(Math.floor(n / 1_000_000_000))} tỷ`);
    n %= 1_000_000_000;
  }
  if (n >= 1_000_000) {
    parts.push(`${numberToVietnamese(Math.floor(n / 1_000_000))} triệu`);
    n %= 1_000_000;
  }
  if (n >= 1000) {
    parts.push(`${numberToVietnamese(Math.floor(n / 1000))} nghìn`);
    n %= 1000;
  }
  if (n >= 100) {
    parts.push(`${DIGIT_WORDS[Math.floor(n / 100)]} trăm`);
    n %= 100;
  }
  if (n >= 20) {
    parts.push(`${DIGIT_WORDS[Math.floor(n / 10)]} mươi`);
    n %= 10;
    if (n === 1) {
      parts.push('mốt');
      n = 0;
    } else if (n === 5) {
      parts.push('lăm');
      n = 0;
    }
  } else if (n >= 10) {
    parts.push('mười');
    n %= 10;
    if (n === 5) {
      parts.push('lăm');
      n = 0;
    }
  }
  if (n > 0) parts.push(DIGIT_WORDS[n]);
  return parts.join(' ');
}

export function normalizeTTSText(text: string): string {
  let output = text;
  output = output.replace(/\*\*/g, '');
  output = output.replace(/\*/g, '');
  output = output.replace(/^#{1,6}\s+/gm, '');
  output = output.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  output = output.replace(/```[\s\S]*?```/g, '');
  output = output.replace(/`([^`]+)`/g, '$1');

  // Biển số xe Việt Nam: NN[A-Z]{1,2}-NNNN(N) | NN[A-Z]-NNN.NN | NN[A-Z]NNNNN
  // Đọc digit-by-digit kèm tên chữ cái để tránh TTS đọc "H" thành "giờ" hay "12345" thành "mười hai nghìn".
  output = output.replace(
    /\b(\d{2})\s*-?\s*([A-ZĐa-zđ]{1,2})\s*-?\s*(\d{2,5})(?:\s*\.\s*(\d{1,3}))?\b/g,
    (_match, prov, letters, n1, n2) => spellLicensePlate(prov, letters, n1, n2),
  );

  output = output.replace(/(\d{1,3}(?:\.\d{3})+)/g, (match) => match.replace(/\./g, ''));
  output = output.replace(/(\d{1,3}(?:,\d{3})+)/g, (match) => match.replace(/,/g, ''));
  output = output.replace(/(\d+)\s*(đồng|vnđ|VNĐ|đ)\b/gi, (_, num) => `${numberToVietnamese(Number(num))} đồng`);
  output = output.replace(
    /(ngày\s+)?(\d{1,2})\/(\d{1,2})\/(\d{4})/g,
    (_, prefix, dd, mm, yyyy) =>
      `${prefix || 'ngày '}${numberToVietnamese(Number(dd))} tháng ${numberToVietnamese(Number(mm))} năm ${numberToVietnamese(Number(yyyy))}`,
  );
  output = output.replace(/\b(\d{2,})\b/g, (_, num) => numberToVietnamese(Number(num)));
  output = output.replace(/\//g, ' trên ');
  output = output.replace(/%/g, ' phần trăm');
  output = output.replace(/&/g, ' và ');
  output = output.replace(/^[-•]\s+/gm, '');
  output = output.replace(/\n{3,}/g, '\n\n');
  output = output.replace(/ {2,}/g, ' ');
  return output.trim();
}

class StreamingAudioPlayer {
  private nextStartTime = 0;
  private activeSources: AudioBufferSourceNode[] = [];
  private isPlaying = false;
  private readonly sampleRate: number;
  onEnd: (() => void) | null = null;

  constructor(sampleRate = 16000) {
    this.sampleRate = sampleRate;
  }

  get playing() {
    return this.isPlaying;
  }

  private get ctx() {
    return getAudioContext(this.sampleRate);
  }

  async resume() {
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  enqueue(base64: string) {
    const float32 = base64ToPcm16Float32(base64);
    if (float32.length === 0) return;

    const buffer = this.ctx.createBuffer(1, float32.length, this.sampleRate);
    buffer.getChannelData(0).set(float32);

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.ctx.destination);
    this.activeSources.push(source);

    const currentTime = this.ctx.currentTime;
    const startAt = Math.max(currentTime, this.nextStartTime);
    source.start(startAt);
    this.nextStartTime = startAt + buffer.duration;
    this.isPlaying = true;

    source.onended = () => {
      this.activeSources = this.activeSources.filter((item) => item !== source);
      if (this.activeSources.length === 0) {
        this.isPlaying = false;
        this.onEnd?.();
      }
    };
  }

  stop() {
    for (const source of this.activeSources) {
      try {
        source.stop();
      } catch {
        // noop
      }
    }
    this.activeSources = [];
    this.nextStartTime = 0;
    this.isPlaying = false;
  }
}

type TtsCallbacks = {
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (message: string) => void;
};

let player: StreamingAudioPlayer | null = null;
let currentWs: WebSocket | null = null;
let ttsSession = 0;

export function stopTTS() {
  ttsSession += 1;
  player?.stop();

  if (currentWs) {
    currentWs.onmessage = null;
    currentWs.onerror = null;
    currentWs.onclose = null;
    if (currentWs.readyState === WebSocket.OPEN || currentWs.readyState === WebSocket.CONNECTING) {
      currentWs.close();
    }
    currentWs = null;
  }
}

export function speakText(text: string, muted = false, callbacks: TtsCallbacks = {}) {
  if (muted || typeof window === 'undefined' || !text.trim()) {
    callbacks.onEnd?.();
    return;
  }

  const mySession = ttsSession + 1;
  ttsSession = mySession;
  player?.stop();

  if (currentWs && currentWs.readyState === WebSocket.OPEN) {
    currentWs.close();
  }

  if (!player) player = new StreamingAudioPlayer(16000);

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${protocol}//${window.location.host}/ws/tts`);
  currentWs = ws;

  let gotFinal = false;
  let callbackFired = false;
  let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

  const fireEnd = () => {
    if (mySession !== ttsSession || callbackFired) return;
    callbackFired = true;
    if (fallbackTimer) clearTimeout(fallbackTimer);
    callbacks.onEnd?.();
  };

  player.onEnd = () => {
    if (gotFinal) fireEnd();
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(String(event.data));
      if (data.error) {
        callbacks.onError?.(String(data.error));
        ws.close();
        fireEnd();
        return;
      }
      if (data.ready) {
        const normalized = normalizeTTSText(text);
        ws.send(JSON.stringify({ text: normalized }));
        ws.send(JSON.stringify({ text: '' }));
        return;
      }
      if (data.status === 'authenticated') return;

      if (data.audio && typeof data.audio === 'string') {
        player?.resume();
        player?.enqueue(data.audio);
        callbacks.onStart?.();
      }

      if (data.isFinal === true) {
        gotFinal = true;
        ws.close();

        const waitForAudioDone = () => {
          if (callbackFired) return;
          if (!player?.playing) fireEnd();
          else setTimeout(waitForAudioDone, 200);
        };
        setTimeout(waitForAudioDone, 300);
        fallbackTimer = setTimeout(fireEnd, 30000);
      }
    } catch {
      // ignore non-json frames
    }
  };

  ws.onerror = () => {
    callbacks.onError?.('Không kết nối được TTS.');
    fireEnd();
  };

  ws.onclose = () => {
    currentWs = null;
    if (!gotFinal && !callbackFired) {
      setTimeout(fireEnd, 2000);
    }
  };
}
