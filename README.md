# 🇯🇵 Nihongo Kit

Mobile-first, romaji-only Japanese survival phrasebook for tourists. Built as
a single-file PWA so it works offline the moment it's loaded — perfect for
"the station basement has no signal" situations.

**Live site:** https://drdanieldem-hub.github.io/nihongo-kit/

## What's in it

- 5 sections of essential phrases: Survival, Getting Around, Eating,
  Numbers/Time/Money, Hospitality & Hotels
- 12 Quick Grammar cards (particles, sentence patterns) — romaji only,
  no Japanese script, with real example phrases that link to the audio button
- Search across all phrases (English or romaji)
- Web Speech API audio (best-effort, falls back silently on devices
  without a `ja-JP` voice)
- Dark mode + favorites (saved offline, in localStorage)
- Romaji only — no kana, no kanji rendered anywhere

## Repo layout

```
nihongo-kit/
├── build.py                  # builds dist/index.html from content/*.json + templates/
├── content/                  # all editable content
│   ├── meta.json             # app title, version
│   ├── survival.json         # ~20 phrases per section
│   ├── getting-around.json
│   ├── eating.json
│   ├── numbers-time-money.json
│   ├── hospitality.json
│   └── grammar.json          # particle/pattern cards
├── templates/
│   ├── shell.html            # HTML skeleton
│   ├── app.css               # all styles, inlined at build
│   └── app.js                # all client JS, inlined at build
├── dist/                     # build output (gitignored)
└── .github/workflows/pages.yml
```

## Editing content

All phrases live in `content/*.json`. Run `python3 build.py --check` to
validate before pushing.

Each phrase has: `romaji`, `en`, optional `use`, `note`, `tags`, `polite`,
`placeholders`. The `ja` field is **not rendered** anywhere — kept only as
optional dev reference if a native reviewer wants to double-check a
phrase (drop it in `ja` and it'll be validated but invisible).

## Build

```bash
python3 build.py              # full build → dist/index.html
python3 build.py --check      # validate content (CI step)
python3 build.py --minify     # collapse whitespace in inline CSS/JS
```

GitHub Pages workflow auto-runs `--check` then `--minify` on every push
to `main`.

## Why romaji only?

This is built for someone who can't read kana and doesn't have time to
learn on this trip. Every phrase is shown in romanized Hepburn with macrons
(ō = long o, ū = long u, etc.), so pronunciation is unambiguous. The
grammar cards flag the two spelling/sound quirks (は said "wa", を said
"o") so you don't get blindsided.

## Future

Stuff deferred to v2 — katakana cheat sheet, on-the-fly kana transliteration
search, phrase audio recorded by a native speaker (currently best-effort TTS).
