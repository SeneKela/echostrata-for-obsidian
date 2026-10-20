# Note Recorder & Transcriber (Obsidian, macOS)

Record **your microphone and your Mac's system audio** (Zoom, Teams, Meet, browser) **inside the note you're writing**. You get a local transcript labelled *Me* / *Others*, and an optional title, summary, key points and action items written by Ollama. Everything runs on your Mac.

The approach comes from [Lecture Transcriber](https://github.com/AbyssLotus/obsidian-lecture-transcriber).

## Install
1. Copy `main.js`, `manifest.json` and `styles.css` into `<vault>/.obsidian/plugins/note-recorder-transcriber/`.
2. Enable the plugin. The setup assistant checks and installs:
   - microphone access
   - built-in system audio
   - whisper.cpp
   - the speech model
   - Ollama (optional): pick any installed model from the dropdown, or download a suggested one

## System audio
- **Default: built-in macOS capture.** Works on macOS 13 or later and needs no extra audio driver. In the setup assistant, click **Built-in system audio → Prepare**. This builds a small Swift helper once.
- **First recording:** macOS asks for permission. Allow **Obsidian** under **Privacy & Security → Screen & System Audio Recording**, then restart Obsidian.
- **Check it:** play a video, then use **Settings → Test system audio**.
- **Alternative:** BlackHole 2ch, routed through a Multi-Output Device in Audio MIDI Setup.

## Build
```bash
npm install && npm run build
```
