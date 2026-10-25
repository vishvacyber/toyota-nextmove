/** Audio for live voice calls: ringback tone, mic → PCM16 16 kHz frames, and gapless PCM16 24 kHz playback. */

export const MIC_RATE = 16_000;
export const SPEAKER_RATE = 24_000;

/** Float samples [-1, 1] → little-endian PCM16 (what Gemini Live takes). */
export function floatTo16(f: Float32Array): Int16Array<ArrayBuffer> {
  const out = new Int16Array(f.length);
  for (let i = 0; i < f.length; i++) {
    const s = Math.max(-1, Math.min(1, f[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

/** PCM16 bytes (what Gemini Live sends) → float samples. */
export function pcm16ToFloat(buf: ArrayBuffer): Float32Array<ArrayBuffer> {
  const pcm = new Int16Array(buf, 0, buf.byteLength >> 1);
  const out = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) out[i] = pcm[i] / 0x8000;
  return out;
}

export function rms(f: Float32Array): number {
  let sum = 0;
  for (const s of f) sum += s * s;
  return Math.sqrt(sum / (f.length || 1));
}

/** US ringback (440 + 480 Hz, 2 s on, 4 s off) until stopped. */
export function ringback(ctx: AudioContext): () => void {
  const gain = ctx.createGain();
  gain.gain.value = 0;
  gain.connect(ctx.destination);
  const tones = [440, 480].map((hz) => {
    const o = ctx.createOscillator();
    o.frequency.value = hz;
    o.connect(gain);
    o.start();
    return o;
  });
  const t = ctx.currentTime;
  for (let i = 0; i < 10; i++) {
    gain.gain.setValueAtTime(0.08, t + i * 6);
    gain.gain.setValueAtTime(0, t + i * 6 + 2);
  }
  return () => { tones.forEach((o) => o.stop()); gain.disconnect(); };
}

// Runs on the audio thread: posts ~100 ms of mic samples at a time.
const WORKLET = `class Mic extends AudioWorkletProcessor {
  constructor() { super(); this.buf = []; this.n = 0; }
  process(inputs) {
    const ch = inputs[0][0];
    if (ch) { this.buf.push(ch.slice()); this.n += ch.length; }
    if (this.n >= sampleRate / 10) {
      const out = new Float32Array(this.n); let o = 0;
      for (const b of this.buf) { out.set(b, o); o += b.length; }
      this.port.postMessage(out, [out.buffer]); this.buf = []; this.n = 0;
    }
    return true;
  }
}
registerProcessor("mic", Mic);`;

/** Mic at 16 kHz (the browser resamples), echo-cancelled; calls onFrame with ~100 ms float frames. */
export async function startMic(onFrame: (f: Float32Array) => void): Promise<() => void> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  const ctx = new AudioContext({ sampleRate: MIC_RATE });
  const url = URL.createObjectURL(new Blob([WORKLET], { type: "text/javascript" }));
  await ctx.audioWorklet.addModule(url);
  URL.revokeObjectURL(url);
  const node = new AudioWorkletNode(ctx, "mic");
  node.port.onmessage = (e: MessageEvent<Float32Array>) => onFrame(e.data);
  ctx.createMediaStreamSource(stream).connect(node);
  return () => { stream.getTracks().forEach((t) => t.stop()); void ctx.close(); };
}

/** Plays PCM16 24 kHz chunks back to back; flush() drops what's queued (the caller interrupted). */
export function player(ctx: AudioContext) {
  let next = 0;
  const playing = new Set<AudioBufferSourceNode>();
  return {
    play(buf: ArrayBuffer) {
      const f = pcm16ToFloat(buf);
      if (!f.length) return;
      const b = ctx.createBuffer(1, f.length, SPEAKER_RATE);
      b.copyToChannel(f, 0);
      const src = ctx.createBufferSource();
      src.buffer = b;
      src.connect(ctx.destination);
      next = Math.max(next, ctx.currentTime + 0.05);
      src.start(next);
      next += b.duration;
      playing.add(src);
      src.onended = () => playing.delete(src);
    },
    flush() {
      playing.forEach((s) => s.stop());
      playing.clear();
      next = 0;
    },
    /** True while the agent's voice is coming out of the speaker. */
    get speaking() { return ctx.currentTime < next; },
  };
}
