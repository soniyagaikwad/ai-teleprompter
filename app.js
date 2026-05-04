(function () {
  "use strict";

  const WORDS_PER_LINE = 5;

  /** Last aligned script cursor (index of “here” word); stabilizes ties in tail DP. */
  let rollSpeechCursorHint = 0;

  /** Recent transcript tokens aligned to script (handles ad-libs, skips, jump-back). */
  const TAIL_ALIGN_LEN = 96;
  const MATCH_SCORE = 6;
  const SKIP_SPOKEN_SCORE = -0.22;
  const SKIP_SCRIPT_SCORE = -3.4;
  const DP_NEG = -1e15;

  /**
   * Pack script words into lines of at most `maxPerLine`, preferring breaks
   * after sentence punctuation so lines read like phrases (README: ~5 words
   * per line, minimal horizontal eye travel).
   */
  function buildTeleprompterLines(words, maxPerLine) {
    const lines = [];
    let i = 0;
    while (i < words.length) {
      const remaining = words.length - i;
      let end = i + Math.min(maxPerLine, remaining);

      if (end - i === maxPerLine && end < words.length) {
        for (let j = i; j < end - 1; j++) {
          if (/[.!?…]"?$/.test(words[j].display)) {
            end = j + 1;
            break;
          }
        }
      }

      if (end === i) end = i + 1;
      lines.push(words.slice(i, end));
      i = end;
    }
    return lines;
  }

  function lineIndexForWordIndex(lineStarts, wordIdx) {
    if (wordIdx < 0 || !lineStarts.length) return 0;
    for (let li = 0; li < lineStarts.length; li++) {
      const start = lineStarts[li];
      const nextStart =
        li + 1 < lineStarts.length ? lineStarts[li + 1] : Infinity;
      if (wordIdx < nextStart) return li;
    }
    return Math.max(0, lineStarts.length - 1);
  }
  const SAMPLE =
    "Welcome everyone. Thank you for being here today. We are excited to share what we have been building. This teleprompter listens as you speak and keeps the script in view. Feel free to ad-lib between lines, and the scroll catches up when you return to the script.";

  function normalizeToken(raw) {
    return raw
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/[^a-z0-9']/g, "");
  }

  function tokenizeTranscript(text) {
    return text
      .split(/\s+/)
      .map((w) => w.trim())
      .filter(Boolean)
      .map((w) => normalizeToken(w))
      .filter(Boolean);
  }

  function parseScriptWords(text) {
    return text
      .split(/\s+/)
      .map((w) => w.trim())
      .filter(Boolean)
      .map((display) => ({
        display,
        norm: normalizeToken(display),
      }))
      .filter((w) => w.norm.length > 0);
  }

  function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    const row = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      let prev = i;
      for (let j = 1; j <= b.length; j++) {
        const cur =
          a[i - 1] === b[j - 1]
            ? row[j - 1]
            : 1 + Math.min(row[j - 1], row[j], prev);
        row[j - 1] = prev;
        prev = cur;
      }
      row[b.length] = prev;
    }
    return row[b.length];
  }

  function tokensFuzzyEqual(scriptTok, spokenTok) {
    if (!scriptTok || !spokenTok) return false;
    if (scriptTok === spokenTok) return true;
    const maxDist =
      scriptTok.length <= 4 ? 1 : scriptTok.length <= 8 ? 2 : 3;
    return levenshtein(scriptTok, spokenTok) <= maxDist;
  }

  /**
   * ASR-tolerant match (proper nouns, truncation): extends fuzzy equality with
   * prefix overlap and larger edit budgets on long tokens.
   */
  function tokensRelaxedMatch(scriptTok, spokenTok) {
    if (tokensFuzzyEqual(scriptTok, spokenTok)) return true;
    if (!scriptTok || !spokenTok) return false;
    const s = scriptTok;
    const t = spokenTok;
    const minLen = Math.min(s.length, t.length);
    if (minLen >= 5) {
      if (s.startsWith(t) || t.startsWith(s)) return true;
      if (minLen >= 6) {
        const short = s.length <= t.length ? s : t;
        const long = s.length <= t.length ? t : s;
        if (short.length >= 8 && long.includes(short)) return true;
      }
    }
    const L = Math.max(s.length, t.length);
    if (L >= 10) {
      const d = levenshtein(s, t);
      const maxDist = L <= 14 ? 4 : L <= 20 ? 5 : 6;
      return d <= maxDist;
    }
    return false;
  }

  /**
   * Tail-anchored alignment: DP over the last `TAIL_ALIGN_LEN` spoken tokens vs
   * full script. Any script start is allowed (jump-in / jump-back); extra
   * spoken tokens (ad-lib) and skipped script words are penalized. Returns the
   * script index of the “here” word (count of past words).
   */
  function tailAnchoredScriptCursor(scriptNorm, spokenNorm, hint) {
    const N = scriptNorm.length;
    const hintJ = Math.max(0, Math.min(hint | 0, N));
    if (!N) return 0;
    if (!spokenNorm.length) return 0;

    const tailTake = Math.min(spokenNorm.length, TAIL_ALIGN_LEN);
    const tailStart = spokenNorm.length - tailTake;
    const T = tailTake;

    let prev = new Float64Array(N + 1);
    let cur = new Float64Array(N + 1);
    for (let j = 0; j <= N; j++) prev[j] = 0;

    for (let ti = 0; ti < T; ti++) {
      const tok = spokenNorm[tailStart + ti];
      cur.fill(DP_NEG);

      for (let j = 0; j <= N; j++) {
        const v = prev[j] + SKIP_SPOKEN_SCORE;
        if (v > cur[j]) cur[j] = v;
      }
      for (let j = 0; j < N; j++) {
        if (tokensRelaxedMatch(scriptNorm[j], tok)) {
          const v = prev[j] + MATCH_SCORE;
          if (v > cur[j + 1]) cur[j + 1] = v;
        }
      }
      for (let j = 1; j <= N; j++) {
        const v = cur[j - 1] + SKIP_SCRIPT_SCORE;
        if (v > cur[j]) cur[j] = v;
      }

      const swap = prev;
      prev = cur;
      cur = swap;
    }

    let best = DP_NEG;
    let bestJ = hintJ;
    for (let j = 0; j <= N; j++) {
      const v = prev[j];
      if (v > best) {
        best = v;
        bestJ = j;
      } else if (v === best && v > DP_NEG + 1) {
        const da = Math.abs(j - hintJ);
        const db = Math.abs(bestJ - hintJ);
        if (da < db || (da === db && j > bestJ)) bestJ = j;
      }
    }
    if (best <= DP_NEG + 1) return hintJ;
    return bestJ;
  }

  function getRecognitionCtor() {
    return (
      window.SpeechRecognition || window.webkitSpeechRecognition || null
    );
  }

  const speech = {
    recognition: null,
    final: "",
    intent: false,
    lang: "en-US",
    onTranscript: function () {},
    onListeningChange: function () {},
    onError: function () {},
    attachHandlers: function (rec) {
      const self = speech;
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = self.lang;
      rec.maxAlternatives = 1;

      rec.onresult = function (ev) {
        let interim = "";
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const r = ev.results[i];
          const text = (r[0] && r[0].transcript) || "";
          if (r.isFinal) self.final += text + " ";
          else interim += text;
        }
        self.onTranscript((self.final + interim).trim());
      };

      rec.onerror = function (ev) {
        if (ev.error === "aborted") return;
        if (ev.error === "no-speech") return;
        self.intent = false;
        self.onError(ev.error);
      };

      rec.onend = function () {
        self.recognition = null;
        if (!self.intent) {
          self.onListeningChange(false);
          return;
        }
        const Ctor = getRecognitionCtor();
        if (!Ctor) return;
        const next = new Ctor();
        self.attachHandlers(next);
        self.recognition = next;
        try {
          next.start();
        } catch {
          self.intent = false;
          self.onError("Could not restart microphone");
        }
      };
    },
    start: function () {
      const Ctor = getRecognitionCtor();
      if (!Ctor) return false;
      this.intent = true;
      this.final = "";
      this.onTranscript("");
      const rec = new Ctor();
      this.attachHandlers(rec);
      this.recognition = rec;
      try {
        rec.start();
        this.onListeningChange(true);
        return true;
      } catch {
        this.intent = false;
        this.onError("Could not start microphone");
        return false;
      }
    },
    stop: function () {
      this.intent = false;
      if (this.recognition) {
        this.recognition.abort();
        this.recognition = null;
      }
      this.onListeningChange(false);
    },
  };

  const ROLL_THEME_KEY = "aiTeleprompterRollTheme";

  const el = {
    screenEditor: document.getElementById("screen-editor"),
    screenRoll: document.getElementById("screen-roll"),
    scriptInput: document.getElementById("script-input"),
    wordCount: document.getElementById("word-count"),
    btnRead: document.getElementById("btn-read"),
    btnRollTheme: document.getElementById("btn-roll-theme"),
    btnEnd: document.getElementById("btn-end"),
    bannerUnsupported: document.getElementById("banner-unsupported"),
    bannerError: document.getElementById("banner-error"),
    rollScroll: document.getElementById("roll-scroll"),
    rollViewport: document.getElementById("roll-viewport"),
    rollDot: document.getElementById("roll-dot"),
    rollStatusText: document.getElementById("roll-status-text"),
    rollProgress: document.getElementById("roll-progress"),
  };

  let sessionWords = [];
  let wordSpans = [];
  let lineEls = [];
  let sessionLineStarts = [];

  function getStoredRollTheme() {
    try {
      const v = localStorage.getItem(ROLL_THEME_KEY);
      if (v === "light" || v === "dark") return v;
    } catch (e) {
      /* ignore */
    }
    return "dark";
  }

  function applyRollTheme(theme) {
    const root = el.screenRoll;
    if (!root) return;
    const light = theme === "light";
    root.classList.toggle("roll-root--light", light);
    const btn = el.btnRollTheme;
    if (!btn) return;
    btn.setAttribute("aria-pressed", light ? "true" : "false");
    btn.setAttribute(
      "aria-label",
      light
        ? "Reading theme is light. Switch to dark theme for the teleprompter."
        : "Reading theme is dark. Switch to light theme for the teleprompter."
    );
    btn.title = light
      ? "Switch to dark theme"
      : "Switch to light theme";
  }

  function toggleRollTheme() {
    const next = el.screenRoll.classList.contains("roll-root--light")
      ? "dark"
      : "light";
    applyRollTheme(next);
    try {
      localStorage.setItem(ROLL_THEME_KEY, next);
    } catch (e) {
      /* ignore */
    }
  }

  function updateWordCount() {
    if (!el.wordCount) return;
    const n = parseScriptWords(el.scriptInput.value).length;
    el.wordCount.textContent = n ? n + (n === 1 ? " word" : " words") : "";
  }

  function updateReadButton() {
    const supported = !!getRecognitionCtor();
    const words = parseScriptWords(el.scriptInput.value);
    const ok =
      supported &&
      el.scriptInput.value.trim() &&
      words.length > 0;
    el.btnRead.disabled = !ok;
    updateWordCount();
  }

  function setEditorError(msg) {
    if (msg) {
      el.bannerError.textContent = "Microphone error: " + msg;
      el.bannerError.hidden = false;
    } else {
      el.bannerError.hidden = true;
    }
  }

  function renderRoll(words) {
    rollSpeechCursorHint = 0;
    sessionWords = words;
    wordSpans = [];
    lineEls = [];
    sessionLineStarts = [];
    el.rollScroll.textContent = "";

    const lineSlices = buildTeleprompterLines(words, WORDS_PER_LINE);
    let wordIdx = 0;
    for (let li = 0; li < lineSlices.length; li++) {
      const slice = lineSlices[li];
      sessionLineStarts.push(wordIdx);

      const line = document.createElement("div");
      line.className = "roll-line";
      lineEls.push(line);

      for (let j = 0; j < slice.length; j++) {
        const span = document.createElement("span");
        span.className = "roll-word roll-word--ahead";
        span.textContent = slice[j].display;
        span.dataset.wordIndex = String(wordIdx);
        wordSpans[wordIdx] = span;
        line.appendChild(span);
        wordIdx++;
      }
      el.rollScroll.appendChild(line);
    }
  }

  function scrollToFocus(focusLineIndex) {
    const view = el.rollViewport;
    const lineEl = lineEls[focusLineIndex];
    if (!view || !lineEl) return;
    const readBand = view.clientHeight * 0.38;
    const lineRect = lineEl.getBoundingClientRect();
    const viewRect = view.getBoundingClientRect();
    const delta = lineRect.top - viewRect.top - readBand;
    const next = view.scrollTop + delta;
    view.scrollTop = Math.max(0, next);
  }

  function updateRollUI(transcript) {
    const normWords = sessionWords.map((w) => w.norm);
    const spoken = tokenizeTranscript(transcript);
    const matchedCount = tailAnchoredScriptCursor(
      normWords,
      spoken,
      rollSpeechCursorHint
    );
    rollSpeechCursorHint = matchedCount;

    for (let i = 0; i < wordSpans.length; i++) {
      const span = wordSpans[i];
      if (!span) continue;
      const state =
        i < matchedCount ? "past" : i === matchedCount ? "here" : "ahead";
      span.className = "roll-word roll-word--" + state;
    }

    if (sessionWords.length) {
      el.rollProgress.textContent =
        Math.min(matchedCount, sessionWords.length) +
        " / " +
        sessionWords.length +
        " words";
    } else {
      el.rollProgress.textContent = "";
    }

    const linesLen = lineEls.length;
    const focusLineIndex =
      linesLen === 0
        ? 0
        : Math.min(
            Math.max(
              0,
              lineIndexForWordIndex(sessionLineStarts, matchedCount)
            ),
            linesLen - 1
          );
    scrollToFocus(focusLineIndex);
  }

  function setRollListening(listening) {
    el.rollDot.classList.toggle("roll-dot--on", listening);
    el.rollStatusText.textContent = listening ? "Listening" : "Paused";
  }

  function beginRoll() {
    setEditorError("");
    const words = parseScriptWords(el.scriptInput.value);
    if (!getRecognitionCtor() || !el.scriptInput.value.trim() || !words.length)
      return;

    renderRoll(words);
    document.body.classList.add("mode-roll");
    el.screenEditor.hidden = true;
    el.screenRoll.hidden = false;

    speech.onTranscript = function (t) {
      updateRollUI(t);
    };
    speech.onListeningChange = function (on) {
      setRollListening(on);
    };
    speech.onError = function (err) {
      speech.stop();
      setRollListening(false);
      document.body.classList.remove("mode-roll");
      el.screenRoll.hidden = true;
      el.screenEditor.hidden = false;
      setEditorError(err);
      updateReadButton();
    };

    requestAnimationFrame(function () {
      updateRollUI("");
      requestAnimationFrame(function () {
        updateRollUI("");
        try {
          el.rollViewport.focus({ preventScroll: true });
        } catch {
          /* ignore */
        }
      });
    });
    if (!speech.start()) {
      document.body.classList.remove("mode-roll");
      el.screenRoll.hidden = true;
      el.screenEditor.hidden = false;
      setEditorError("Could not start microphone");
    }
  }

  function endRoll() {
    speech.stop();
    speech.onTranscript = function () {};
    speech.onError = function () {};
    document.body.classList.remove("mode-roll");
    el.screenRoll.hidden = true;
    el.screenEditor.hidden = false;
    updateReadButton();
  }

  function init() {
    el.scriptInput.value = SAMPLE;

    const supported = !!getRecognitionCtor();
    el.bannerUnsupported.hidden = supported;

    speech.onListeningChange = function () {};
    speech.onTranscript = function () {};
    speech.onError = function () {};

    applyRollTheme(getStoredRollTheme());
    el.btnRead.addEventListener("click", beginRoll);
    if (el.btnRollTheme) {
      el.btnRollTheme.addEventListener("click", toggleRollTheme);
    }
    el.btnEnd.addEventListener("click", endRoll);
    document.addEventListener("keydown", function (ev) {
      if (ev.key !== "Escape") return;
      if (!document.body.classList.contains("mode-roll")) return;
      ev.preventDefault();
      endRoll();
    });
    el.scriptInput.addEventListener("input", function () {
      updateReadButton();
      setEditorError("");
    });

    window.addEventListener("beforeunload", function () {
      speech.stop();
    });

    updateReadButton();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
