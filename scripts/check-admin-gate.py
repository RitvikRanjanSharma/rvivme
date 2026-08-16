#!/usr/bin/env python3
"""
check-admin-gate.py — the admin panel cannot be reached or written without the
database check.

WHY A GUARD RATHER THAN A CODE REVIEW

The /admin panel can noindex the entire site, rewrite robots.txt and redirect
any URL. Its authorisation is three layers deep and only the deepest one
actually protects anything:

  NEXT_PUBLIC_ADMIN_EMAILS  decides who sees the link         (cosmetic)
  requireSiteAdmin()        decides who can open the page     (server)
  is_site_admin() + RLS     decides who can change data       (authoritative)

The failure that matters is silent: a new Server Action added later without
assertSiteAdmin() is a directly callable, unauthenticated write endpoint that
looks completely normal in review. Server Actions are reachable with a forged
request and do not inherit the page's authorisation, so "the layout already
checked" is not a defence.

Exit 0 = safe, 1 = something to fix.
"""
from __future__ import annotations
import re, sys
from pathlib import Path

ROOT    = Path(__file__).resolve().parent.parent
ACTIONS = ROOT / "app/admin/actions.ts"
LAYOUT  = ROOT / "app/admin/layout.tsx"

problems: list[str] = []

def read(p: Path) -> str:
    return p.read_text(encoding="utf-8") if p.exists() else ""

# ── 1. Every exported Server Action asserts admin ────────────────────────────
src = read(ACTIONS)
if not src:
    problems.append("app/admin/actions.ts is missing.")
else:
    if '"use server"' not in src.split("\n")[0] and "'use server'" not in src.split("\n")[0]:
        problems.append("actions.ts does not start with the \"use server\" directive.")

    chunks = re.split(r"(?=export async function )", src)
    actions = 0
    for chunk in chunks:
        m = re.match(r"export async function (\w+)", chunk)
        if not m:
            continue
        actions += 1
        if "assertSiteAdmin()" not in chunk:
            problems.append(
                f"Server Action {m.group(1)}() does not call assertSiteAdmin(). "
                f"It is a directly callable write endpoint."
            )
    if actions == 0:
        problems.append("No exported Server Actions found — has the file moved?")

# ── 2. The layout gate is server-side and asks the database ──────────────────
lay = read(LAYOUT)
if not lay:
    problems.append("app/admin/layout.tsx is missing — the panel has no page gate.")
else:
    if re.match(r'^\s*["\']use client["\']', lay):
        problems.append(
            "app/admin/layout.tsx is a Client Component. The gate would run in the "
            "browser, and the whole editor would be shipped to non-admins."
        )
    if "requireSiteAdmin" not in lay:
        problems.append("app/admin/layout.tsx does not call requireSiteAdmin().")
    if "isAdminEmail" in lay:
        problems.append(
            "app/admin/layout.tsx uses isAdminEmail (the NEXT_PUBLIC_ list). That is "
            "a cosmetic check and must not gate the page — use requireSiteAdmin()."
        )
    if "force-dynamic" not in lay:
        problems.append(
            "app/admin/layout.tsx is not force-dynamic. A cached admin gate can be "
            "served to the wrong person."
        )

# ── 3. No writes outside the gated action file ───────────────────────────────
for f in sorted((ROOT / "app/admin").rglob("*.tsx")):
    body = f.read_text(encoding="utf-8")
    for op in (".upsert(", ".insert(", ".delete("):
        if op in body:
            problems.append(
                f"{f.relative_to(ROOT)} performs {op.strip('(.')} directly. "
                f"All writes belong in actions.ts where the gate is enforced."
            )

# ── 4. The gate itself fails closed ──────────────────────────────────────────
gate = read(ROOT / "lib/site-admin.ts")
if gate:
    if "rpc(\"is_site_admin\")" not in gate and "rpc('is_site_admin')" not in gate:
        problems.append("lib/site-admin.ts does not call the is_site_admin() database function.")
    if "data !== true" not in gate:
        problems.append(
            "lib/site-admin.ts should require an explicit true from the database. "
            "Anything else — including an error or null — must be denial."
        )

# ── report ───────────────────────────────────────────────────────────────────
if problems:
    print(f"{len(problems)} problem(s):\n")
    for p in problems:
        print(f"  ✗ {p}")
    sys.exit(1)

print("admin gate intact: all actions assert, layout is server-side and dynamic, no stray writes")
sys.exit(0)
