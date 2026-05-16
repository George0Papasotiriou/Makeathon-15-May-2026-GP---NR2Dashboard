"use client";

import { useCallback, useEffect, useRef } from "react";
import { createLogger } from "@/lib/logger";

const log = createLogger("voice.playback");

const PLAYBACK_SAMPLE_RATE = 24000;

type AudioPlaybackHandle = {
  init: () => Promise<void>;
  enqueueAudio: (pcm16: ArrayBuffer) => void;
  stopAudio: () => void;
  getAmplitude: () => number;
  destroy: () => Promise<void>;
};

/**
 * 24 kHz PCM16 playback for Gemini Live agent audio.
 *
 * Each incoming chunk is scheduled at `nextStartTime` so that successive
 * chunks play back-to-back without gaps. On `stopAudio()` (typically when
 * the model is interrupted) we set `nextStartTime = currentTime` so new
 * audio starts fresh.
 *
 * An analyser node feeds amplitude so the UI indicator can pulse with
 * the agent's voice.
 */
export function useAudioPlayback(): AudioPlaybackHandle {
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const nextStartRef = useRef(0);
  const amplitudeRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  const init = useCallback(async () => {
    if (ctxRef.current) return;
    const AC: typeof AudioContext =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new AC({ sampleRate: PLAYBACK_SAMPLE_RATE });
    ctxRef.current = ctx;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyserRef.current = analyser;

    const gain = ctx.createGain();
    gain.gain.value = 1.0;
    gainRef.current = gain;

    gain.connect(analyser);
    analyser.connect(ctx.destination);

    nextStartRef.current = ctx.currentTime;

    // Amplitude poll loop.
    const buf = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      if (!analyserRef.current) return;
      analyserRef.current.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = ((buf[i] ?? 128) - 128) / 128;
        sum += v * v;
      }
      amplitudeRef.current = Math.sqrt(sum / buf.length);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    log.info("Audio playback initialized", { sampleRate: PLAYBACK_SAMPLE_RATE });
  }, []);

  const enqueueAudio = useCallback((pcm16: ArrayBuffer) => {
    const ctx = ctxRef.current;
    const gain = gainRef.current;
    if (!ctx || !gain) return;

    const int16 = new Int16Array(pcm16);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      const sample = int16[i] ?? 0;
      float32[i] = sample / 0x8000;
    }
    const buffer = ctx.createBuffer(1, float32.length, PLAYBACK_SAMPLE_RATE);
    buffer.copyToChannel(float32, 0);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(gain);

    const startAt = Math.max(ctx.currentTime, nextStartRef.current);
    source.start(startAt);
    nextStartRef.current = startAt + buffer.duration;
  }, []);

  const stopAudio = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    nextStartRef.current = ctx.currentTime;
    log.debug("Playback reset (interrupted)");
  }, []);

  const getAmplitude = useCallback(() => amplitudeRef.current, []);

  const destroy = useCallback(async () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (ctxRef.current && ctxRef.current.state !== "closed") {
      await ctxRef.current.close();
    }
    ctxRef.current = null;
    analyserRef.current = null;
    gainRef.current = null;
    nextStartRef.current = 0;
    amplitudeRef.current = 0;
  }, []);

  // Hard unmount cleanup — same shape as use-audio-capture. Stop the RAF
  // and close the AudioContext immediately to kill any scheduled audio.
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") {
        ctx.close().catch(() => {
          // swallow — page is unmounting
        });
      }
      ctxRef.current = null;
      analyserRef.current = null;
      gainRef.current = null;
      nextStartRef.current = 0;
      amplitudeRef.current = 0;
    };
  }, []);

  return { init, enqueueAudio, stopAudio, getAmplitude, destroy };
}
