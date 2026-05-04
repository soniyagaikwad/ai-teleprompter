import { useCallback, useMemo, useState } from "react";
import { TeleprompterRoll } from "./TeleprompterRoll";
import { parseScriptWords } from "./words";
import { useTeleprompterSpeech } from "./useTeleprompterSpeech";
import "./App.css";

const SAMPLE =
  "Welcome everyone. Thank you for being here today. We are excited to share what we have been building. This teleprompter listens as you speak and keeps the script in view. Feel free to ad-lib between lines — the scroll catches up when you return to the script.";

export default function App() {
  const [script, setScript] = useState(SAMPLE);
  const [rolling, setRolling] = useState(false);

  const {
    status,
    transcript,
    speechError,
    start,
    stop,
    supported,
  } = useTeleprompterSpeech();

  const words = useMemo(() => parseScriptWords(script), [script]);

  const beginRoll = useCallback(() => {
    if (!script.trim()) return;
    if (!supported) return;
    if (words.length === 0) return;
    setRolling(true);
    start();
  }, [script, supported, start, words.length]);

  const endRoll = useCallback(() => {
    stop();
    setRolling(false);
  }, [stop]);

  if (rolling) {
    return (
      <TeleprompterRoll
        words={words}
        transcript={transcript}
        listening={status === "listening"}
        onStop={endRoll}
      />
    );
  }

  return (
    <div className="app-shell">
      <main className="app-main">
        <header className="app-hero">
          <h1 className="app-title">AI Teleprompter</h1>
          <p className="app-lede">
            Paste your script, press read-back, and speak. The prompter tracks
            your speech — including light paraphrasing and short tangents — and
            keeps the next lines visible.
          </p>
        </header>

        <label className="app-label" htmlFor="script-input">
          Script
        </label>
        <textarea
          id="script-input"
          className="app-textarea"
          value={script}
          onChange={(e) => setScript(e.target.value)}
          rows={12}
          spellCheck
          placeholder="Write or paste your script here…"
        />

        {!supported && (
          <p className="app-banner app-banner--warn" role="status">
            Speech recognition is not available in this browser. Try Chrome or
            Edge on desktop.
          </p>
        )}

        {speechError && status === "error" && (
          <p className="app-banner app-banner--error" role="status">
            Microphone error: {speechError}
          </p>
        )}

        <div className="app-actions">
          <button
            type="button"
            className="app-primary"
            onClick={beginRoll}
            disabled={!supported || !script.trim() || words.length === 0}
          >
            Read back script
          </button>
        </div>
      </main>
    </div>
  );
}
