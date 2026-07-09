#!/usr/bin/env python3
"""
nihongo-kit build.py

Reads content/*.json + templates/ and produces dist/index.html.
Stdlib only. No external deps.

USAGE
  python3 build.py                  # full build -> dist/
  python3 build.py --check          # validate content only (no write, used in CI)
  python3 build.py --minify         # collapse whitespace in inlined CSS/JS
"""
from __future__ import annotations

import argparse
import html
import json
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CONTENT = ROOT / "content"
TEMPLATES = ROOT / "templates"
DIST = ROOT / "dist"

# Sections in tab-bar order
SECTION_ORDER = [
    "survival",
    "getting-around",
    "eating",
    "numbers-time-money",
    "hospitality",
]


# ─── Validation ────────────────────────────────────────────────────────────
ROMAJI_ALLOWED = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
                    "ā ī ū ē ō"
                    "' - .,?!()")


def validate_phrase(phrase: dict, section_id: str, ctx_path: str) -> list[str]:
    """Return a list of error strings. Empty list = ok."""
    errs = []
    pid = phrase.get("id") or "<missing id>"
    for field in ("romaji", "en"):
        if not phrase.get(field) or not isinstance(phrase[field], str):
            errs.append(f"{ctx_path} [{pid}]: '{field}' is required and must be a non-empty string")
    # romaji sanity: kana characters are NOT allowed in romaji field
    if phrase.get("romaji"):
        for ch in phrase["romaji"]:
            if ch.isalpha() and ord(ch) > 127 and ch.lower() not in {"ā", "ī", "ū", "ē", "ō"}:
                errs.append(
                    f"{ctx_path} [{pid}]: romaji contains non-ascii char '{ch}' "
                    "(macrons must be: a i u e o -> a i u e o)"
                )
                break
    # placeholder consistency
    placeholders = phrase.get("placeholders", [])
    expected_tokens = set()
    for ph in placeholders:
        if "token" not in ph:
            errs.append(f"{ctx_path} [{pid}]: placeholder missing 'token'")
        else:
            expected_tokens.add("{" + ph["token"] + "}")
    # check tokens referenced by ja/romaji/en strings are declared (only if the
    # phrase declares placeholders section; keep relaxed otherwise — empty list
    # means "no placeholders" which is fine for most phrases).
    if placeholders:
        for field in ("romaji", "ja", "en"):
            v = phrase.get(field) or ""
            for m in re.finditer(r"\{([A-Z0-9_-]+)\}", v):
                tok = "{" + m.group(1) + "}"
                if tok not in expected_tokens:
                    errs.append(f"{ctx_path} [{pid}]: '{field}' references undeclared placeholder {tok}")
    if phrase.get("ja") is not None and not isinstance(phrase["ja"], str):
        errs.append(f"{ctx_path} [{pid}]: 'ja' if present must be a string")
    return errs


def validate_grammar_card(card: dict, phrase_ids: set, ctx_path: str) -> list[str]:
    errs = []
    cid = card.get("id") or "<missing id>"
    for field in ("particle", "reads", "title", "rule", "plain"):
        if not card.get(field):
            errs.append(f"{ctx_path} [{cid}]: '{field}' is required")
    for ex in card.get("examples", []):
        ref = ex.get("ref")
        if not ref or ref not in phrase_ids:
            errs.append(f"{ctx_path} [{cid}]: example ref '{ref}' does not resolve to a known phrase")
    return errs


