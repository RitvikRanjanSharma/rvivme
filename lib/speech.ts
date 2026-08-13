// lib/speech.ts
// =============================================================================
// AI Marketing Lab — read-aloud via the browser's Web Speech API
//
// Why the browser rather than a cloud TTS service (ElevenLabs, Google TTS):
//   * Free and instant — no API key, no per-character billing, no server hop.
//   * Works offline once the voice is installed.
//   * Nothing is sent anywhere; the article text never leaves the device.
//
// The trade-off, stated plainly: the available voices depend on the user's
// operating system and browser. We cannot guarantee a specific named British
// male/female pair everywhere. What we CAN do is find whatever en-GB voices
// exist on the device and let the user choose. On a device with none, we fall
// back to any English voice and say so in the UI.
//
// If consistent branded voices ever matter more than cost, swap this module
// for a server route that returns audio — the component API stays the same.
// =============================================================================

export type VoiceGender = "male" | "female" | "unknown";

export type SpeechVoice = {
  name:   string;
  lang:   string;
  gender: VoiceGender;
  /** True when the voice is genuinely en-GB rather than an English fallback. */
  british: boolean;
};

// The Web Speech API does NOT expose gender, so this is name-matching against
// the voices actually shipped by the major platforms. It's a heuristic, not a
// guarantee — anything unrecognised is reported as "unknown" rather than
// guessed at, and the UI shows the raw voice name alongside so the user can
// judge for themselves.
const MALE_HINTS = [
  "male", "daniel", "george", "arthur", "oliver", "james", "ryan", "thomas",
  "graham", "alfie", "elliot", "ethan", "guy", "brian",
];
const FEMALE_HINTS = [
  "female", "kate", "serena", "sonia", "hazel", "susan", "libby", "amy",
  "emma", "fiona", "stephanie", "abbi", "bella", "olivia", "maisie",
];

function classifyGender(name: string): VoiceGender {
  const n = name.toLowerCase();
  // Check female first: "Google UK English Female" contains neither a male
  // name nor the word "male"… except it does, as a substring of "female".
  if (FEMALE_HINTS.some(h => n.includes(h))) return "female";
  if (MALE_HINTS.some(h => n.includes(h)))   return "male";
  return "unknown";
}

function isSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/**
 * Voices load asynchronously in most browsers — getVoices() often returns an
 * empty array on first call and fires `voiceschanged` later. This resolves
 * once voices are actually available, with a timeout so a browser that never
 * fires the event doesn't hang the caller forever.
 */
export function loadVoices(timeoutMs = 2000): Promise<SpeechSynthesisVoice[]> {
  if (!isSupported()) return Promise.resolve([]);

  const existing = window.speechSynthesis.getVoices();
  if (existing.length) return Promise.resolve(existing);

  return new Promise(resolve => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      window.speechSynthesis.removeEventListener("voiceschanged", done);
      resolve(window.speechSynthesis.getVoices());
    };
    window.speechSynthesis.addEventListener("voiceschanged", done);
    setTimeout(done, timeoutMs);
  });
}

/**
 * British voices first, then other English voices as a fallback so the feature
 * still works on a device with no en-GB pack installed.
 */
export async function listVoices(): Promise<SpeechVoice[]> {
  const all = await loadVoices();

  const mapped = all
    .filter(v => v.lang?.toLowerCase().startsWith("en"))
    .map(v => ({
      name:    v.name,
      lang:    v.lang,
      gender:  classifyGender(v.name),
      british: v.lang.toLowerCase().replace("_", "-").startsWith("en-gb"),
    }));

  // British first; within each group, named genders before unknown so the
  // picker's most useful options surface at the top.
  return mapped.sort((a, b) => {
    if (a.british !== b.british) return a.british ? -1 : 1;
    const rank = (g: VoiceGender) => (g === "unknown" ? 1 : 0);
    if (rank(a.gender) !== rank(b.gender)) return rank(a.gender) - rank(b.gender);
    return a.name.localeCompare(b.name);
  });
}

