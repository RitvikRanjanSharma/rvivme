"""Every app-page <h1> must resolve to a declared weight, not the UA default."""
import pathlib, re, sys
CSS = pathlib.Path("app/globals.css").read_text()
has_class = bool(re.search(r'\.aiml-page-title\s*\{[^}]*font-weight', CSS))

# Public marketing surfaces style their headings deliberately; app pages must not.
# The homepage lives in home-view.tsx, not page.tsx: page.tsx is now a server
# shell that exists only to export metadata, and holds no markup.
EXEMPT = {"app/home-view.tsx", "app/blog/page.tsx", "app/blog/[slug]/post-view.tsx",
          "app/ui/legal-shell.tsx", "app/not-found.tsx", "app/portfolio/page.tsx",
          "app/onboarding/page.tsx", "app/dashboard/blog/page.tsx"}
EXEMPT |= {p for p in map(str, pathlib.Path("app/auth").rglob("*.tsx"))}

bad = []
for p in sorted(pathlib.Path("app").rglob("*.tsx")):
    if str(p) in EXEMPT: continue
    lines = p.read_text().split("\n")
    for i, ln in enumerate(lines):
        if "<h1" not in ln: continue
        blk = "\n".join(lines[i:i + 8])
        if "aiml-page-title" in blk and has_class: continue
        if re.search(r'fontWeight:\s*\d+', blk): continue
        bad.append(f"{p}:{i+1}")

print(f".aiml-page-title declares a weight: {has_class}")
print(f"app-page <h1> falling back to the browser default: {len(bad)}")
for b in bad: print("  " + b)
sys.exit(1 if bad else 0)
