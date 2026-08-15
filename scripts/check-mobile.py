#!/usr/bin/env python3
"""Static mobile-layout audit.

The app styles inline, and inline styles cannot carry media queries. Anything
that must change by viewport has to opt into a class defined in globals.css —
which means a multi-column grid with no such class is, by construction, broken
on a phone. That is exactly how the settings rail, the feature rows and the
homepage stats strip all shipped squeezed into a 390px screen.

This finds them before a screenshot does.
"""
import pathlib, re, sys

CSS = pathlib.Path("app/globals.css").read_text()

# Classes globals.css actually gives a mobile behaviour to.
ESCAPES = set(re.findall(r'\.([\w-]+)\s*\{[^}]*grid-template-columns[^}]*!important', CSS))
ESCAPES |= {"aiml-data-scroll", "aiml-table-scroll", "aiml-settings-tabs",
            "grid-1-mobile", "grid-2-mobile", "grid-2-tablet"}

def collapses(cols: str) -> bool:
    c = cols.strip()
    return c in ("1fr", "100%") or "auto-fit" in c or "auto-fill" in c or "minmax(0, 1fr)" == c

problems = []
for p in sorted(pathlib.Path("app").rglob("*.tsx")):
    lines = p.read_text().split("\n")
    for i, ln in enumerate(lines):
        m = re.search(r'gridTemplateColumns:\s*"([^"]+)"', ln)
        if not m or collapses(m.group(1)):
            continue
        # Look back far enough to catch a className on the opening tag when
        # props are spread over several lines — a 5-line window reported the
        # alerts rule row as broken when its class sat 3 lines above.
        window = "\n".join(lines[max(0, i - 12): i + 2])
        if any(re.search(rf'\b{re.escape(c)}\b', window) for c in ESCAPES):
            continue
        problems.append((str(p), i + 1, m.group(1)))

print(f"Mobile escapes defined in globals.css: {len(ESCAPES)}")
print(f"Multi-column grids with no mobile behaviour: {len(problems)}\n")
for f, i, c in problems:
    print(f"  {f}:{i}  {c}")

# Rows of numbers are allowed to scroll rather than stack, so a small residue
# is expected. Fail only if it grows beyond what has been reviewed.
BASELINE = 4
if len(problems) > BASELINE:
    print(f"\nFAIL: {len(problems)} exceeds the reviewed baseline of {BASELINE}")
    sys.exit(1)
print(f"\nOK: at or below the reviewed baseline of {BASELINE}")
