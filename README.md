# AI Teleprompter

A fast, speech-synced teleprompter for reading scripts out loud. Paste your script, start a read-back session, and the prompter keeps the next lines in view while tracking what you’re saying (including light paraphrasing and short tangents).

![AI Teleprompter](ai-teleprompter-example.jpeg)

## Features

- **Speech-synced scrolling**: highlights the next word and scrolls as you speak.
- **Readable prompter layout**: large text, limited lines, minimal eye travel.
- **Session controls**: start read-back, end session, and switch reading theme.
- **Runs locally**: plain HTML/CSS/JS — no build step required.

## Quick Start

### 1) Run locally

Speech recognition typically requires the page to be served over `http://localhost` (opening `index.html` via `file://` often blocks mic/speech APIs).

From the repo root:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000` in your browser.

### 2) Use the App

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

## Specs

The original product spec is preserved in `ai-teleprompter-specs.md`.