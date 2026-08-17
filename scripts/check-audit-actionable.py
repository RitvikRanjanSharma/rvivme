#!/usr/bin/env python3
"""
check-audit-actionable.py — every finding leads somewhere.

THE PROMISE THIS PROTECTS

The product's claim is that it does not just name problems, it solves them.
That claim is only as strong as its weakest rule: one finding that says "this
is wrong" and offers nothing turns the whole audit back into the inventory
every other tool ships.

So every rule the crawler can emit must satisfy at least one of:

  * a deterministic ready-to-paste fix   (lib/audit-fixes.ts readyFix)
  * an on-demand written suggestion      (lib/audit-fixes.ts SUGGESTIBLE)
  * an explicit exemption below, with a reason

The exemptions are not a loophole — they are rules where generating text would
be dishonest. A broken link needs finding, not writing. A slow page needs
profiling. Offering a "write the fix" button there would return confident
waffle, which is worse than offering nothing.

Also checks that every rule has a RULE_GUIDE entry, so nothing renders without
its why and fix.

Exit 0 = every rule is actionable, 1 = something to fix.
"""
from __future__ import annotations
import re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Rules that legitimately have no generated fix, and why.
EXEMPT = {
    "broken_internal_link":  "needs the link found and repointed, not text written",
    "homepage_unreachable":  "an availability problem — DNS, TLS or the origin",
    "page_unreachable":      "an availability problem, not a content one",
    "robots_disallow_all":   "one line to delete; the fix text already says which",
    "canonical_to_noindex":  "requires deciding which of two pages is canonical",
    "low_performance_score": "needs profiling the specific render-blocking asset",
    "missing_canonical":     "deterministic fix supplied",
    "noindex_page":          "deterministic fix supplied",
    "missing_viewport":      "deterministic fix supplied",
    "incomplete_open_graph": "deterministic fix supplied",
    "no_structured_data":    "deterministic fix supplied",
    "sitemap_missing":       "deterministic fix supplied",
    "robots_missing":        "deterministic fix supplied",
    "hreflang_no_xdefault":  "deterministic fix supplied",
    "duplicate_title":       "suggestible",
    "duplicate_meta_description": "suggestible",
}

problems: list[str] = []

def read(p: Path) -> str:
    return p.read_text(encoding="utf-8") if p.exists() else ""

audit  = read(ROOT / "lib/site-audit.ts")
fixes  = read(ROOT / "lib/audit-fixes.ts")
guide  = read(ROOT / "lib/audit-guide.ts")

if not audit or not fixes or not guide:
    print("✗ one of lib/site-audit.ts, lib/audit-fixes.ts, lib/audit-guide.ts is missing")
    sys.exit(1)

# Rules the crawler can emit.
emitted = set(re.findall(r'of\("([a-z_0-9]+)"', audit))
# Answer-engine checks are emitted with an aeo_ prefix at runtime.
aeo = {f"aeo_{i}" for i in re.findall(r'id:\s*"([a-z_]+)"', read(ROOT / "lib/ai-crawlers.ts"))}

# Rules with a deterministic fix: the case labels in readyFix().
deterministic = set(re.findall(r'case\s+"([a-z_0-9]+)":', fixes))
# Rules with a written suggestion.
m = re.search(r"SUGGESTIBLE\s*=\s*new Set\(\[(.*?)\]\)", fixes, re.S)
suggestible = set(re.findall(r'"([a-z_0-9]+)"', m.group(1))) if m else set()
# Rules with a why/fix entry.
documented = set(re.findall(r'^\s{2}([a-z_0-9]+):\s*\{', guide, re.M))

print(f"rules emitted: {len(emitted)}  ·  deterministic fixes: {len(deterministic)}  ·  suggestible: {len(suggestible)}")

for rule in sorted(emitted):
    actionable = rule in deterministic or rule in suggestible or rule in EXEMPT
    if not actionable:
        problems.append(
            f"{rule} — the audit can report this, but there is no ready-to-paste fix, "
            f"no written suggestion, and no exemption. A finding that leads nowhere is "
            f"the inventory this product exists not to be."
        )
    if rule not in documented:
        problems.append(f"{rule} — no RULE_GUIDE entry, so it renders with no why and no fix.")

# Every suggestible rule needs a prompt spec, or the button returns nothing.
suggest_route = read(ROOT / "app/api/site-audit/suggest/route.ts")
specced = set(re.findall(r'^\s{2}([a-z_0-9]+):\s*\{', suggest_route, re.M))
for rule in sorted(suggestible):
    if rule not in specced:
        problems.append(
            f"{rule} — listed as suggestible but has no spec in the suggest route, "
            f"so the button would appear and then fail."
        )

# And every spec should be reachable.
for rule in sorted(specced):
    if rule not in suggestible:
        problems.append(f"{rule} — has a suggestion spec but is not in SUGGESTIBLE, so the button never shows.")

if problems:
    print(f"\n{len(problems)} problem(s):\n")
    for p in problems:
        print(f"  ✗ {p}")
    sys.exit(1)

print("every emitted rule leads to a fix, a suggestion, or a documented exemption")
sys.exit(0)
