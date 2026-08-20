#!/usr/bin/env python3
"""Every API route that calls the outside world must time-box it and declare a budget.

WHY THIS EXISTS

Node's fetch has no default timeout. If a remote server accepts the connection
and then goes quiet, the promise never settles: the route sits there until the
hosting platform kills the function. A killed function returns nothing at all,
so what the user sees is a spinner that runs for the full request budget and
then an empty panel — which is indistinguishable from "you have no data".

That failure has already been fixed twice in this codebase, once in the site
audit and once across eight Google API routes, each time after it had shipped.
This is the check that stops it arriving a third time.

TWO REQUIREMENTS

  1. A timeout on the request itself — an AbortController, or one of our
     wrappers that supplies one (googleFetch, fetchText, fetchAcrossOrigins,
     get() helpers that already carry a signal).

  2. `export const maxDuration` — so the platform's own limit is deliberate
     rather than whatever the default happens to be. Without it, a slow origin
     dies at an arbitrary boundary and the failure looks like nothing happened.

Routes that only talk to Supabase are not checked: the client has its own
timeout handling and does not accept a signal from us.
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
API = ROOT / "app" / "api"

# A call to somewhere that isn't us. Relative paths ("/api/...") are internal.
#
# Matches the wrappers too (outboundFetch, googleFetch). An earlier version of
# this pattern only matched a lowercase `fetch(`, so the moment the call sites
# were wrapped the guard stopped seeing them and cheerfully reported one route
# where there were twelve. A guard that silently stops checking is worse than
# no guard, because the green tick is now evidence of nothing.
EXTERNAL = re.compile(
    r"""(?:[a-zA-Z]*[Ff]etch)\(\s*[`"']https?://"""
    r"""|(?:[a-zA-Z]*[Ff]etch)\(\s*`\$\{[A-Z_]+(?:API_)?BASE""",
)

# Either an explicit controller, or one of the wrappers that supplies one.
TIMEBOXED = re.compile(
    r"\bAbortController\b|\boutboundFetch\b|\bgoogleFetch\b|\bfetchText\b"
    r"|\bfetchAcrossOrigins\b|\bmeasureSite\b|\binspectAsCrawler\b|\bsignal:\s*"
)

HAS_BUDGET = re.compile(r"^export const maxDuration\s*=", re.M)


def main() -> int:
    no_timeout: list[str] = []
    no_budget: list[str] = []

    for route in sorted(API.rglob("route.ts")):
        src = route.read_text(encoding="utf-8")
        if not EXTERNAL.search(src):
            continue
        rel = route.relative_to(ROOT).as_posix()
        if not TIMEBOXED.search(src):
            no_timeout.append(rel)
        if not HAS_BUDGET.search(src):
            no_budget.append(rel)

    if no_timeout or no_budget:
        print("Routes call the outside world without a safety net.\n")
        if no_timeout:
            print("No timeout — these can hang until the platform kills them,")
            print("which the UI cannot tell apart from an empty result:\n")
            for r in no_timeout:
                print("  " + r)
            print()
        if no_budget:
            print("No `export const maxDuration` — the limit is whatever the")
            print("platform defaults to, so a slow origin fails at an arbitrary")
            print("boundary rather than as a timeout we chose:\n")
            for r in no_budget:
                print("  " + r)
            print()
        return 1

    checked = sum(
        1 for r in API.rglob("route.ts")
        if EXTERNAL.search(r.read_text(encoding="utf-8"))
    )
    print(f"check-outbound-safety: OK — {checked} outbound route(s), all time-boxed with a declared budget")
    return 0


if __name__ == "__main__":
    sys.exit(main())
