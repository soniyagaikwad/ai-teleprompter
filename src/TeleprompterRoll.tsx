import {
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import {
  countMatchedScriptWords,
  tokenizeTranscript,
} from "./scriptMatch";
import { WORDS_PER_LINE, TRANSCRIPT_LOOKAHEAD, type ScriptWord } from "./words";
import "./TeleprompterRoll.css";

type Props = {
  words: ScriptWord[];
  transcript: string;
  listening: boolean;
  onStop: () => void;
};

export function TeleprompterRoll({
  words,
  transcript,
  listening,
  onStop,
}: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);

  const normWords = useMemo(() => words.map((w) => w.norm), [words]);

  const matchedCount = useMemo(() => {
    const spoken = tokenizeTranscript(transcript);
    return countMatchedScriptWords(
      normWords,
      spoken,
      TRANSCRIPT_LOOKAHEAD
    );
  }, [normWords, transcript]);

  const lines = useMemo(() => {
    const out: ScriptWord[][] = [];
    for (let i = 0; i < words.length; i += WORDS_PER_LINE) {
      out.push(words.slice(i, i + WORDS_PER_LINE));
    }
    return out;
  }, [words]);

  const focusLineIndex =
    lines.length === 0
      ? 0
      : Math.min(
          Math.max(0, Math.floor((matchedCount - 1) / WORDS_PER_LINE)),
          lines.length - 1
        );

  useLayoutEffect(() => {
    const view = viewportRef.current;
    const lineEl = lineRefs.current[focusLineIndex];
    if (!view || !lineEl) return;

    const lineTop = lineEl.offsetTop;
    const readBand = view.clientHeight * 0.36;
    const target = lineTop - readBand;
    view.scrollTo({ top: Math.max(0, target), behavior: "auto" });
  }, [focusLineIndex, lines.length]);

  lineRefs.current = [];

  return (
    <div className="roll-root">
      <header className="roll-toolbar">
        <div className="roll-status">
          <span
            className={`roll-dot ${listening ? "roll-dot--on" : ""}`}
            aria-hidden
          />
          <span className="roll-status-text">
            {listening ? "Listening" : "Paused"}
          </span>
          <span className="roll-progress" aria-live="polite">
            {words.length === 0
              ? ""
              : `${Math.min(matchedCount, words.length)} / ${words.length} words`}
          </span>
        </div>
        <button type="button" className="roll-stop" onClick={onStop}>
          End session
        </button>
      </header>

      <div className="roll-stage">
        <div className="roll-viewport" ref={viewportRef} aria-label="Teleprompter text">
          <div className="roll-read-rail" aria-hidden />
          <div className="roll-scroll">
            {lines.map((lineWords, lineIdx) => {
              const startIdx = lineIdx * WORDS_PER_LINE;
              return (
                <div
                  key={lineIdx}
                  className="roll-line"
                  ref={(el) => {
                    lineRefs.current[lineIdx] = el;
                  }}
                >
                  {lineWords.map((w, j) => {
                    const wordIdx = startIdx + j;
                    const state =
                      wordIdx < matchedCount
                        ? "past"
                        : wordIdx === matchedCount
                          ? "here"
                          : "ahead";
                    return (
                      <span
                        key={`${lineIdx}-${j}`}
                        className={`roll-word roll-word--${state}`}
                      >
                        {w.display}
                      </span>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <p className="roll-hint">
        Read naturally. Ad-libs are ignored when matching. Use Chrome or Edge
        for best speech recognition.
      </p>
    </div>
  );
}
