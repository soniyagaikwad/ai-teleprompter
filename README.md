# AI Teleprompter

A fast, speech-synced teleprompter for reading scripts out loud. Paste your script, start a read-back session, and the prompter keeps the next lines in view while tracking what you’re saying (including light paraphrasing and short tangents).

![AI Teleprompter](ai-teleprompter-example.jpeg)

## Features

- **Speech-synced scrolling**: highlights the next word and scrolls as you speak.
- **Readable prompter layout**: large text, limited lines, minimal eye travel.
- **Session controls**: start read-back, end session, and switch reading theme.

## Quick Start

### 1) Try it on GitHub Pages

You can use the hosted build on **[GitHub Pages](https://soniyagaikwad.github.io/ai-teleprompter/)**!

### 2) Run locally

Speech recognition typically requires the page to be served over `http://localhost` (opening `index.html` via `file://` often blocks mic/speech APIs).

From the repo root:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000` in your browser.

### 3) Use the App

- **Paste or write** your script in the “Your script” box.
- Click **Read back script**.
- When prompted, **allow microphone access**.
- Start reading — the prompter will follow along and scroll to keep upcoming text visible.

## Browser support

- **Recommended**: latest Chrome or Edge (desktop).
- If you see “Speech recognition is not available in this browser”, switch to Chrome/Edge.

## Tips for best results

- **Use a decent mic** and a quiet room for fewer recognition errors.
- **Add punctuation** to your script — it improves pacing and matching.
- If you tend to ad-lib, **keep tangents short**; the prompter will generally recover when you return to the script.

## Troubleshooting

- **Mic permission denied**: check your browser site settings for `http://localhost:8000` and allow Microphone.
- **Nothing happens when starting**: confirm you’re not using a `file://` URL; run a local server as above.
- **Recognition stops mid-session**: some browsers pause recognition after silence — try speaking a bit louder/closer to the mic, or restart the session.

## Project Layout

- `index.html`: app shell + UI structure
- `styles.css`: styling for editor + reading mode
- `app.js`: app logic (speech recognition + scrolling/highlighting)

## Technical Decisions

- **On-device speech (Web Speech API) instead of a hosted ASR or LLM** — keeps the read-back loop fast and simple (no API keys, no audio upload), at the cost of being Chrome/Edge-first and accepting whatever quality the browser’s bundled recognizer delivers.
- **Tail-anchored dynamic programming for script position, not prompt engineering** — the hard part is that the live transcript rarely matches the script verbatim (missed words, paraphrase, short tangents, ASR errors). The matcher scores the **last ~96 spoken tokens** against the full script with penalties for skipping script words vs skipping “extra” spoken words, so ad-libs don’t permanently derail alignment and the UI can recover when the speaker returns to the script.
- **ASR-tolerant token matching** — normalized tokens (case/diacritics stripped) plus bounded Levenshtein distance, prefix/substring relaxations on longer tokens, and a **hint** from the last aligned index to break ties so the cursor doesn’t jitter on ambiguous matches.
- **Interim + continuous recognition** — `interimResults` and a restart-on-`onend` loop so partial transcripts update the prompter quickly; that’s what makes the experience feel “synced” rather than batch-updated on sentence boundaries.
- **Prompter layout as a product constraint** — about **five words per line** (with breaks favored after sentence punctuation), **at most ~four lines** in view, and a measured **width cap** on font size so lines don’t clip on large or external monitors while still honoring the “large type, little eye travel” spec.

## Potential Enhancements

- **Upload text documents and extract a script** — supporting `.txt`, `.docx`, or PDF would let people pull a talk straight from notes or a draft without copy-paste friction. The interesting work is layout-aware extraction (headings, slide notes vs body) and a clear preview so users can edit before read-back.
- **Upload a slide deck and generate a script from the presentation** — slide titles, bullet fragments, and speaker notes are rarely ready to read verbatim; a pipeline could turn them into full sentences with connective tissue, then feed the same teleprompter UI. That implies owning file parse (e.g. PPTX), optional LLM pass for generation, and guardrails so the on-screen script stays faithful to what the author approved.
- **Live speaking-rate estimates and pacing feedback** — use the transcript stream (and timestamps if available) to approximate WPM or syllable rate, compare to a target range or rehearsal baseline, then surface gentle nudges (“a little slower”, “you’re ahead of this section”) without fighting the existing alignment logic.

## Specs

The original product spec is preserved in `ai-teleprompter-specs.md`.