/**
 * Notification sound module with rate limiting.
 * Uses Web Audio API to generate a short, pleasant notification tone.
 * No external audio files needed.
 */

let audioContext: AudioContext | null = null;
let lastPlayedAt = 0;
const RATE_LIMIT_MS = 2000; // Max 1 sound every 2 seconds
let unlocked = false;

/** Unlock audio context after first user interaction (browser autoplay policy) */
export function unlockAudio() {
  if (unlocked) return;
  try {
    audioContext = new AudioContext();
    // Create a silent buffer to unlock
    const buffer = audioContext.createBuffer(1, 1, 22050);
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);
    source.start(0);
    unlocked = true;
  } catch {
    // Web Audio API not supported
  }
}

/** Play a short notification tone (similar to WhatsApp/Slack) */
export function playNotificationSound() {
  const now = Date.now();
  if (now - lastPlayedAt < RATE_LIMIT_MS) return; // Rate limited

  if (!audioContext) {
    try {
      audioContext = new AudioContext();
      unlocked = true;
    } catch {
      return;
    }
  }

  if (audioContext.state === "suspended") {
    audioContext.resume().catch(() => {});
    return; // Will play next time after resume
  }

  lastPlayedAt = now;

  try {
    const ctx = audioContext;
    const now = ctx.currentTime;

    // Two-tone notification: pleasant and short
    // First tone: 880Hz (A5) for 80ms
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(880, now);
    gain1.gain.setValueAtTime(0.15, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.08);

    // Second tone: 1320Hz (E6) for 100ms, starts 60ms after first
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(1320, now + 0.06);
    gain2.gain.setValueAtTime(0, now);
    gain2.gain.setValueAtTime(0.12, now + 0.06);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.06);
    osc2.stop(now + 0.16);
  } catch {
    // Silently fail if audio playback fails
  }
}
