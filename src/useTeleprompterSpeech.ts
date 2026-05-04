import { useCallback, useEffect, useRef, useState } from "react";

function getRecognitionCtor(): (new () => SpeechRecognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export type SpeechStatus =
  | "unsupported"
  | "idle"
  | "listening"
  | "error";

export function useTeleprompterSpeech(lang = "en-US") {
  const [status, setStatus] = useState<SpeechStatus>("idle");
  const [transcript, setTranscript] = useState("");
  const [speechError, setSpeechError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const finalRef = useRef("");
  const intentRef = useRef(false);

  const attachHandlers = useCallback(
    (rec: SpeechRecognition) => {
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = lang;
      rec.maxAlternatives = 1;

      rec.onresult = (ev: SpeechRecognitionEvent) => {
        let interim = "";
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const r = ev.results[i];
          const text = r[0]?.transcript ?? "";
          if (r.isFinal) finalRef.current += text + " ";
          else interim += text;
        }
        setTranscript((finalRef.current + interim).trim());
      };

      rec.onerror = (ev: SpeechRecognitionErrorEvent) => {
        if (ev.error === "aborted") return;
        if (ev.error === "no-speech") return;
        setSpeechError(ev.error);
        intentRef.current = false;
        setStatus("error");
      };

      rec.onend = () => {
        recognitionRef.current = null;
        if (!intentRef.current) {
          setStatus("idle");
          return;
        }
        const Ctor = getRecognitionCtor();
        if (!Ctor) return;
        const next = new Ctor();
        attachHandlers(next);
        recognitionRef.current = next;
        try {
          next.start();
        } catch {
          intentRef.current = false;
          setSpeechError("Could not restart microphone");
          setStatus("error");
        }
      };
    },
    [lang]
  );

  const stop = useCallback(() => {
    intentRef.current = false;
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    setStatus("idle");
  }, []);

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      setStatus("unsupported");
      return;
    }
    intentRef.current = true;
    finalRef.current = "";
    setTranscript("");
    setSpeechError(null);

    const rec = new Ctor();
    attachHandlers(rec);
    recognitionRef.current = rec;
    try {
      rec.start();
      setStatus("listening");
    } catch {
      intentRef.current = false;
      setSpeechError("Could not start microphone");
      setStatus("error");
    }
  }, [attachHandlers]);

  useEffect(() => () => recognitionRef.current?.abort(), []);

  return {
    status,
    transcript,
    speechError,
    start,
    stop,
    supported: getRecognitionCtor() !== null,
  };
}
