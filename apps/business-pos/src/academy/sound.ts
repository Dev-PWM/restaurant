/**
 * Tactical audio and haptic feedback engine for MasaFlow Academy.
 * Utilizes Web Audio API oscillators to avoid external asset dependencies
 * and triggers navigator.vibrate for muscle-memory reinforcement.
 */

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return null;
    if (!audioContext) {
      audioContext = new AudioCtx();
    }
    if (audioContext.state === "suspended") {
      void audioContext.resume();
    }
    return audioContext;
  } catch {
    return null;
  }
}

/**
 * Play a bright, ascending chime for correct actions and module step completions.
 */
export function playSuccessChime() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const play = (c: AudioContext) => {
      const now = c.currentTime;
      const freqs = [523.25, 659.25, 783.99]; // C5, E5, G5
      freqs.forEach((freq, idx) => {
        const osc = c.createOscillator();
        const gain = c.createGain();
        const startTime = now + idx * 0.08;
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(0.001, startTime);
        gain.gain.exponentialRampToValueAtTime(0.07, startTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.22);
        osc.connect(gain);
        gain.connect(c.destination);
        osc.start(startTime);
        osc.stop(startTime + 0.24);
      });
    };

    if (ctx.state === "suspended") {
      ctx.resume().then(() => play(ctx)).catch(() => {});
    } else {
      play(ctx);
    }
  } catch {
    // Ignore audio playback errors
  }
}

/**
 * Play a dull low-frequency thud for mistakes, invalid shadow clicks, or expired undo timers.
 */
export function playMistakeThud() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const play = (c: AudioContext) => {
      const now = c.currentTime;
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(160, now);
      osc.frequency.exponentialRampToValueAtTime(55, now + 0.18);
      gain.gain.setValueAtTime(0.09, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc.connect(gain);
      gain.connect(c.destination);
      osc.start(now);
      osc.stop(now + 0.22);
    };

    if (ctx.state === "suspended") {
      ctx.resume().then(() => play(ctx)).catch(() => {});
    } else {
      play(ctx);
    }
  } catch {
    // Ignore audio playback errors
  }
}

/**
 * Trigger tactile feedback on supported devices.
 * - 'success': Smooth, single quick pulse [40ms]
 * - 'mistake': Harsh double-buzz [80ms, 50ms, 80ms]
 */
export function triggerHaptic(type: "success" | "mistake") {
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
  try {
    if (type === "success") {
      navigator.vibrate(40);
    } else {
      navigator.vibrate([80, 50, 80]);
    }
  } catch {
    // Ignore vibration errors
  }
}
