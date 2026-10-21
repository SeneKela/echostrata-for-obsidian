<p align="center">
  <img src="assets/Echostrata-banner.png" alt="Echostrata for Obsidian" width="100%">
</p>

<h1 align="center">Echostrata, for Obsidian</h1>

<p align="center">
  <strong>Record. Transcribe. Locally.</strong><br>
  Record your microphone and your Mac's system audio directly within the note you're writing.<br>
  Get a transcript with speaker labels, a summary and action items. Nothing leaves your Mac.
</p>

<p align="center">
  <img alt="Platform" src="https://img.shields.io/badge/platform-macOS%2013%2B-232327">
  <img alt="Obsidian" src="https://img.shields.io/badge/Obsidian-1.5%2B-232327">
  <img alt="Desktop only" src="https://img.shields.io/badge/desktop-only-232327">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-232327">
</p>

<p align="center">
  <img src="assets/Echostrataforobsidian-Teaser.gif" alt="Echostrata in action" width="100%">
</p>

---

## Why Echostrata

Meeting tools upload your conversations to someone else's servers. Echostrata doesn't.

- 🎙 **Mic + system audio.** Captures your voice *and* what your Mac plays: Zoom, Teams, Meet, a browser tab, a video.
- 📝 **Directly within Obsidian.** Click record in a note. The audio, transcript and summary land in that same note.
- 🗣 **Knows who spoke.** Your mic and the system audio are recorded on separate channels, so lines are labelled **Me** and **Others** without any speaker-recognition model.
- ✨ **Summaries and action items.** A local model writes a title, summary, key points and to-do checkboxes.
- 🔒 **Nothing leaves your Mac.** Transcription runs on [whisper.cpp](https://github.com/ggerganov/whisper.cpp), summaries on [Ollama](https://ollama.com). No account, no API key, no subscription, no cloud.

## What you get in your note

```markdown
![[Recording 2026-10-20 10.31.05.m4a]]

> [!abstract] Q4 roadmap sync
> The team agreed on the Q4 order: search first, then sharing. Beta date confirmed.
>
> **Key points**
> - Search ships before sharing
> - Beta locked for November 14
>
> **Action items**
> - [ ] Draft the launch checklist
> - [ ] Share the beta build with the team

> [!quote]- Transcript · 24:13 · Me / Others
> `00:00` **Me:** Let's lock the Q4 roadmap today.
>
> `00:07` **Others:** Search ships first, then sharing.
```

The transcript is folded by default so the summary stays on top.

## Features

| | |
|---|---|
| **One-click recording** | A mic button in the note header turns into a red **■ 03:12** timer while recording. The ribbon icon, a command and the status bar also start and stop recording. |
| **Floating recording bar** | Live waveform, separate Mic and System level meters, plus **Pause**, **Stop** and **Discard** buttons. After you stop, it shows transcription progress. |
| **Live note updates** | A "Recording…" placeholder appears where your cursor is. It becomes "Transcribing…", then the final result. |
| **Built-in system audio** | Uses Apple's ScreenCaptureKit. No virtual audio driver, no Multi-Output Device, and your volume keys keep working. |
| **Speaker labels** | Me / Others, with names you can change. Silent channels are skipped automatically. |
| **Local summaries** | Choose any model installed in Ollama from a dropdown. |
| **Guided setup** | A setup assistant checks and installs everything without opening Terminal. |
| **Long sessions** | Audio is written to disk as it records, and your Mac is kept awake while recording and transcribing. |
| **Clean output** | Whisper artefacts such as `[BLANK_AUDIO]`, `(music)` and repeated lines are filtered out. |

## Requirements

- **macOS 13 Ventura or later** for built-in system-audio capture. Older macOS versions can use [BlackHole](https://existential.audio/blackhole/) instead.
- **Obsidian 1.5+**, desktop.
- **[Homebrew](https://brew.sh)**, used to install whisper.cpp.
- **Xcode Command Line Tools**, used to build the small system-audio helper once. They're already installed if you have Homebrew.
- **[Ollama](https://ollama.com/download)**, *optional*, for summaries.
- About **0.6 GB** of disk for the default speech model, plus **2.6 GB** if you add `qwen3:4b` for summaries.

## Installation

### Manual

1. Download `main.js`, `manifest.json` and `styles.css` from the latest release.
2. Copy them into `<your vault>/.obsidian/plugins/echostrata/`.
3. In Obsidian, go to **Settings → Community plugins** and enable **Echostrata**.

### With BRAT

1. Install the **BRAT** community plugin.
2. **BRAT → Add beta plugin** → paste this repository's URL.

## Setup (about 5 minutes, no terminal)

The **setup assistant** opens the first time you enable the plugin. You can reopen it any time from **Settings → Echostrata → Open setup**. Each row turns green when it's ready:

| Step | What it does |
|---|---|
| **Microphone access** | Checks that macOS lets Obsidian use the microphone. |
| **Built-in system audio** | Click **Prepare** to build a small local helper (one time, about 30 s). |
| **Speech engine** | Installs `whisper-cpp` with Homebrew. It uses the Apple Silicon GPU. |
| **Speech model** | Downloads the default model (*Large v3 Turbo q5*, ~570 MB, multilingual). |
| **Summaries (Ollama)** | Optional. Pick an installed model, or download `qwen3:4b` / `qwen3:8b` with one click. |

**First recording:** macOS asks to allow Obsidian under **Privacy & Security → Screen & System Audio Recording**. Allow it, then **quit and reopen Obsidian**. The permission only takes effect after a restart.

**Check it works:** play a video, then click **Settings → Echostrata → Test system audio**. You should see ✅ and a level reading.

## Usage

1. Open a note and put your cursor where the recording should go.
2. Click the **🎙 button** in the note header, or run **Echostrata: Start / stop recording in current note**.
3. Talk, join your call, play your video. Use **Pause** or **Discard** from the floating bar if you need to.
4. Click **Stop**. Transcription starts right away, and the note fills in when it's done.

Processing time is roughly **1 minute per 20 minutes of audio**, plus a few seconds for the summary.

### Commands

| Command |
|---|
| Start / stop recording in current note |
| Pause / resume recording |
| Discard current recording |
| Open setup assistant |

Assign hotkeys in **Settings → Hotkeys → search "Echostrata"**.

## Settings

| Section | Setting | Default |
|---|---|---|
| **Audio sources** | Microphone | System default |
| | System audio | Built-in macOS capture (BlackHole, a specific device or Off are also available) |
| | Test system audio | — |
| | Microphone echo cancellation | On |
| | Microphone level / System audio level | 1.0 / 1.0 |
| **Notes** | Insert recording at | Cursor position |
| | Recordings folder | Obsidian's attachment folder |
| **Transcription** | Speech model | Large v3 Turbo (q5) |
| | Language | Auto-detect |
| | Label speakers | On |
| | Speaker names | Me / Others |
| | Show timestamps | On |
| | Fold transcript callout | On |
| | whisper.cpp binary | Auto-detect |
| | CPU threads | Automatic |
| **Summary** | Generate title, summary, key points & action items | On |
| | Ollama URL | `http://127.0.0.1:11434` |
| | Ollama model | Dropdown of your installed models |
| **Other** | Keep Mac awake | On |

### Speech models

| Model | Size | Best for |
|---|---|---|
| Base | ~150 MB | Quick drafts |
| Small | ~490 MB | English, fast |
| **Large v3 Turbo (q5)** | **~570 MB** | **Best balance, multilingual (default)** |
| Large v3 Turbo | ~1.6 GB | Highest quality |

## Privacy

Echostrata is built so that **everything that should stay private, stays private.**

- **Recording** happens inside Obsidian. Audio files are saved in your vault, next to your notes.
- **Transcription** runs on your Mac with whisper.cpp. No audio is uploaded anywhere.
- **Summaries** run on your Mac with Ollama, which listens on `127.0.0.1` by default. Your transcript never goes to a remote AI service.
- **No telemetry.** No analytics, no account, no API keys.
- **Temporary files** (separate mic, system and mixed WAV tracks) are written to your system's temp folder and deleted when processing finishes.

**The only network traffic is the one-time setup downloads you trigger yourself:**

- whisper.cpp, from Homebrew;
- the speech model, from Hugging Face (`ggerganov/whisper.cpp`);
- Ollama models, from the Ollama registry.

After setup, Echostrata works fully offline.

> If you point **Ollama URL** to a remote server, transcripts will be sent there for summarising. Keep the default `127.0.0.1` to stay fully local.

## How it works

```
Microphone ──────────┐
                     ├─► Web Audio graph ──► MediaRecorder ──► Recording.m4a (your vault)
System audio ────────┘         │
(ScreenCaptureKit helper       └─► AudioWorklet: 48 kHz → 16 kHz, level meters
 or BlackHole)                          │
                                        └─► mic.wav · system.wav · mix.wav (temp, streamed to disk)

Stop ─► whisper.cpp on mic.wav + system.wav ─► merged by timestamp ─► Me / Others paragraphs
     ─► Ollama (JSON) ─► title · summary · key points · action items ─► written into the note
```

- **System audio:** a tiny Swift program using Apple's ScreenCaptureKit captures what the Mac plays and streams it to the plugin. It's compiled on your Mac from source bundled in the plugin, so there's no prebuilt binary to trust.
- **Note updates:** the in-note placeholder is marked with invisible Obsidian comments (`%%…%%`), so it's updated in place and the markers are removed once the final content is written.

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Microphone access denied" | **System Settings → Privacy & Security → Microphone →** enable Obsidian, then restart Obsidian. |
| Only **Me** in the transcript | System audio is blocked or Off. Allow Obsidian under **Screen & System Audio Recording**, restart, then run **Test system audio**. |
| Test system audio heard silence | Make sure something is actually playing. If it is, it's almost always the permission above. |
| "Building the system-audio helper failed" | Install the Command Line Tools (`xcode-select --install`), then click **Prepare** again. Or switch **System audio** to BlackHole. |
| "Transcription is not set up yet" | Open the setup assistant and finish **Speech engine** and **Speech model**. |
| No summary appears | Ollama isn't running, or no model is selected. Open Ollama, then pick a model in **Settings → Ollama model**. |
| Using BlackHole and you can't hear anything | Your output is set to BlackHole alone. Use a **Multi-Output Device** (speakers + BlackHole) in Audio MIDI Setup. |

## Building from source

```bash
git clone https://github.com/SeneKela/echostrata-for-obsidian
cd echostrata
npm install
npm run build   # → main.js
npm run dev     # watch mode
```

Then copy `main.js`, `manifest.json` and `styles.css` into your vault's plugin folder.

Project layout:

```
src/
  main.ts           plugin entry, commands, recording lifecycle
  recorder.ts       Web Audio graph, AudioWorklet, MediaRecorder
  native-audio.ts   ScreenCaptureKit helper (Swift source, build, stream)
  devices.ts        microphone / loopback device detection
  session.ts        recording session + processing job (save → transcribe → summarise)
  transcriber.ts    whisper.cpp runner, models, paragraphs
  summarizer.ts     Ollama models and summaries
  note.ts           in-note block insert / update / remove
  ui.ts             header button, floating bar, ribbon, status bar
  setup.ts          setup assistant
  settings.ts       settings tab
  resampler.ts      streaming 48 → 16 kHz resampler
  wav.ts            streaming WAV writer
styles.css          Figma-style UI
```

## Roadmap

- [ ] Windows and Linux system-audio capture
- [ ] Re-transcribe an existing recording
- [ ] Custom summary prompts and templates
- [ ] Live transcript while recording

## Credits

- Inspired by [Lecture Transcriber](https://github.com/AbyssLotus/obsidian-lecture-transcriber) by AbyssLotus.
- Speech recognition: [whisper.cpp](https://github.com/ggerganov/whisper.cpp) by Georgi Gerganov, using OpenAI's Whisper models.
- Local language models: [Ollama](https://ollama.com).
- Optional loopback driver: [BlackHole](https://existential.audio/blackhole/) by Existential Audio.

## License

[MIT](LICENSE) © Martin Burkel
