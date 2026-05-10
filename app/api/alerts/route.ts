// app/api/alerts/route.ts
// =============================================================================
// AI Marketing Lab — Alert rule CRUD
// =============================================================================
// GET    — list this user's alert rules. If they have none, seed sensible
//          defaults (rank_drop @ 5, audit_critical, lost_keyword) so the UI
//          shows toggleable rows on first visit.
// PUT    — body { id, enabled?, email_enabled?, threshold? }  update one rule
// POST   — body { rule_type, threshold?, email_enabled? }     create a rule
// DELETE — body { id }                                        delete a rule
// =============================================================================

import { NextResponse, type NextRequest } from "next/server";
import { getCallerOrNull } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const DEFAULT_RULES: { rule_type: string; threshold: number | null }[] = [
  { rule_type: "rank_drop",      threshold: 5  },
  { rule_type: "rank_gain",      threshold: 10 },
  { rule_type: "audit_critical", threshold: null },
  { rule_type: "lost_keyword",   threshold: null },
  { rule_type: "new_keyword",    threshold: null },
];

export async function GET() {
  const caller = await getCallerOrNull();
  if (!caller) {
    return NextResponse.json({ success: false, error: "unauthenticated" }, { status: 401 });
  }

  let { data: rows } = await caller.supabase
    .from("alerts")
    .select("*")
    .eq("user_id", caller.user.id)
    .order("created_at", { ascending: true });

  if (!rows || rows.length === 0) {
    // First visit — seed defaults. Rank drop on by default; everything else
    // off so we don't spam new users while their data is empty.
    const inserts = DEFAULT_RULES.map((r, i) => ({
      user_id:       caller.user.id,
      rule_type:     r.rule_type as
        "rank_drop" | "rank_gain" | "traffic_drop" | "traffic_spike"
        | "new_keyword" | "lost_keyword" | "audit_critical"
        | "broken_page" | "manual",
      threshold:     r.threshold,
      enabled:       i === 0 || r.rule_type === "audit_critical",
      email_enabled: i === 0,
    }));
    const { data: seeded } = await caller.supabase
      .from("alerts")
      .insert(inserts)
      .select("*");
    rows = seeded ?? [];
  }

  return NextResponse.json({ success: true, alerts: rows });
}

export async function PUT(req: NextRequest) {
  const caller = await getCallerOrNull();
  if (!caller) {
    return NextResponse.json({ success: false, error: "unauthenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({} as {
    id?: string; enabled?: boolean; email_enabled?: boolean; threshold?: number | null;
  }));
  if (!body.id) {
    return NextResponse.json({ success: false, error: "id required" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (typeof body.enabled === "boolean")        update.enabled       = body.enabled;
  if (typeof body.email_enabled === "boolean")  update.email_enabled = body.email_enabled;
  if (body.threshold === null || typeof body.threshold === "number") update.threshold = body.threshold;

  const { data, error } = await caller.supabase
    .from("alerts")
    .update(update)
    .eq("id", body.id)
    .eq("user_id", caller.user.id)
    .select("*")
    .maybeSingle();

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, alert: data });
}

export async function POST(req: NextRequest) {
  const caller = await getCallerOrNull();
  if (!caller) {
    return NextResponse.json({ success: false, error: "unauthenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({} as {
    rule_type?: string; threshold?: number | null; email_enabled?: boolean;
  }));
  if (!body.rule_type) {
    return NextResponse.json({ success: false, error: "rule_type required" }, { status: 400 });
  }

  const { data, error } = await caller.supabase
    .from("alerts")
    .insert({
      user_id:       caller.user.id,
      rule_type:     body.rule_type as
        "rank_drop" | "rank_gain" | "traffic_drop" | "traffic_spike"
        | "new_keyword" | "lost_keyword" | "audit_critical"
        | "broken_page" | "manual",
      threshold:     body.threshold ?? null,
      enabled:       true,
      email_enabled: body.email_enabled ?? true,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, alert: data });
}

export async function DELETE(req: NextRequest) {
  const caller = await getCallerOrNull();
  if (!caller) {
    return NextResponse.json({ success: false, error: "unauthenticated" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({} as { id?: string }));
  if (!body.id) {
    return NextResponse.json({ success: false, error: "id required" }, { status: 400 });
  }
  await caller.supabase.from("alerts").delete().eq("id", body.id).eq("user_id", caller.user.id);
  return NextResponse.json({ success: true });
}
