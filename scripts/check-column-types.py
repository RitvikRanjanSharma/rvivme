#!/usr/bin/env python3
"""Fail when code writes a fractional value into an integer column.

WHY THIS EXISTS

Saving keywords to a strategy died with:

    invalid input syntax for type integer: "27.3"

strategy_keywords.baseline_pos was INTEGER. The value was a Search Console
average position, which is fractional by nature — an average across
impressions, not a SERP slot. The column was correct when rankings came from
DataForSEO, which returns a discrete rank; it stopped being correct the moment
the data source changed, and nothing noticed because nothing compares the
schema to the code.

The same trap was already documented inside lib/site-audit.ts, where
`numericValue` floats were being written into INTEGER lcp_ms and inp_ms
columns — and that one failed silently for a while because the UPDATE's error
was discarded. Twice is a pattern worth automating.

WHAT IT CHECKS

Integer columns are collected from supabase/migrations, minus any later
ALTER ... TYPE that widens them. Then object literals that look like DATABASE
ROWS — ones carrying a foreign key such as `user_id:` — are inspected for an
integer column assigned a fractional expression: parseFloat, .toFixed, a
division, or a field this codebase knows to be fractional.

The foreign-key requirement is what makes this usable. An earlier version
matched any object key sharing a name with a column and reported fifteen
correct lines, because `position` appears in every API response shape in the
project. A guard that is wrong fifteen times out of sixteen is one people
learn to skip, and then it protects nothing.

WHAT IT CANNOT DO, STATED PLAINLY

It sees only the write site. The bug that prompted it entered somewhere else:

    enrichTerm()                  baseline_pos: fromRank.position   // 27.3
    attachKeywordsToStrategy()    baseline_pos: k.baseline_pos      // opaque

By the time the value reaches the insert it is just a variable, and following
it would need real type analysis rather than a regex. So this catches the
direct form — a float going straight into a column, which is how the lcp_ms
and inp_ms bug in lib/site-audit.ts happened — and misses the indirect form.
Worth having for the half it covers; not worth mistaking for full cover.
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MIGRATIONS = ROOT / "supabase" / "migrations"

INT_COLUMN = re.compile(
    r"^\s{2,}([a-z_]+)\s+(INTEGER|SMALLINT|BIGINT)\b", re.M | re.I)
# A later migration may widen the type; that removes it from the risk set.
ALTERED = re.compile(
    r"ALTER\s+COLUMN\s+([a-z_]+)\s+TYPE\s+(NUMERIC|REAL|DOUBLE|DECIMAL)", re.I)

# Expressions that produce, or plausibly produce, a fraction.
FRACTIONAL = re.compile(
    r"""parseFloat\(
      | \.toFixed\(
      | \bnumericValue\b
      | \.\s*position\b
      | \bctr\b
      | \bavgPosition\b
      | \baverage[A-Z]\w*
      | \brate\b
      | [\w\)\]]\s*/\s*[\w\(]      # a division
    """,
    re.X,
)
SAFE = re.compile(r"Math\.round\(|Math\.floor\(|Math\.ceil\(|Math\.trunc\(|\bnull\b")

# Escape hatch, for values rounded somewhere the regex cannot see — a map built
# with Math.round() upstream, for instance. The reason is required, and it
# doubles as the note the next reader needs, because "is this already an
# integer?" is exactly as invisible to them at the write site as it is here.
#
#     // integer-by-construction: rounded when byQuery was built
ALLOW = re.compile(r"integer-by-construction:\s*\S+")

SKIP_PARTS = {"node_modules", ".next", "scripts"}

# An object literal carrying a foreign key is a database row. One without is
# an API response shape, a component prop, or an in-memory record — none of
# which have a column type to violate.
LOOKS_LIKE_ROW = re.compile(r"^\s*[a-z_]*_id\s*:", re.M)


def integer_columns() -> set[str]:
    cols: set[str] = set()
    widened: set[str] = set()
    for sql in sorted(MIGRATIONS.glob("*.sql")):
        text = sql.read_text(encoding="utf-8")
        for name, _ in INT_COLUMN.findall(text):
            cols.add(name.lower())
        for name, _ in ALTERED.findall(text):
            widened.add(name.lower())
    return cols - widened


def row_literals(src: str):
    """Yield (text, offset) for each brace-balanced literal that looks like a row."""
    for start in (m.start() for m in re.finditer(r"\{", src)):
        depth, i = 0, start
        while i < len(src):
            if src[i] == "{":
                depth += 1
            elif src[i] == "}":
                depth -= 1
                if depth == 0:
                    break
            i += 1
        if depth != 0:
            continue
        block = src[start:i + 1]
        # Bounded: a whole file is brace-balanced too, and is not a row.
        if len(block) > 2000:
            continue
        if LOOKS_LIKE_ROW.search(block):
            yield block, start


def main() -> int:
    cols = integer_columns()
    if not cols:
        print("check-column-types: no integer columns found — is the migrations path right?")
        return 1

    assign = re.compile(
        r"^\s*(" + "|".join(sorted(re.escape(c) for c in cols)) + r")\s*:\s*(.+?),?\s*$", re.M)

    problems: set[str] = set()
    for base in ("app", "lib"):
        for path in (ROOT / base).rglob("*.ts*"):
            if SKIP_PARTS & set(path.parts):
                continue
            src = path.read_text(encoding="utf-8")
            lines = src.splitlines()
            for block, offset in row_literals(src):
                for m in assign.finditer(block):
                    col, expr = m.group(1), m.group(2)
                    if SAFE.search(expr) or not FRACTIONAL.search(expr):
                        continue
                    line = src[:offset + m.start()].count("\n") + 1
                    # Exemption may sit on the line itself or in a short comment
                    # above it — three lines, because a reason worth writing
                    # rarely fits on one.
                    context = "\n".join(lines[max(0, line - 4):line])
                    if ALLOW.search(context):
                        continue
                    # Nested literals mean the same assignment is visited more
                    # than once; report it where it is, once.
                    problems.add(
                        f"{path.relative_to(ROOT).as_posix()}:{line}: `{col}` is an integer "
                        f"column but is assigned {expr.strip()}")

    if problems:
        print("Fractional values are being written into integer columns.\n")
        print("Postgres rejects the whole statement, so the user sees a raw")
        print("error like: invalid input syntax for type integer: \"27.3\"\n")
        for p in sorted(problems):
            print("  " + p)
        print("\nEither wrap the value in Math.round(), or widen the column. If the")
        print("fraction carries meaning — rank movement happens in tenths — widen it.")
        print("If it is already an integer from somewhere this check cannot see,")
        print("put // integer-by-construction: <reason> on the line above.")
        return 1

    print(f"check-column-types: OK — {len(cols)} integer column(s), none fed a fractional value")
    return 0


if __name__ == "__main__":
    sys.exit(main())