def load_content():
    """Load and validate all content. Returns (errors, data_dict)."""
    errs = []
    data: dict = {"sections": {}, "grammar": [], "meta": {}}

    # meta.json
    meta_path = CONTENT / "meta.json"
    if meta_path.exists():
        try:
            data["meta"] = json.loads(meta_path.read_text(encoding="utf-8"))
        except Exception as e:
            errs.append(f"meta.json: invalid JSON: {e}")
    else:
        data["meta"] = {"appTitle": "Nihongo Kit", "shortTitle": "Nihongo Kit", "version": "0.1.0"}

    # Phrase sections
    for sec_id in SECTION_ORDER:
        p = CONTENT / f"{sec_id}.json"
        if not p.exists():
            errs.append(f"content/{sec_id}.json: missing")
            continue
        try:
            sec = json.loads(p.read_text(encoding="utf-8"))
        except Exception as e:
            errs.append(f"content/{sec_id}.json: invalid JSON: {e}")
            continue
        if "id" not in sec:
            errs.append(f"content/{sec_id}.json: missing 'id'")
        if "title" not in sec:
            errs.append(f"content/{sec_id}.json: missing 'title'")
        if "phrases" not in sec or not isinstance(sec["phrases"], list):
            errs.append(f"content/{sec_id}.json: missing or invalid 'phrases' array")
            continue
        # Validate each phrase; give it the section id as default prefix
        for i, phrase in enumerate(sec["phrases"]):
            errs.extend(validate_phrase(
                phrase, sec_id, f"content/{sec_id}.json:phrases[{i}]"
            ))
            # Auto-prefix ids
            if not phrase.get("id"):
                prefix = sec_id.split("-")[0][:2]
                slug = re.sub(r"[^a-z0-9]+", "-", (phrase.get("romaji") or "").lower()).strip("-")[:30] or f"p{i}"
                phrase["id"] = f"{prefix}-{slug}-{i}"
        data["sections"][sec_id] = sec

    # Grammar
    gp = CONTENT / "grammar.json"
    if gp.exists():
        try:
            grammar = json.loads(gp.read_text(encoding="utf-8"))
        except Exception as e:
            errs.append(f"content/grammar.json: invalid JSON: {e}")
            return errs, data
        # Build phrase-id lookup across all sections
        section_ids_to_phrase_ids = {
            sid: {p["id"] for p in sec.get("phrases", [])}
            for sid, sec in data["sections"].items()
        }
        # Grammar card `ref` ids are global (unique per phrase), so flatten
        all_phrase_ids = set().union(*section_ids_to_phrase_ids.values())
        for i, card in enumerate(grammar.get("cards", [])):
            errs.extend(validate_grammar_card(
                card, all_phrase_ids, f"content/grammar.json:cards[{i}]"
            ))
        data["grammar"] = grammar.get("cards", [])

    return errs, data


# ─── Build ─────────────────────────────────────────────────────────────────
def render_inline_css(css: str, minify: bool) -> str:
    if not minify:
        return css
    # Naive whitespace minifier (safe: no transform-style calc etc.)
    css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
    css = re.sub(r"\s+", " ", css)
    css = re.sub(r"\s*([{};:,>])\s*", r"\1", css)
    return css.strip()


def render_inline_js(js: str, minify: bool) -> str:
    if not minify:
        return js
    # Collapse runs of whitespace outside strings — strict version for our hand-written JS
    # Use a simple state machine to skip string contents. Important: skip ${...}
    # substitutions inside template literals so we don't strip their braces/spaces.
    out = []
    in_str = False
    str_ch = ""
    in_tmpl_expr = 0  # depth of ${...} inside template literals
    i = 0
    in_comment = False
    while i < len(js):
        c = js[i]
        nxt = js[i+1] if i + 1 < len(js) else ""
        if in_comment:
            if c == "*" and nxt == "/":
                in_comment = False
                i += 2
                continue
            i += 1
            continue
        if in_tmpl_expr > 0:
            # Inside a ${...} interpolation. Track nested braces/brackets/parens
            # so we only exit when matching depth returns to 0.
            if c == "{":
                in_tmpl_expr += 1
                out.append(c); i += 1; continue
            if c == "}":
                in_tmpl_expr -= 1
                out.append(c); i += 1; continue
            out.append(c); i += 1; continue
        if not in_str:
            if c == "/" and nxt == "*":
                in_comment = True
                i += 2
                continue
            if c in ("'", '"'):
                in_str = True
                str_ch = c
                out.append(c)
                i += 1
                continue
            if c == "`":
                in_str = True
                str_ch = "`"
                out.append(c)
                i += 1
                continue
            if c == " " or c == "\n" or c == "\t":
                prev = out[-1] if out else ""
                if prev == " ":
                    pass
                elif prev in ("", "=", "(", "[", ",", ";", ":", "{", "!", "?", "+", "-", "*", "/", "&", "|"):
                    pass
                elif nxt in ("", "=", ")", "]", ",", ";", ":", "}", "!", "?", "+", "-", "*", "/", "&", "|"):
                    pass
                else:
                    out.append(" ")
                i += 1
                continue
            out.append(c)
            i += 1
        else:
            if c == "\\":
                out.append(c)
                if i + 1 < len(js):
                    out.append(js[i+1])
                    i += 2
                else:
                    i += 1
                continue
            if c == str_ch:
                in_str = False
                out.append(c)
                i += 1
                continue
            if c == "$" and str_ch == "`" and nxt == "{":
                # entering ${...}
                out.append("${")
                in_tmpl_expr = 1
                i += 2
                continue
            out.append(c)
            i += 1
    return "".join(out).strip()


