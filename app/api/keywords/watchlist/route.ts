// app/api/keywords/watchlist/route.ts
// =============================================================================
// AI Marketing Lab — the watchlist, as one thing
//
// tracked_keywords already existed and already had a `source` column carrying
// exactly the bucket idea — gap, opportunity, manual, ranking, idea. What it
// did not have was a single way to add to it. The rankings tab, the ideas tab
// and the content-gap tab each wrote to it with their own open-coded upsert,
// so "add this keyword" behaved slightly differently depending on which tab
// you were standing in.
//
// WRITES ARE VERIFIED, NOT ASSUMED
//
// PostgREST reports an UPDATE that matched zero rows as a success. This
// codebase has already lost a week to that once, when Settings showed a green
// tick and stored nothing. Every write here checks the returned rows, so a
// no-op cannot pass as a save.
//
// SOURCE IS PROVENANCE, NOT A BUCKET
//
// Worth keeping straight: `source` records where a keyword CAME FROM and never
// changes. The bucket is recomputed from live Search Console data every time
// the planner loads, because a keyword's situation moves and a stored label
// would go stale silently — which is the failure this product keeps having to
// design against.
// =============================================================================

import { NextResponse, type NextRequest } from "next/server";
import { getCallerOrNull } from "@/lib/supabase-server";

export const dynamic     = "force-dynamic";
export const maxDuration = 30;

/** Matches the CHECK constraint on tracked_keywords.source. */
const SOURCES = ["gap", "opportunity", "manual", "ranking", "idea"] as const;
type Source = (typeof SOURCES)[number];

const MAX_PER_REQUEST = 100;

function isSource(v: unknown): v is Source {
  return typeof v === "string" && (SOURCES as readonly string[]).includes(v);
}

/** Normalise so "Roofing Leeds" and "roofing leeds " are one keyword. */
function normalise(term: string): string {
  return term.trim().toLowerCase().replace(/\s+/g, " ");
}

// ─── GET: the whole list ─────────────────────────────────────────────────────

export async function GET() {
  try {
    const caller = await getCallerOrNull();
    if (!caller) {
      return NextResponse.json({ success: false, reason: "unauthenticated" }, { status: 401 });
    }

    const { data, error } = await caller.supabase
      .from("tracked_keywords")
      .select("id, keyword, source, competitor_domain, notes, created_at")
      .eq("user_id", caller.user.id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ success: false, reason: "db_error", message: error.message });
    }
    return NextResponse.json({ success: true, keywords: data ?? [], total: (data ?? []).length });

  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[keywords/watchlist GET]", message);
    return NextResponse.json({ success: false, reason: "api_error", message });
  }
}

// ─── POST: add one or many ───────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const caller = await getCallerOrNull();
    if (!caller) {
      return NextResponse.json({ success: false, reason: "unauthenticated" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const raw  = Array.isArray(body?.keywords) ? body.keywords : [body?.keyword];
    const source: Source = isSource(body?.source) ? body.source : "manual";
    const competitorDomain = typeof body?.competitorDomain === "string" ? body.competitorDomain : null;
    const notes = typeof body?.notes === "string" ? body.notes.slice(0, 500) : null;

    const terms = [...new Set(
      (raw as unknown[])
        .filter((t): t is string => typeof t === "string")
        .map(normalise)
        .filter(t => t.length > 0 && t.length <= 200),
    )];

    if (terms.length === 0) {
      return NextResponse.json({
        success: false, reason: "bad_request",
        message: "Send `keyword` or `keywords` — each between 1 and 200 characters.",
      }, { status: 400 });
    }
    if (terms.length > MAX_PER_REQUEST) {
      return NextResponse.json({
        success: false, reason: "too_many",
        message: `That is ${terms.length} keywords; ${MAX_PER_REQUEST} is the most we take in one request.`,
      }, { status: 400 });
    }

    const rows = terms.map(keyword => ({
      user_id:           caller.user.id,
      keyword,
      source,
      competitor_domain: competitorDomain,
      notes,
      // Null throughout, not zero. We have no volume, no difficulty and no
      // CPC for these, and a 0 stored here would be indistinguishable from a
      // measurement when something reads it back next month.
      volume:         null,
      difficulty:     null,
      cpc:            null,
      intent:         null,
      your_pos:       null,
      competitor_pos: null,
    }));

    const { data, error } = await caller.supabase
      .from("tracked_keywords")
      .upsert(rows as never, { onConflict: "user_id,keyword,competitor_domain" })
      .select("id, keyword");

    if (error) {
      // The FK on user_id points at public.users. A violation means the caller
      // has a session but no profile row — our bug, not their input.
      const missingProfile = /violates foreign key constraint .*user_id/i.test(error.message);
      return NextResponse.json({
        success: false,
        reason:  missingProfile ? "no_profile_row" : "db_error",
        message: missingProfile
          ? "Your account is missing its profile record, so there is nothing to attach keywords to. Reload the page — the app repairs this automatically."
          : error.message,
      });
    }

    // A zero-row write is a success to PostgREST and a failure to the user.
    if (!data || data.length === 0) {
      return NextResponse.json({
        success: false, reason: "not_saved",
        message: "Nothing was saved. Check your profile is set up under Settings.",
      });
    }

    return NextResponse.json({
      success: true,
      added:    data.length,
      keywords: data,
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[keywords/watchlist POST]", message);
    return NextResponse.json({ success: false, reason: "api_error", message });
  }
}

// ─── DELETE: remove one ──────────────────────────────────────────────────────

export async function DELETE(request: NextRequest) {
  try {
    const caller = await getCallerOrNull();
    if (!caller) {
      return NextResponse.json({ success: false, reason: "unauthenticated" }, { status: 401 });
    }

    const params  = new URL(request.url).searchParams;
    const id      = params.get("id");
    const keyword = params.get("keyword");

    if (!id && !keyword) {
      return NextResponse.json({
        success: false, reason: "bad_request", message: "Pass ?id= or ?keyword=",
      }, { status: 400 });
    }

    // RLS already restricts to the caller's rows; the explicit user_id filter
    // is belt and braces, and makes the intent readable without knowing the
    // policy.
    let q = caller.supabase.from("tracked_keywords").delete().eq("user_id", caller.user.id);
    q = id ? q.eq("id", id) : q.eq("keyword", normalise(keyword!));

    const { data, error } = await q.select("id");
    if (error) {
      return NextResponse.json({ success: false, reason: "db_error", message: error.message });
    }
    if (!data || data.length === 0) {
      // Distinguished from success: a delete that matched nothing means the row
      // was already gone or never existed, and silently reporting "removed"
      // would leave a stale row on screen with no explanation.
      return NextResponse.json({
        success: false, reason: "not_found",
        message: "That keyword wasn't on your watchlist.",
      });
    }

    return NextResponse.json({ success: true, removed: data.length });

  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[keywords/watchlist DELETE]", message);
    return NextResponse.json({ success: false, reason: "api_error", message });
  }
}
