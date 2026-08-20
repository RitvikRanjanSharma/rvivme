#!/usr/bin/env python3
"""Fail the build when a page calls an API route that has been switched off.

WHY THIS EXISTS

Twice now the same failure has shipped. A data provider was disabled, its route
files were rewritten to return {success:false, reason:"unavailable"}, and the
pages calling them were never updated. The pages carried on fetching dead
endpoints and rendering the empty result as though it were an answer:

  /competitors  showed every rival as 0 authority, 0 traffic, 0 keywords
  /keywords     called three retired DataForSEO routes while the free
                replacements it was supposed to use sat unused next to them,
                with the file's own comments claiming it already used them

Neither failed loudly. Both looked like a product with no data rather than a
product with a broken wire, which is why they survived so long.

WHAT IT CHECKS

Every fetch("/api/...") in app/ is resolved to the route file that would serve
it. If that route is marked DISABLED, the CALLING FILE must visibly handle the
not-available reason it returns — `reason === "unavailable"` or
`reason === "plan_access"`. Calls to routes that do not exist at all are always
an error.

Calling a disabled route is not itself the bug. The dashboard's backlink panel
calls one deliberately and renders a calm "not on your plan" card, which is
correct behaviour for a feature waiting on a subscription. The bug is calling
one and treating the empty response as data, which is what /competitors and
/keywords did. So the rule is about handling, not about calling.

MARKING A ROUTE DISABLED

Put the word DISABLED in the file's top comment block. That is already the
convention in app/api/dataforseo/*.

UNREFERENCED ROUTES

Reported as a warning, not a failure. Cron endpoints, webhooks and OAuth
callbacks are legitimately called from outside the app.
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
APP  = ROOT / "app"
API  = APP / "api"

# fetch("/api/x/y"), fetch(`/api/x/y?z=1`), fetch('/api/x' + v)
CALL = re.compile(r"""fetch\(\s*[`"'](/api/[a-zA-Z0-9/_\-\[\]${}.]*)""")

SKIP_PARTS = {"node_modules", ".next"}

# The caller acknowledging that the route may have nothing to give.
HANDLES_UNAVAILABLE = re.compile(r"""["']unavailable["']|["']plan_access["']""")


def route_file_for(path: str) -> Path | None:
    """Map a URL path to the route.ts that would serve it, honouring [dynamic]."""
    parts = [p for p in path.strip("/").split("/") if p]
    if not parts or parts[0] != "api":
        return None
    current = APP
    for part in parts:
        # Template holes (${domain}) match any dynamic segment.
        if "$" in part or "{" in part:
            dyn = [d for d in current.iterdir() if d.is_dir() and d.name.startswith("[")]
            if not dyn:
                return None
            current = dyn[0]
            continue
        nxt = current / part
        if nxt.is_dir():
            current = nxt
            continue
        dyn = [d for d in current.iterdir() if d.is_dir() and d.name.startswith("[")] if current.is_dir() else []
        if dyn:
            current = dyn[0]
            continue
        return None
    rf = current / "route.ts"
    return rf if rf.exists() else None


def is_disabled(route: Path) -> bool:
    # Only the header comment counts. A route that merely mentions the word in
    # prose lower down is not itself disabled.
    head = route.read_text(encoding="utf-8")[:1500]
    return "DISABLED" in head


def main() -> int:
    dead: list[str] = []
    missing: list[str] = []
    called: set[Path] = set()

    for path in APP.rglob("*.tsx"):
        if SKIP_PARTS & set(path.parts):
            continue
        text = path.read_text(encoding="utf-8")
        for i, line in enumerate(text.splitlines()):
            for m in CALL.finditer(line):
                url   = m.group(1).split("?")[0]
                route = route_file_for(url)
                where = f"{path.relative_to(ROOT)}:{i + 1}"
                if route is None:
                    missing.append(f"{where}  ->  {url}  (no route file)")
                    continue
                called.add(route)
                if is_disabled(route) and not HANDLES_UNAVAILABLE.search(text):
                    dead.append(
                        f"{where}  ->  {url}  ({route.relative_to(ROOT)} is DISABLED "
                        f"and this file never checks for it)"
                    )

    problems = dead + missing
    if problems:
        print("Pages are calling API routes that cannot answer them.\n")
        print("A disabled route returns an empty success-shaped response. Unless")
        print("the caller checks for it, that renders as a product with no data")
        print("rather than a broken wire — which is how the competitors page came")
        print("to show every rival as 0 traffic and 0 keywords.\n")
        print("Either point the caller at a route that works, or branch on")
        print('reason === "unavailable" and render an honest not-available state.\n')
        for p in problems:
            print("  " + p)
        return 1

    # Warning only. Cron, webhooks and OAuth callbacks have callers we can't see.
    unreferenced = sorted(
        r.relative_to(ROOT).as_posix()
        for r in API.rglob("route.ts")
        if r not in called and not is_disabled(r)
    )
    print(f"check-live-endpoints: OK — {len(called)} referenced route(s), none disabled")
    if unreferenced:
        print(f"  note: {len(unreferenced)} route(s) with no in-app caller "
              f"(expected for cron, webhooks, OAuth callbacks)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
