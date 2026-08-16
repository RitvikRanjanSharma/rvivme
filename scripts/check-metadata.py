#!/usr/bin/env python3
"""
check-metadata.py — every route resolves to exactly one title, from one source.

WHY THIS EXISTS
---------------
`next build` cannot run in every environment this repo is worked on from (the
SWC binaries are platform-specific and are frequently the wrong platform), so
the usual safety net — build it and look at the HTML — is not always available.
This script is the substitute: it reads the route tree statically and asserts
the invariants that the head tags depend on.

The bug it is guarding against actually happened. The root layout was a client
component with a hand-written <head>, which meant:

  * it could not export `metadata`, so every client-rendered page shared one
    hardcoded <title> and meta description, and had no og:title at all; and
  * on the pages that DID export metadata, the hand-written tag did not get
    replaced — it coexisted, so those pages emitted two <title> elements and,
    on blog posts, two canonicals.

Both failure modes are invisible in the running app and invisible in a diff.
They only show up in the served HTML, which is exactly what cannot be checked
here. Hence static checks.

CHECKS
------
1. The root layout is a Server Component and exports `metadata`.
   (If it is "use client" again, the whole scheme silently collapses back to
   one shared title.)
2. The root layout does not hand-write <title> or <meta name="description">.
   Either would reintroduce the duplicate-tag bug.
3. Every route (every page.tsx) resolves a title — from itself or from an
   ancestor layout.
4. No route hardcodes the brand suffix in a plain-string title, which the root
   layout's "%s — AI Marketing Lab" template would render twice.
5. Canonicals: any route declaring `alternates.canonical` is a route that
   robots.ts actually allows. A canonical on a disallowed route is noise.

Exit code 0 = all good, 1 = something to fix.
"""

from __future__ import annotations
import re
import sys
from pathlib import Path

APP   = Path(__file__).resolve().parent.parent / "app"
ROOT  = Path(__file__).resolve().parent.parent
BRAND = "AI Marketing Lab"

problems: list[str] = []
notes:    list[str] = []


def read(p: Path) -> str:
    try:
        return p.read_text(encoding="utf-8")
    except Exception:
        return ""


def strip_comments(src: str) -> str:
    """Remove // and /* */ comments so prose about a bug isn't read as the bug."""
    src = re.sub(r"/\*.*?\*/", "", src, flags=re.S)
    src = re.sub(r"^\s*//.*$", "", src, flags=re.M)
    return src


def strip_nested_block(src: str, key: str) -> str:
    """
    Remove `key: { ... }` including nested braces.

    Needed because openGraph and twitter each carry their own `title:`, and
    those are NOT subject to the root layout's title template — og:title is
    rendered standalone in a link preview, so it is correct for it to spell
    out the brand. Scanning the whole object for `title:` flags those as
    duplicates when they are nothing of the sort.
    """
    out, i = [], 0
    pattern = re.compile(rf"\b{re.escape(key)}\s*:\s*\{{")
    while True:
        m = pattern.search(src, i)
        if not m:
            out.append(src[i:])
            return "".join(out)
        out.append(src[i:m.start()])
        depth, j = 1, m.end()
        while j < len(src) and depth:
            if src[j] == "{":
                depth += 1
            elif src[j] == "}":
                depth -= 1
            j += 1
        i = j


def document_title_scope(src: str) -> str:
    """The metadata object with the social-card sub-objects removed."""
    s = strip_comments(src)
    for key in ("openGraph", "twitter"):
        s = strip_nested_block(s, key)
    return s


def declares_metadata(src: str) -> bool:
    s = strip_comments(src)
    return bool(
        re.search(r"export\s+(const|async\s+function|function)\s+metadata\b", s)
        or re.search(r"export\s+const\s+metadata\s*[:=]", s)
        or re.search(r"export\s+async\s+function\s+generateMetadata\b", s)
        or re.search(r"export\s+function\s+generateMetadata\b", s)
    )


def declares_title(src: str) -> bool:
    s = strip_comments(src)
    if not declares_metadata(s):
        return False
    # generateMetadata builds its title dynamically; trust it if present.
    if re.search(r"generateMetadata", s):
        return True
    return bool(re.search(r"\btitle\s*:", s))


def route_of(p: Path) -> str:
    """Filesystem path -> URL path, ignoring route groups."""
    rel = p.parent.relative_to(APP)
    parts = [seg for seg in rel.parts if not (seg.startswith("(") and seg.endswith(")"))]
    return "/" + "/".join(parts) if parts else "/"


