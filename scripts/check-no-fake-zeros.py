#!/usr/bin/env python3
"""Fail the build when a page renders an unknown value as a number.

WHY THIS EXISTS

The competitors page shipped showing every competitor as
"0 authority · 0 traffic/mo · 0 keywords · 0% overlap · LOW threat". The data
source behind those columns had been switched off, and each cell defaulted to
zero on the way to the screen.

A reader cannot tell a measured zero from a missing one. So the page was not
merely unhelpful, it was asserting things: that these competitors had no
traffic, no keywords and no overlap with the customer's business — and then
grading the threat as low on the strength of those assertions. Every one of
them was false.

WHAT IT CHECKS

Inside JSX *text* — the part a user reads — a numeric fallback (`?? 0`,
`|| 0`, `?? "0"`) is treated as an error. Unknowns must render as an em dash,
or the surrounding sentence must be rewritten so the number isn't needed:

    BAD   <span>{data.pages ?? 0} pages</span>
    GOOD  <span>{data.pages != null ? `${data.pages} pages` : "—"}</span>

Fallbacks in calculations, reducers, comparisons and props are NOT flagged.
`sum + (x ?? 0)` is arithmetic with a sensible identity, not a claim, and a
guard that shouted about those would be turned off within a week.

ESCAPE HATCH

If a zero really is the right thing to show — the value is guaranteed present,
or zero genuinely is the measured answer — put this on the line above:

    {/* measured-zero: <reason> */}

The reason is required. A silent suppression is how the next person learns the
rule doesn't matter.
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# JSX text positions only: an expression that sits between markup, i.e. after a
# '>' or the start of a line, and is followed by prose or a closing tag.
# Deliberately narrow — false positives here cost more than the misses.
RENDERED = re.compile(
    r"""
    (?:>|^\s{2,})            # after a closing bracket, or an indented JSX child
    [^<>{}]*                 # any literal text before the expression
    \{[^{}]*?                # an expression...
    (?:\?\?|\|\|)\s*         # ...containing a fallback...
    (?:0\b|["']0["'])        # ...to zero
    """,
    re.VERBOSE,
)

ALLOW = re.compile(r"measured-zero:\s*\S+")

# Arithmetic and control flow, where a zero identity is correct rather than a
# claim: reduce accumulators, comparisons, sums, array maths.
NOT_A_CLAIM = re.compile(
    r"(?:reduce\(|\.map\(|\.filter\(|=>\s|[+\-*/]\s*\(?[\w.?\[\]]+\s*(?:\?\?|\|\|)\s*0"
    r"|(?:\?\?|\|\|)\s*0\s*\)?\s*[<>+\-*/])"
)

TARGET_DIRS = ["app"]
SKIP_PARTS = {"node_modules", ".next", "scripts"}


def check(path: Path) -> list[str]:
    lines = path.read_text(encoding="utf-8").splitlines()
    problems = []
    for i, line in enumerate(lines):
        if not RENDERED.search(line):
            continue
        if NOT_A_CLAIM.search(line):
            continue
        # Exemption may sit on this line or the one above it.
        context = line + " " + (lines[i - 1] if i > 0 else "")
        if ALLOW.search(context):
            continue
        problems.append(f"{path.relative_to(ROOT)}:{i + 1}: {line.strip()}")
    return problems


def main() -> int:
    problems: list[str] = []
    for d in TARGET_DIRS:
        for path in (ROOT / d).rglob("*.tsx"):
            if SKIP_PARTS & set(path.parts):
                continue
            problems.extend(check(path))

    if problems:
        print("Unknown values are being rendered as 0.\n")
        print("A reader cannot tell a measured zero from a missing one, so this")
        print("states something about the customer's data that we did not measure.")
        print("Render an em dash, or rewrite the sentence so the number isn't needed.\n")
        for p in problems:
            print("  " + p)
        print(
            "\nIf a zero is genuinely correct here, put "
            "{/* measured-zero: <reason> */} on the line above."
        )
        return 1

    print("check-no-fake-zeros: OK — no unknowns rendered as numbers")
    return 0


if __name__ == "__main__":
    sys.exit(main())
