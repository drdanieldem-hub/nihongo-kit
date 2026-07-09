# 🇯🇵 Japan Phrases

Single-file mobile-first romaji-only Japanese survival phrasebook for tourists.

**Live:** https://drdanieldem-hub.github.io/nihongo-kit/

## What's in it

5 categories of phrases + 9 grammar cards:

| | |
|---|---|
| 🛒 **Shop** | prices, this one please, try on, just looking, allergies |
| 🍱 **Food** | menu, recommend, water, allergy card, check, split, tap-itadakimasu |
| 🗺 **Going** | where is X, this address (for taxis), station, last train, walk time, taxi |
| ☀️ **Talk** | weather openers, "I'm from ~", compliments, small talk |
| ⚡ **Grammar** | particles (wa, ga, o, ni, de, e), politeness, request verbs, yes/no questions |

61 total items. **Romaji only — no kana anywhere on screen.**

Each row has a ▶ button to hear the phrase spoken (Web Speech API; falls back silently to ♪ if no `ja-JP` voice). Top-bar 🔍 searches across English and romaji. 🌙 is dark mode.

## Repo

This is a single-file project. All the app lives in `index.html` at the repo
root — data, styles, JS, audio logic, search, dark mode, everything. Edit
that one file, push, the GitHub Action redeploys.

```
nihongo-kit/
├── build.py          # copies index.html → dist/index.html for Pages
├── index.html        # THE WHOLE APP — edit this
├── dist/             # build artifact (gitignored)
└── .github/workflows/pages.yml
```

## Use on your phone

Open the live URL → tap share → **Add to Home Screen**. Works offline
once cached. No accounts, no tracking, no assets, no network requests.
