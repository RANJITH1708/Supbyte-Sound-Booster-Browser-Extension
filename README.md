# Supbyte Sound Booster — Volume Booster Browser Extension

[![Version](https://img.shields.io/badge/version-1.2.3-brightgreen)](manifest.json)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![Languages](https://img.shields.io/badge/Languages-10-orange)](_locales/)

> Amplify any website's audio up to 600%, dial in the perfect EQ, and control audio output per tab — all in real time.

## Features

- **Volume boost up to 600%** — push audio beyond the browser's default ceiling using Web Audio API gain nodes
- **4 EQ presets** — Flat, Voice, Bass, and Treble profiles for instant audio shaping
- **Per-tab output device selection** — route different tabs to different speakers or headphones simultaneously
- **Per-site memory** — the extension remembers your preferred volume and EQ for each website automatically
- **Real-time frequency analyzer** — live waveform visualizer shows the audio signal as you adjust
- **Keyboard shortcuts** — step volume up or down by 10% without opening the popup
- **Device safety** — volume drops to a safe level when you switch output devices
- **10 languages** — localized for EN, DE, ES, FR, IT, JA, KO, PT, RU, and ZH

## Keyboard Shortcuts

| Action | Windows / Linux | macOS |
|---|---|---|
| Increase volume +10% | `Ctrl+Shift+↑` | `⌘ Shift ↑` |
| Decrease volume −10% | `Ctrl+Shift+↓` | `⌘ Shift ↓` |

## How It Works

Supbyte Sound Booster captures each tab's audio stream via the Chrome Tab Capture API, routes it through a Web Audio API processing graph (gain node + EQ biquad filters + analyzer node), and plays it back through your selected output device. An offscreen document hosts the audio graph to keep it alive across tab navigations without interrupting playback.

## Getting Started (Development)

```bash
git clone https://github.com/RANJITH1708/Supbyte-Sound-Booster-Browser-Extension.git
```

1. Open `chrome://extensions` in Chrome
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked** and select the cloned folder
4. Click the Sound Booster icon on any tab, set the volume slider, and pick an EQ preset

## Project Structure

| File / Folder | Purpose |
|---|---|
| `manifest.json` | Extension config — permissions, commands, locales (Manifest V3) |
| `background.js` | Service worker — tab capture session management and routing |
| `offscreen.js/html` | Offscreen audio graph — gain node, EQ filters, frequency analyzer |
| `content.js` | Content script — volume HUD and media mute detection |
| `popup.html/css/js` | Main popup — volume slider, EQ selector, device picker, visualizer |
| `keep-alive-processor.js` | AudioWorklet — prevents audio context suspension |
| `_locales/` | i18n message strings for 10 languages |

## Contributing

Contributions are welcome — new EQ presets, additional language packs, UI improvements, and bug fixes are all appreciated.

Please read [CONTRIBUTING.md](CONTRIBUTING.md) to get started.

- **Bug reports** → [open an issue](https://github.com/RANJITH1708/Supbyte-Sound-Booster-Browser-Extension/issues/new?template=bug_report.md)
- **Feature requests** → [open an issue](https://github.com/RANJITH1708/Supbyte-Sound-Booster-Browser-Extension/issues/new?template=feature_request.md)
- **Pull requests** → fork the repo, create a branch, and submit a PR

## License

[MIT](LICENSE) © Ranjith Saila