def build(minify: bool = False, write: bool = True):
    errs, data = load_content()
    if errs:
        print("✗ Content errors:")
        for e in errs:
            print(f"  - {e}")
        return 1

    # Counters
    n_phrases = sum(len(s.get("phrases", [])) for s in data["sections"].values())
    n_grammar = len(data["grammar"])
    print(f"✓ Content validated: {n_phrases} phrases across {len(data['sections'])} sections, {n_grammar} grammar cards")

    if not write:
        return 0

    # Compose flat phrase index for client search
    phrase_index = []
    for sid, sec in data["sections"].items():
        for p in sec.get("phrases", []):
            phrase_index.append({
                "id": p["id"],
                "sectionId": sid,
                "sectionTitle": sec.get("title", sid),
                "sectionIcon": sec.get("icon", ""),
                "ja": p.get("ja", ""),
                "romaji": p.get("romaji", ""),
                "en": p.get("en", ""),
                "use": p.get("use", ""),
                "note": p.get("note", ""),
                "tags": p.get("tags", []),
                "placeholders": p.get("placeholders", []),
                "speak": p.get("speak") or p.get("romaji") or "",
                "polite": p.get("polite", True),
            })
    data["phraseIndex"] = phrase_index
    data["sectionOrder"] = SECTION_ORDER

    # Read templates
    tpl_path = TEMPLATES / "shell.html"
    css_path = TEMPLATES / "app.css"
    js_path = TEMPLATES / "app.js"
    if not (tpl_path.exists() and css_path.exists() and js_path.exists()):
        print(f"✗ Missing templates: {tpl_path.exists()=} {css_path.exists()=} {js_path.exists()=}")
        return 1

    shell = tpl_path.read_text(encoding="utf-8")
    css = css_path.read_text(encoding="utf-8")
    js = js_path.read_text(encoding="utf-8")

    rendered_css = render_inline_css(css, minify)
    rendered_js = render_inline_js(js, minify)
    data_json = json.dumps(data, ensure_ascii=False, separators=(",", ":") if minify else (",", ": "))

    build_hash = "v0.1.0"  # placeholder, real builds would hash inputs
    html_text = (
        shell
        .replace("{{APP_TITLE}}", html.escape(data["meta"].get("appTitle", "Nihongo Kit")))
        .replace("{{INLINE_CSS}}", rendered_css)
        .replace("{{INLINE_JS}}", rendered_js)
        .replace("{{APP_DATA_JSON}}", data_json)
        .replace("{{BUILD_HASH}}", build_hash)
        .replace("{{SHORT_TITLE}}", html.escape(data["meta"].get("shortTitle", "Nihongo Kit")))
    )

    DIST.mkdir(exist_ok=True)
    out = DIST / "index.html"
    out.write_text(html_text, encoding="utf-8")
    print(f"✓ Wrote {out}  ({len(html_text):,} bytes)")
    return 0


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--check", action="store_true", help="Validate content only; do not write.")
    ap.add_argument("--minify", action="store_true", help="Collapse whitespace in inlined CSS/JS.")
    args = ap.parse_args()
    sys.exit(build(minify=args.minify, write=not args.check))


if __name__ == "__main__":
    main()
