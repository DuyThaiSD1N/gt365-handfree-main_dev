let sharedAudioContext: AudioContext | null = null;
let audioUnlocked = false;

export function getAudioContext(sampleRate = 16000): AudioContext {
  if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
    try {
      sharedAudioContext = new AudioContext({ sampleRate });
    } catch {
      sharedAudioContext = new AudioContext();
    }
  }

  return sharedAudioContext;
}

export async function unlockAudio(): Promise<boolean> {
  if (audioUnlocked) return true;

  try {
    const ctx = getAudioContext(16000);
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    const buffer = ctx.createBuffer(1, 1, 22050);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);
    audioUnlocked = true;
    localStorage.setItem('gt365_audio_unlocked', '1');
    return true;
  } catch (error) {
    console.warn('[audio] unlock failed:', error);
    return false;
  }
}

export function isAudioUnlocked(): boolean {
  if (audioUnlocked) return true;
  return localStorage.getItem('gt365_audio_unlocked') === '1';
}

export function downsampleBuffer(
  buffer: Float32Array,
  inputRate: number,
  outputRate: number,
): Int16Array {
  if (inputRate === outputRate) {
    const out = new Int16Array(buffer.length);
    for (let index = 0; index < buffer.length; index += 1) {
      const sample = Math.max(-1, Math.min(1, buffer[index]));
      out[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    }
    return out;
  }

  const ratio = inputRate / outputRate;
  const length = Math.floor(buffer.length / ratio);
  const out = new Int16Array(length);

  for (let index = 0; index < length; index += 1) {
    const sample = Math.max(-1, Math.min(1, buffer[Math.floor(index * ratio)]));
    out[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }

  return out;
}

export function base64ToPcm16Float32(base64: string): Float32Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  const sampleCount = Math.floor(bytes.length / 2);
  const out = new Float32Array(sampleCount);
  const view = new DataView(bytes.buffer);

  for (let index = 0; index < sampleCount; index += 1) {
    out[index] = view.getInt16(index * 2, true) / 32768;
  }

  return out;
}
