#!/usr/bin/env python3
"""Every path to Anthropic must be authenticated and metered.

WHY THIS EXISTS

/api/claude — the single proxy every AI feature in the app goes through — had
no authentication check, no quota check, and took `model` and `max_tokens`
straight from the request body. The middleware did not cover it either:
PROTECTED_PREFIXES lists page routes, not /api. So this worked, from anyone:

    curl -X POST https://www.aimarketinglab.co.uk/api/claude \
      -d '{"prompt":"...","model":"claude-opus-5","max_tokens":64000}'

And the thing that looked like the protection — `anthropic: { count: 50 }` in
DAILY_CAPS — was never consulted here. /api/geo was the only route that ever
called checkAndIncrement with that provider, so the cap covered one feature
and nothing else. A limit nobody reads is a comment.

WHAT IT CHECKS

1. Any route that calls api.anthropic.com must require a session
   (getCallerOrNull) and count against the quota (checkAndIncrement), OR be on
   the explicitly-reasoned exemption list below.

2. No route may pass a caller-supplied `model` through to Anthropic. Model
   choice belongs to lib/ai-tasks, not to the request body.

3. Client code may not post `model` or `max_tokens` to /api/claude — it sends
   a `task` and the server decides.
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
APP = ROOT / "app"
LIB = ROOT / "lib"

ANTHROPIC = re.compile(r"api\.anthropic\.com")
NEEDS_AUTH = re.compile(r"\bgetCallerOrNull\b")
NEEDS_QUOTA = re.compile(r"\bcheckAndIncrement\b")

# Reading `model` (or `max_tokens`) OUT OF THE REQUEST BODY. The forwarded
# variable itself is fine — /api/claude passes a `model` resolved from the
# task — so the check is on where the value came from, not on its name. An
# earlier version matched the bare `model,` shorthand and flagged the correct
# code, which is the kind of guard people learn to ignore.
BODY_MODEL = re.compile(
    r"const\s*\{[^}]*\bmodel\b[^}]*\}\s*=\s*(?:\(?\s*body|.*\brequest\.json)", re.S)
BODY_BUDGET = re.compile(
    r"const\s*\{[^}]*\bmax_tokens\b[^}]*\}\s*=\s*(?:\(?\s*body|.*\brequest\.json)", re.S)
# resolveTask clamps a requested budget to the task's ceiling, so reading
# max_tokens from the body is fine WHEN it goes through there. Reading `model`
# from the body is never fine — that is the exact shape of the original hole.
CLAMPED = re.compile(r"\bresolveTask\b")

# Callers of our own proxy must not choose the model or the budget.
CLIENT_OVERRIDE = re.compile(r"""JSON\.stringify\(\{[^}]*\b(?:model|max_tokens)\s*:""")

# Public by design, with the reason. Both are reader-facing on the blog and
# have no session to meter against; the control is that they cannot trigger an
# uncapped number of model calls.
EXEMPT = {
    "app/api/blog/summary/route.ts":
        "Public blog reader endpoint. Bounded instead: the summary is stored on "
        "the post row keyed by a hash of the article text, so a model call "
        "happens once per edit, not once per reader.",
}


def main() -> int:
    problems: list[str] = []

    for route in sorted((APP / "api").rglob("route.ts")):
        src = route.read_text(encoding="utf-8")
        rel = route.relative_to(ROOT).as_posix()
        if not ANTHROPIC.search(src):
            continue
        if rel in EXEMPT:
            continue
        if not NEEDS_AUTH.search(src):
            problems.append(f"{rel}: calls Anthropic without requiring a session")
        if not NEEDS_QUOTA.search(src):
            problems.append(f"{rel}: calls Anthropic without counting against the quota")
        if BODY_MODEL.search(src):
            problems.append(f"{rel}: takes `model` from the request body — model choice belongs to lib/ai-tasks")
        if BODY_BUDGET.search(src) and not CLAMPED.search(src):
            problems.append(f"{rel}: takes `max_tokens` from the request body without clamping it through resolveTask")

    for path in list(APP.rglob("*.tsx")) + list(LIB.glob("*.ts")):
        if ".next" in path.parts:
            continue
        src = path.read_text(encoding="utf-8")
        if "/api/claude" not in src:
            continue
        for i, line in enumerate(src.splitlines()):
            if "/api/claude" in line or "JSON.stringify" in line:
                if CLIENT_OVERRIDE.search(line):
                    problems.append(
                        f"{path.relative_to(ROOT).as_posix()}:{i + 1}: sends `model` or "
                        f"`max_tokens` to /api/claude — send a `task` instead"
                    )

    if problems:
        print("Unmetered or caller-controlled paths to Anthropic.\n")
        print("Every model call must belong to a signed-in user and count")
        print("against their daily allowance, and the model must be chosen by")
        print("lib/ai-tasks rather than by whoever sent the request.\n")
        for p in problems:
            print("  " + p)
        return 1

    print(f"check-ai-metered: OK — all Anthropic paths authenticated and metered "
          f"({len(EXEMPT)} documented exemption)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