/** Best default: a British voice, preferring one we could classify. */
export async function pickDefaultVoice(preferred?: VoiceGender): Promise<string | null> {
  const voices = await listVoices();
  if (!voices.length) return null;
  if (preferred) {
    const match = voices.find(v => v.british && v.gender === preferred);
    if (match) return match.name;
  }
  return (voices.find(v => v.british) ?? voices[0]).name;
}

// ─── speaking ────────────────────────────────────────────────────────────────

export type SpeakHandle = {
  stop:   () => void;
  pause:  () => void;
  resume: () => void;
};

/**
 * Speak `text`, optionally with a named voice.
 *
 * Long text is split into sentence-sized chunks. This isn't cosmetic: several
 * browsers (notably Chrome) silently stop speaking after roughly 15 seconds or
 * ~300 characters in a single utterance. Queueing shorter utterances is the
 * standard workaround and also makes stop/pause feel responsive.
 */
export function speak(
  text: string,
  opts: {
    voiceName?: string | null;
    rate?:      number;
    pitch?:     number;
    onBoundary?: (charIndex: number) => void;
    onEnd?:      () => void;
    onError?:    (message: string) => void;
  } = {},
): SpeakHandle | null {
  if (!isSupported()) {
    opts.onError?.("This browser doesn't support speech synthesis.");
    return null;
  }

  const synth = window.speechSynthesis;
  synth.cancel(); // clear anything already queued

  const voices = synth.getVoices();
  const voice  = opts.voiceName ? voices.find(v => v.name === opts.voiceName) ?? null : null;

  // Split on sentence ends, then hard-wrap anything still very long.
  const chunks = text
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+/)
    .flatMap(s => (s.length <= 220 ? [s] : (s.match(/.{1,220}(\s|$)/g) ?? [s])))
    .map(s => s.trim())
    .filter(Boolean);

  if (!chunks.length) { opts.onEnd?.(); return null; }

  let cancelled = false;
  let offset    = 0;
  let index     = 0;

  const speakNext = () => {
    if (cancelled || index >= chunks.length) {
      if (!cancelled) opts.onEnd?.();
      return;
    }
    const chunk = chunks[index];
    const base  = offset;
    const u = new SpeechSynthesisUtterance(chunk);
    if (voice) u.voice = voice;
    u.lang  = voice?.lang ?? "en-GB";
    u.rate  = opts.rate  ?? 1;
    u.pitch = opts.pitch ?? 1;

    // Report a document-wide character index so callers can highlight progress.
    u.onboundary = e => opts.onBoundary?.(base + (e.charIndex ?? 0));

    u.onend = () => {
      offset += chunk.length + 1;
      index  += 1;
      speakNext();
    };
    u.onerror = e => {
      // "interrupted"/"canceled" fire from our own cancel() — not real errors.
      const err = (e as SpeechSynthesisErrorEvent).error;
      if (err === "interrupted" || err === "canceled") return;
      opts.onError?.(`Speech failed: ${err}`);
    };

    synth.speak(u);
  };

  speakNext();

  return {
    stop:   () => { cancelled = true; synth.cancel(); },
    pause:  () => synth.pause(),
    resume: () => synth.resume(),
  };
}

export function speechSupported(): boolean {
  return isSupported();
}

/** Strip HTML/markdown to the plain prose a screen reader would announce. */
export function textFromContent(content: string): string {
  return content
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    // Give block elements a sentence break so speech doesn't run paragraphs
    // together into one breathless stream.
    .replace(/<\/(p|div|h[1-6]|li|blockquote|tr)>/gi, ". ")
    .replace(/<br\s*\/?>/gi, ". ")
    .replace(/<[^>]+>/g, " ")
    // Markdown leftovers from AI-generated drafts.
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/[*_`>]/g, " ")
    // Decode the handful of entities that actually show up in prose.
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g,  "&")
    .replace(/&lt;/g,   "<")
    .replace(/&gt;/g,   ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g,  "'")
    .replace(/\s*\.\s*(\.\s*)+/g, ". ")   // collapse ". . ." runs
    .replace(/\s+/g, " ")
    .trim();
}
