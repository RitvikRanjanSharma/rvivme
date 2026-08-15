"""Design-token checks against globals.css.

Two things, both learned from real bugs:

  1. Contrast — every text token against its own background.
  2. Parity   — a token defined for one theme must exist for the other.

Parity exists because the fonts, radii and motion tokens once lived inside the
same block as the dark palette. Splitting that block so light could be the
default carried all seventeen of them into .dark, and light mode silently fell
back to the browser default serif with no radii at all. Nothing errored; it
just looked wrong on every page. Structural tokens now live on a shared :root,
and this asserts the two palettes stay symmetrical."""
import re, sys

css = open("app/globals.css").read()

def block(sel):
    m = re.search(re.escape(sel) + r'\s*\{(.*?)\n\}', css, re.S)
    return dict(re.findall(r'--([\w-]+):\s*([^;]+);', m.group(1))) if m else {}

light = block(":root, .light")
dark  = block(".dark")

def rgb(v):
    v=v.strip()
    if v.startswith("#"):
        h=v.lstrip('#'); return [int(h[i:i+2],16) for i in (0,2,4)], 1.0
    m=re.match(r'rgba?\(([^)]+)\)', v)
    parts=[p.strip() for p in m.group(1).split(',')]
    a=float(parts[3]) if len(parts)>3 else 1.0
    return [int(float(p)) for p in parts[:3]], a

def lum(c):
    f=lambda x: (x/255)/12.92 if (x/255)<=0.03928 else (((x/255)+0.055)/1.055)**2.4
    return 0.2126*f(c[0])+0.7152*f(c[1])+0.0722*f(c[2])

def over(fg_v, bg_v):
    fg,a = rgb(fg_v); bg,_ = rgb(bg_v)
    return [round(fg[i]*a + bg[i]*(1-a)) for i in range(3)]

def ratio(fg_v,bg_v):
    c=over(fg_v,bg_v); b,_=rgb(bg_v)
    l1,l2=sorted([lum(c),lum(b)],reverse=True)
    return (l1+0.05)/(l2+0.05)

TOKENS = [("text-primary",4.5),("text-secondary",4.5),("text-reading",4.5),
          ("text-tertiary",3.0),("signal-green",3.0),("signal-amber",3.0),
          ("signal-red",3.0),("brand",3.0)]

fails=[]
for name,theme in (("LIGHT (Pale Linen)",light),("DARK (Midnight Teal)",dark)):
    print(f"\n{name}  bg={theme['bg']}")
    for tok,need in TOKENS:
        if tok not in theme: continue
        r=ratio(theme[tok], theme['bg'])
        ok = r>=need
        if not ok: fails.append(f"{name} {tok} {r:.2f} < {need}")
        print(f"  {'PASS' if ok else 'FAIL'} {r:6.2f} (needs {need})  --{tok}: {theme[tok].strip()}")
    # button contrast
    r = ratio("#ffffff", theme['brand-strong'])
    ok = r >= (4.5 if name.startswith("LIGHT") else 3.0)
    if not ok: fails.append(f"{name} white-on-brand-strong {r:.2f}")
    print(f"  {'PASS' if ok else 'FAIL'} {r:6.2f}          white text on --brand-strong")

# ── Parity ───────────────────────────────────────────────────────────────────
shared = block(":root")
d_only = sorted(k for k in dark  if k not in light and k not in shared)
l_only = sorted(k for k in light if k not in dark  and k not in shared)

print("\nTOKEN PARITY")
print(f"  shared :root defines {len(shared)} theme-independent tokens")
if d_only: fails.append(f"defined only in dark: {d_only}")
if l_only: fails.append(f"defined only in light: {l_only}")
print(f"  dark-only:  {d_only or 'none'}")
print(f"  light-only: {l_only or 'none'}")

# A font must resolve in both themes, or the browser silently serves serif.
for critical in ("font-body", "font-display", "font-mono", "radius-md"):
    if critical not in shared and not (critical in light and critical in dark):
        fails.append(f"--{critical} is not resolvable in both themes")

print("\n" + ("ALL PASS" if not fails else "FAILURES:\n  " + "\n  ".join(fails)))
sys.exit(1 if fails else 0)
