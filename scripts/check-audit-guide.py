#!/usr/bin/env python3
"""Every audit rule must explain itself.

Site audit was the only analysis surface in this product that stated facts
without saying why they mattered — the one a customer would call "the audit".
This fails the build if a new rule ships without reasoning, so the gap can't
quietly reopen.
"""
import pathlib, re, sys

audit = pathlib.Path("lib/site-audit.ts").read_text()
guide = pathlib.Path("lib/audit-guide.ts").read_text()

rules = set(re.findall(r'of\("([a-z_]+)"', audit)) | set(re.findall(r'rule:\s*"([a-z_]+)"', audit))
# aeo_* findings carry reasoning from the readiness checks themselves.
rules = {r for r in rules if not r.startswith("aeo_")}
covered = set(re.findall(r'^  ([a-z_]+):\s*\{', guide, re.M))

missing = sorted(rules - covered)
unused  = sorted(covered - rules)

print(f"rules the crawler can emit : {len(rules)}")
print(f"rules with why + fix       : {len(rules & covered)}")
if unused:
    print(f"guide entries for rules not emitted (harmless): {unused}")
if missing:
    print(f"\nFAIL — no reasoning for: {missing}")
    sys.exit(1)
print("\nOK: every rule explains itself")
