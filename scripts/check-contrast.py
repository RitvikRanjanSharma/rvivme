"""Parses globals.css and checks every text token against its own background.
Reads the file rather than restating values, so it stays true as the CSS changes."""
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

print("\n" + ("ALL PASS" if not fails else "FAILURES:\n  " + "\n  ".join(fails)))
sys.exit(1 if fails else 0)
