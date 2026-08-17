// lib/date-range.ts
// =============================================================================
// AI Marketing Lab — the date ranges the dashboard offers
//
// One definition, shared by the API routes and the panels, because the two
// disagreeing is how you end up with a chart labelled "Last 28 Days" showing
// ninety days of data. The label and the query have to come from the same
// place.
//
// TWO THINGS THAT ARE NOT ARBITRARY
//
// Search Console lags roughly three days. A range that ends today therefore
// ends with days that are empty or half-populated, and a chart that always
// droops at the right-hand edge trains you to distrust it. Every GSC range
// ends three days back.
//
// Search Console also only retains 16 months, so ranges beyond that would
// silently return less than they claim. The longest offered is 12 months,
// which stays inside the window with room to spare.
// =============================================================================

export type RangeKey = "7d" | "28d" | "90d" | "180d" | "12m";

export type RangeSpec = {
  key:   RangeKey;
  /** Shown in the selector. */
  label: string;
  /** Used in headings — reads naturally after "Last". */
  long:  string;
  days:  number;
};

export const RANGES: RangeSpec[] = [
  { key: "7d",   label: "7 days",   long: "7 Days",   days: 7   },
  { key: "28d",  label: "28 days",  long: "28 Days",  days: 28  },
  { key: "90d",  label: "3 months", long: "3 Months", days: 90  },
  { key: "180d", label: "6 months", long: "6 Months", days: 180 },
  { key: "12m",  label: "12 months", long: "12 Months", days: 365 },
];

export const DEFAULT_RANGE: RangeKey = "28d";

/** Search Console's reporting delay, in days. */
export const GSC_LAG_DAYS = 3;

export function rangeFor(key: string | null | undefined): RangeSpec {
  return RANGES.find(r => r.key === key) ?? RANGES.find(r => r.key === DEFAULT_RANGE)!;
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Start and end dates for a range.
 *
 * `lagDays` shifts the whole window backwards. Pass GSC_LAG_DAYS for Search
 * Console; leave it at 0 for GA4, which reports same-day.
 */
export function rangeDates(spec: RangeSpec, lagDays = 0): { startDate: string; endDate: string } {
  const end   = new Date(Date.now() - lagDays * 86_400_000);
  const start = new Date(end.getTime() - spec.days * 86_400_000);
  return { startDate: iso(start), endDate: iso(end) };
}

/**
 * How many points to plot.
 *
 * A year of daily points on a 300px-wide chart is a smear — more ink than
 * information. Longer ranges get bucketed so the line stays readable, and the
 * bucket size is returned so the axis can say what each point represents
 * rather than implying they are all days.
 */
export function bucketFor(spec: RangeSpec): { size: number; unit: "day" | "week" | "month" } {
  if (spec.days <= 28)  return { size: 1,  unit: "day"   };
  if (spec.days <= 180) return { size: 7,  unit: "week"  };
  return { size: 30, unit: "month" };
}

/** Collapse a daily series into buckets, summing the numeric fields given. */
export function bucketSeries<T extends Record<string, unknown>>(
  rows: T[],
  size: number,
  sumFields: (keyof T)[],
  dateField: keyof T,
): T[] {
  if (size <= 1 || rows.length === 0) return rows;
  const out: T[] = [];
  for (let i = 0; i < rows.length; i += size) {
    const chunk = rows.slice(i, i + size);
    // The bucket is labelled with its FIRST date, not its last. A point
    // labelled with the end date reads as "this happened on the 7th" when it
    // actually covers the 1st to the 7th.
    const merged = { ...chunk[0] } as T;
    for (const f of sumFields) {
      const total = chunk.reduce((acc, r) => acc + (Number(r[f]) || 0), 0);
      (merged as Record<keyof T, unknown>)[f] = total;
    }
    (merged as Record<keyof T, unknown>)[dateField] = chunk[0][dateField];
    out.push(merged);
  }
  return out;
}
