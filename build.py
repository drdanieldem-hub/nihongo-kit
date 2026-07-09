#!/usr/bin/env python3
"""build.py — single-file project: just copies index.html into dist/.

The full HTML (data, styles, JS) lives inline at the repo root. The Pages
workflow runs this so the artifact lands at dist/index.html, which is what
gh-pages-style `actions/upload-pages-artifact@v3` expects.
"""
from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "index.html"
DIST = ROOT / "dist" / "index.html"


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--check", action="store_true",
                    help="Validate the source HTML (exists + non-empty).")
    ap.add_argument("--minify", action="store_true",
                    help="No-op for the single-file project (kept for API compat).")
    args = ap.parse_args()

    if not SRC.exists() or SRC.stat().st_size == 0:
        print(f"✗ Missing or empty: {SRC}", file=sys.stderr)
        return 1

    if args.check:
        print(f"✓ {SRC} ok ({SRC.stat().st_size:,} bytes)")
        return 0

    DIST.parent.mkdir(exist_ok=True)
    shutil.copyfile(SRC, DIST)
    print(f"✓ Copied {SRC} -> {DIST}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
