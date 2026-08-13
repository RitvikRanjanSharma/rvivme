"use client";

// app/blog/[slug]/reader-controls.tsx
// =============================================================================
// AI Marketing Lab — "Listen" and "AI summary" controls for a blog post.
//
// Two independent things sharing one speech engine:
//   Listen      — reads the full article aloud.
//   AI summary  — fetches a ~120-word précis, shows it, and offers to read
//                 that instead. Useful when deciding whether to commit to the
//                 whole piece.
//
// Only one can play at a time; starting either stops the other. Speech is
// browser-native (see lib/speech.ts) so there's no cost and nothing leaves
// the device.
// =============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Pause, Square, Sparkles, Loader2, AlertTriangle } from "lucide-react";
import {
  speak, speechSupported, textFromContent, pickDefaultVoice,
  type SpeakHandle,
} from "@/lib/speech";

const VOICE_KEY = "aiml-voice-name";

type Mode = "idle" | "playing" | "paused";
type Track = "article" | "summary" | null;

export default function ReaderControls({
  slug, content, brandColor = "var(--brand)",
}: {
  slug: string;
  content: string;
  brandColor?: string;
}) {
  const [supported, setSupported] = useState(true);
  const [mode,  setMode]  = useState<Mode>("idle");
  const [track, setTrack] = useState<Track>(null);
  const [error, setError] = useState<string | null>(null);

  const [summary,        setSummary]        = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryOpen,    setSummaryOpen]    = useState(false);

  const handleRef = useRef<SpeakHandle | null>(null);
  const voiceRef  = useRef<string | null>(null);

  useEffect(() => {
    setSupported(speechSupported());
    if (!speechSupported()) return;

    // Resolve the voice once: the user's saved choice, else the best British
    // voice available on this device.
    (async () => {
      const saved = localStorage.getItem(VOICE_KEY);
      voiceRef.current = saved || (await pickDefaultVoice());
    })();

    // Speech keeps running after a client-side navigation unless we stop it.
    return () => { handleRef.current?.stop(); };
  }, []);

  const stop = useCallback(() => {
    handleRef.current?.stop();
    handleRef.current = null;
    setMode("idle");
    setTrack(null);
  }, []);

  const start = useCallback((text: string, which: Exclude<Track, null>) => {
    setError(null);
    handleRef.current?.stop();

    const handle = speak(text, {
      voiceName: voiceRef.current,
      onEnd:   () => { setMode("idle"); setTrack(null); },
      onError: msg => { setError(msg); setMode("idle"); setTrack(null); },
    });

    handleRef.current = handle;
    if (handle) { setMode("playing"); setTrack(which); }
  }, []);

  const toggleArticle = useCallback(() => {
    if (track === "article" && mode === "playing") {
      handleRef.current?.pause();
      setMode("paused");
      return;
    }
    if (track === "article" && mode === "paused") {
      handleRef.current?.resume();
      setMode("playing");
      return;
    }
    start(textFromContent(content), "article");
  }, [track, mode, content, start]);

  const loadSummary = useCallback(async () => {
    // Already have it — just toggle the panel.
    if (summary) { setSummaryOpen(o => !o); return; }

    setSummaryLoading(true);
    setError(null);
    try {
      const res  = await fetch("/api/blog/summary", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ slug }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message ?? data.error ?? "Could not generate a summary.");
      setSummary(data.summary);
      setSummaryOpen(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSummaryLoading(false);
    }
  }, [slug, summary]);

  const btn = (active: boolean): React.CSSProperties => ({
    display: "inline-flex", alignItems: "center", gap: "7px",
    height: "36px", padding: "0 14px",
    background: active ? "rgba(var(--brand-rgb),0.10)" : "var(--surface)",
    border: `1px solid ${active ? "rgba(var(--brand-rgb),0.35)" : "var(--border)"}`,
    borderRadius: "8px", cursor: "pointer",
    fontFamily: "var(--font-body)", fontSize: "12.5px", fontWeight: 500,
    color: active ? brandColor : "var(--text-secondary)",
    transition: "all 0.15s", whiteSpace: "nowrap",
  });

  // No speech engine (older browsers, some in-app webviews) — still offer the
  // summary, which is useful on its own, rather than hiding everything.
  const articleControlsVisible = supported;

  return (
    <div style={{ margin: "0 0 28px" }}>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
        {articleControlsVisible && (
          <>
            <button
              onClick={toggleArticle}
              style={btn(track === "article")}
              className="aiml-touch-target"
              aria-label={track === "article" && mode === "playing" ? "Pause article" : "Listen to article"}
            >
              {track === "article" && mode === "playing"
                ? <><Pause size={13} /> Pause</>
                : track === "article" && mode === "paused"
                ? <><Play size={13} /> Resume</>
                : <><Play size={13} /> Listen</>}
            </button>

            {track && (
              <button onClick={stop} style={btn(false)} className="aiml-touch-target" aria-label="Stop">
                <Square size={12} /> Stop
              </button>
            )}
          </>
        )}

        <button
          onClick={loadSummary}
          disabled={summaryLoading}
          style={btn(summaryOpen)}
          className="aiml-touch-target"
        >
          {summaryLoading
            ? <><Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> Summarising…</>
            : <><Sparkles size={13} /> {summary ? (summaryOpen ? "Hide summary" : "Show summary") : "AI summary"}</>}
        </button>
      </div>

      {!supported && (
        <div style={{ marginTop: "8px", fontFamily: "var(--font-body)", fontSize: "12px", color: "var(--text-tertiary)" }}>
          Read-aloud isn&rsquo;t available in this browser.
        </div>
      )}

      {error && (
        <div style={{
          display: "flex", alignItems: "center", gap: "7px", marginTop: "10px",
          padding: "9px 12px", borderRadius: "8px",
          background: "rgba(255,171,0,0.08)", border: "1px solid rgba(255,171,0,0.25)",
          fontFamily: "var(--font-body)", fontSize: "12px", color: "var(--signal-amber)",
        }}>
          <AlertTriangle size={12} /> {error}
        </div>
      )}

      <AnimatePresence>
        {summaryOpen && summary && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{    opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            style={{ overflow: "hidden" }}
          >
            <div style={{
              marginTop: "12px", padding: "16px 18px",
              background: "var(--card)",
              border: "1px solid rgba(var(--brand-rgb),0.22)",
              borderRadius: "12px",
            }}>
              <div style={{
                display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px",
                fontFamily: "var(--font-mono)", fontSize: "9.5px", letterSpacing: "0.12em",
                textTransform: "uppercase", color: brandColor,
              }}>
                <Sparkles size={10} /> AI summary
              </div>

              <p style={{
                fontFamily: "var(--font-body)", fontSize: "14px",
                color: "var(--text-reading)", lineHeight: 1.7, margin: 0,
              }}>
                {summary}
              </p>

              {supported && (
                <button
                  onClick={() =>
                    track === "summary" && mode === "playing" ? stop() : start(summary, "summary")
                  }
                  style={{ ...btn(track === "summary"), marginTop: "12px", height: "32px", fontSize: "12px" }}
                  className="aiml-touch-target"
                >
                  {track === "summary" && mode === "playing"
                    ? <><Square size={11} /> Stop</>
                    : <><Play size={11} /> Listen to summary</>}
                </button>
              )}

              <div style={{
                marginTop: "10px", fontFamily: "var(--font-body)",
                fontSize: "11px", color: "var(--text-tertiary)", lineHeight: 1.5,
              }}>
                Generated from the article text. Skim it, but read the piece for the detail.
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
