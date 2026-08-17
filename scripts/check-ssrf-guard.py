#!/usr/bin/env python3
"""Every endpoint that fetches a caller-supplied URL must check the hostname.

An API route that takes a URL from the request and fetches it is a server-side
request forgery hole unless the target is checked. Left open, any account
holder can use our servers to reach cloud metadata endpoints (169.254.169.254),
services on localhost, and anything else inside our network boundary — from
outside it.

The control is hostIsPublic() in lib/site-fetch.ts. It used to be defined
inline in one route and copied into the next one that needed it, which is how
a security control quietly stops being one control: the copy that gets a fix
and the copy that doesn't look identical at a glance.

THIS CHECK

For each app/api/**/route.ts:
  - does it read a URL or domain out of the request?   (searchParams / body)
  - does it make an outbound fetch, directly or via one of our fetch helpers?
If both, it must reference hostIsPublic. No exemptions — if a route genuinely
doesn't need the check, it doesn't match both halves in the first place.
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
API = ROOT / "app" / "api"

# Reading a caller-controlled target out of the request.
READS_TARGET = re.compile(
    r"""(?:
        searchParams\.get\(\s*["'](?:url|domain|site|target|href)["']
      | body\??\.\s*(?:url|domain|site|target)\b
      | body\s*\)?\s*\?\.\s*(?:url|domain|site|target)\b
      | \bbody\??\.\[?["'](?:url|domain|site|target)["']
    )""",
    re.VERBOSE,
)

# Making the outbound request, directly or through one of our helpers. Helpers
# count because delegating the fetch does not delegate the responsibility.
MAKES_REQUEST = re.compile(
    r"\b(?:fetch\(|fetchText\(|fetchAcrossOrigins\(|measureSite\(|inspectAsCrawler\(|runAudit\()"
)

# The three exported forms of the one control in lib/site-fetch.ts. A route
# that defines its own equivalent does NOT satisfy this — that is the situation
# the check exists to end.
HAS_GUARD = re.compile(r"\bhostIsPublic\b|\burlIsPublic\b|\bssrfReason\b")


def main() -> int:
    missing = []
    checked = 0

    for path in sorted(API.rglob("route.ts")):
        src = path.read_text(encoding="utf-8")
        if not (READS_TARGET.search(src) and MAKES_REQUEST.search(src)):
            continue
        checked += 1
        if not HAS_GUARD.search(src):
            missing.append(str(path.relative_to(ROOT)))

    if missing:
        print("Endpoints fetch a caller-supplied URL without checking the hostname.\n")
        print("This lets an account holder point our servers at internal hosts and")
        print("cloud metadata endpoints. Import hostIsPublic from lib/site-fetch and")
        print("refuse anything it rejects, before any outbound request.\n")
        for m in missing:
            print("  " + m)
        return 1

    print(f"check-ssrf-guard: OK — {checked} URL-fetching endpoint(s), all guarded")
    return 0


if __name__ == "__main__":
    sys.exit(main())
