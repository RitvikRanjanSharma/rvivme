#!/usr/bin/env python3
"""
check-writes-verified.py — a save that changes nothing must not report success.

THE BUG THIS EXISTS FOR

PostgREST does not treat "UPDATE matched zero rows" as an error. It returns
success, having written nothing. So this:

    const { error } = await supabase.from("users").update({...}).eq("id", id);
    if (error) { showError(); return; }
    showSaved();

shows a green tick and persists absolutely nothing whenever the row is
missing or hidden by RLS. It is worse than a plain failure, because it
actively tells the user the opposite of what happened — and it is invisible
in review, since the error handling looks completely correct.

It shipped in Settings, on both the profile and the analytics panels, and the
symptom was a user reporting "the tool isn't saving my GA4 and GSC data" with
no error anywhere to explain it.

THE RULE

Every .update() and .upsert() in a user-facing page must chain .select(), so
the caller can check whether a row actually came back. Server routes are
exempt: they return structured reasons to a caller that can interpret them,
rather than rendering a tick.

Exit 0 = every write is verifiable, 1 = one can lie.
"""
from __future__ import annotations
import re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
problems: list[str] = []
checked = 0

# Statement = from the .update(/.upsert( call up to the terminating semicolon.
CALL = re.compile(r"\.(update|upsert)\s*\(")

for path in sorted((ROOT / "app").rglob("*.tsx")):
    src = path.read_text(encoding="utf-8")
    rel = path.relative_to(ROOT)

    for m in CALL.finditer(src):
        # Walk to the end of the statement, tracking depth so a nested
        # semicolon inside the payload object doesn't end it early.
        i, depth = m.end(), 1
        while i < len(src) and depth:
            if src[i] in "([{":
                depth += 1
            elif src[i] in ")]}":
                depth -= 1
            i += 1
        tail = src[i:i + 200].split(";")[0]
        stmt = src[m.start():i] + tail
        checked += 1

        if ".select(" not in stmt:
            line = src[:m.start()].count("\n") + 1
            problems.append(
                f"{rel}:{line} — .{m.group(1)}() without .select(). PostgREST reports "
                f"success when zero rows match, so this can show a save confirmation "
                f"having written nothing. Chain .select() and check the returned rows."
            )

print(f"client-side writes checked: {checked}")

if problems:
    print(f"\n{len(problems)} problem(s):\n")
    for p in problems:
        print(f"  ✗ {p}")
    sys.exit(1)

print("every client-side write returns its rows, so a silent no-op cannot pass as success")
sys.exit(0)
