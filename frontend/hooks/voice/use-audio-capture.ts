"use client";

import { useCallback, useEffect, useRef } from "react";
import { createLogger } from "@/lib/logger";

const log = createLogger("voice.capture");

const TARGET_SAMPLE_RATE = 16000;
const BUFFER_SIZE = 4096;

type AudioCaptureHandle = {
  init: (onChunk: (pcm16: ArrayBuffer) => void) => Promise<void>;
  resume: () => Promise<void>;
  stop: () => Promise<void>;
  getAmplitude: () => number;
};

/**
 * 16 kHz mono PCM16 capture for Gemini Live.
 *
 * Resampling note: most macs default to 48 kHz. We down-sample to 16 kHz
 * inside the ScriptProcessor callback rather than depending on
 * AudioContext.sampleRate (which is read-only and platform-dependent).
 *
 * Output goes through a silent GainNode so the mic input never echoes
 * to the speakers.
 */
export function useAudioCapture(): AudioCaptureHandle {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const silentGainRef = useRef<GainNode | null>(null);
  const onChunkRef = useRef<((pcm16: ArrayBuffer) => void) | null>(null);
  const amplitudeRef = useRef(0);

  const init = useCallback(async (onChunk: (pcm16: ArrayBuffer) => void) => {
    onChunkRef.current = onChunk;

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
    });
    streamRef.current = stream;

    const AC: typeof AudioContext =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new AC();
    audioCtxRef.current = ctx;

    const source = ctx.createMediaStreamSource(stream);
    sourceRef.current = source;

    const processor = ctx.createScriptProcessor(BUFFER_SIZE, 1, 1);
    processorRef.current = processor;

    const silentGain = ctx.createGain();
    silentGain.gain.value = 0;
    silentGainRef.current = silentGain;

    const sourceRate = ctx.sampleRate;
    const ratio = sourceRate / TARGET_SAMPLE_RATE;

    processor.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0);
      // Track amplitude (RMS).
      let sum = 0;
      for (let i = 0; i < input.length; i++) {
        const sample = input[i] ?? 0;
        sum += sample * sample;
      }
      amplitudeRef.current = Math.sqrt(sum / input.length);

      // Downsample naïvely to 16 kHz (good enough for speech).
      const targetLen = Math.floor(input.length / ratio);
      const out = new Int16Array(targetLen);
      for (let i = 0; i < targetLen; i++) {
        const srcIdx = Math.floor(i * ratio);
        const s = Math.max(-1, Math.min(1, input[srcIdx] ?? 0));
        out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      onChunkRef.current?.(out.buffer);
    };

    source.connect(processor);
    processor.connect(silentGain);
    silentGain.connect(ctx.destination);

    log.info("Audio capture initialized", {
      sourceRate: ctx.sampleRate,
      targetRate: TARGET_SAMPLE_RATE,
      bufferSize: BUFFER_SIZE,
    });
  }, []);

  const resume = useCallback(async () => {
    const ctx = audioCtxRef.current;
    if (ctx && ctx.state === "suspended") {
      await ctx.resume();
      log.debug("Audio context resumed");
    }
  }, []);

  const stop = useCallback(async () => {
    log.info("Stopping audio capture");
    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();
    silentGainRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((t) => {
      t.stop();
    });
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      await audioCtxRef.current.close();
    }
    processorRef.current = null;
    sourceRef.current = null;
    silentGainRef.current = null;
    streamRef.current = null;
    audioCtxRef.current = null;
    onChunkRef.current = null;
    amplitudeRef.current = 0;
  }, []);

  const getAmplitude = useCallback(() => amplitudeRef.current, []);

  // Hard unmount cleanup. If component dies mid-capture (hot-reload,
  // route nav), release the mic and tear down the audio graph. Calling
  // stop() handles all of these even when already stopped.
  useEffect(() => {
    return () => {
      // Synchronous teardown — we can't await on unmount, so do best-effort
      // disconnect-then-fire-and-forget close.
      processorRef.current?.disconnect();
      sourceRef.current?.disconnect();
      silentGainRef.current?.disconnect();
      streamRef.current?.getTracks().forEach((t) => {
        t.stop();
      });
      const ctx = audioCtxRef.current;
      if (ctx && ctx.state !== "closed") {
        ctx.close().catch(() => {
          // swallow — page is unmounting, nothing to recover into
        });
      }
      processorRef.current = null;
      sourceRef.current = null;
      silentGainRef.current = null;
      streamRef.current = null;
      audioCtxRef.current = null;
      onChunkRef.current = null;
      amplitudeRef.current = 0;
    };
  }, []);

  return { init, resume, stop, getAmplitude };
}