# ── 1 & 2: the root layout ────────────────────────────────────────────────────
root_layout = APP / "layout.tsx"
rl = read(root_layout)

if not rl:
    problems.append("app/layout.tsx not found — cannot verify anything else.")
else:
    body = strip_comments(rl)

    if re.match(r'^\s*["\']use client["\']', body):
        problems.append(
            "app/layout.tsx is a Client Component. It cannot export `metadata`, "
            "so every client-rendered route falls back to one shared title."
        )

    if not declares_metadata(rl):
        problems.append("app/layout.tsx does not export `metadata` — there is no site-wide default, so 404s have no title.")

    if "<title" in body:
        problems.append(
            "app/layout.tsx hand-writes <title>. Next does not replace this with the "
            "metadata title, it renders both — duplicate <title> tags."
        )

    if re.search(r'<meta\s+name=["\']description["\']', body):
        problems.append(
            "app/layout.tsx hand-writes <meta name=\"description\">. Same duplication "
            "problem as <title>."
        )

    if re.search(r'<link\s+rel=["\']canonical["\']', body):
        problems.append(
            "app/layout.tsx hand-writes <link rel=\"canonical\">. Pages that set "
            "alternates.canonical will then emit two."
        )

    if "template:" not in body:
        notes.append("app/layout.tsx has no title template — each route must spell out the brand itself.")


# ── 3 & 4: every route resolves a title ───────────────────────────────────────
pages = sorted(APP.rglob("page.tsx"))
if not pages:
    problems.append("No page.tsx files found under app/ — is the path right?")

for page in pages:
    route = route_of(page)
    src   = read(page)

    # Walk from the page's own directory up to app/, looking for a title.
    #
    # Reaching the ROOT layout does not count as resolved. The root only
    # supplies the generic site-wide default, which exists for 404s — a real
    # route landing on it means its browser tab reads "AI Marketing Lab — SEO
    # & GEO Intelligence Platform" instead of naming the page, which is the
    # exact symptom this whole change set set out to remove.
    source = None
    if declares_title(src):
        source = str(page.relative_to(ROOT))
    else:
        d = page.parent
        while True:
            lay = d / "layout.tsx"
            if lay != root_layout and lay.exists() and declares_title(read(lay)):
                source = str(lay.relative_to(ROOT))
                break
            if d == APP:
                break
            d = d.parent

    if source is None:
        problems.append(
            f"{route} — no title of its own; falls back to the root layout's "
            f"generic default. Add `export const metadata = {{ title: \"…\" }}` "
            f"to its page.tsx, or a layout.tsx beside it."
        )

    # Brand appearing in a plain-string title, on top of the root template.
    for f in [page] + [p for p in [page.parent / "layout.tsx"] if p.exists()]:
        raw = read(f)
        if not declares_metadata(raw):
            continue
        # Only the document title is subject to the root template; og:title and
        # twitter:title are standalone and may legitimately carry the brand.
        s = document_title_scope(raw)
        for m in re.finditer(r'\btitle\s*:\s*["\']([^"\']+)["\']', s):
            if BRAND in m.group(1):
                problems.append(
                    f"{f.relative_to(ROOT)} — title \"{m.group(1)}\" already contains "
                    f"\"{BRAND}\"; the root template appends it again. Use the bare "
                    f"page name, or title: {{ absolute: ... }}."
                )


# ── 5: canonicals only on crawlable routes ────────────────────────────────────
robots_src = strip_comments(read(APP / "robots.ts"))
disallowed = re.findall(r'["\'](/[a-z0-9\-/]*)["\']', robots_src.split("disallow")[1]) if "disallow" in robots_src else []
disallowed = [d for d in disallowed if d != "/"]

for f in sorted(list(APP.rglob("page.tsx")) + list(APP.rglob("layout.tsx"))):
    s = strip_comments(read(f))
    if "canonical" not in s:
        continue
    route = route_of(f)
    hit = next((d for d in disallowed if route == d or route.startswith(d + "/")), None)
    if hit:
        problems.append(
            f"{f.relative_to(ROOT)} — declares a canonical, but robots.ts disallows "
            f"{hit}. A canonical on an uncrawlable route does nothing."
        )


# ── report ────────────────────────────────────────────────────────────────────
print(f"routes checked: {len(pages)}")
for n in notes:
    print(f"  note: {n}")

if problems:
    print(f"\n{len(problems)} problem(s):\n")
    for p in problems:
        print(f"  ✗ {p}")
    sys.exit(1)

print("all routes resolve exactly one title; no duplicate head sources.")
sys.exit(0)
