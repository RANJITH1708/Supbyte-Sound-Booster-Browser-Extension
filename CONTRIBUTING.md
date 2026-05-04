# Contributing to Supbyte Sound Booster

Thank you for your interest in contributing! Here is everything you need to get started.

## Ways to Contribute

- **Report a bug** — open an issue using the bug report template
- **Request a feature** — open an issue using the feature request template
- **Add a language** — add a new folder under `_locales/` with translated `messages.json`
- **Submit a fix or improvement** — fork, branch, and open a pull request

## Development Setup

```bash
git clone https://github.com/RANJITH1708/Supbyte-Sound-Booster-Browser-Extension.git
cd Supbyte-Sound-Booster-Browser-Extension
```

1. Open `chrome://extensions` in Chrome
2. Enable **Developer mode**
3. Click **Load unpacked** → select the cloned folder
4. Click the refresh icon on the extension card after making changes

## Pull Request Guidelines

- Create a branch from `main` with a descriptive name (`fix/gain-clipping`, `feat/custom-eq`, `i18n/add-arabic`)
- Keep PRs focused — one change per PR
- Test audio boosting on at least two different sites (e.g. YouTube, Spotify Web)
- For AudioWorklet changes, verify there is no added latency or dropout
- Describe what you changed and why in the PR description

## Adding a New Language

1. Create `_locales/<locale_code>/messages.json` (e.g. `_locales/ar/messages.json`)
2. Copy `_locales/en/messages.json` as a template and translate all `message` values
3. Leave `description` fields in English for maintainer reference
4. Open a PR titled `i18n: add <language> translation`

## Reporting Bugs

Please include:
- Chrome version and OS
- The website where the bug occurs
- Steps to reproduce
- What you expected vs. what actually happened (include any console errors if visible)

## Code Style

- Plain JavaScript (no build step required)
- Match the formatting of the existing files
- AudioWorklet processors (`bypass_processor.js`, `keep-alive-processor.js`) must remain synchronous and allocation-free to avoid audio glitches
