// app/api/notifications/route.ts
// =============================================================================
// AI Marketing Lab — Notifications inbox
// =============================================================================
// GET   — return the caller's most recent notifications + unread count
// PATCH — body { id?: string; all?: true }  marks one or all as read
// =============================================================================

import { NextResponse, type NextRequest } from "next/server";
import { getCallerOrNull } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET() {
  const caller = await getCallerOrNull();
  if (!caller) {
    return NextResponse.json({ success: false, error: "unauthenticated" }, { status: 401 });
  }

  const notifRes = await caller.supabase
    .from("notifications")
    .select("*")
    .eq("user_id", caller.user.id)
    .order("created_at", { ascending: false })
    .limit(50);
  // Cast to a shape that has just the field we actually read here.
  const notifications = (notifRes.data ?? []) as { read_at: string | null }[];
  const unread = notifications.filter(n => !n.read_at).length;

  return NextResponse.json({
    success: true,
    notifications: notifRes.data ?? [],
    unread,
  });
}

export async function PATCH(req: NextRequest) {
  const caller = await getCallerOrNull();
  if (!caller) {
    return NextResponse.json({ success: false, error: "unauthenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({} as { id?: string; all?: boolean }));
  const now  = new Date().toISOString();

  if (body.all) {
    await caller.supabase
      .from("notifications")
      .update({ read_at: now } as never)
      .eq("user_id", caller.user.id)
      .is("read_at", null);
    return NextResponse.json({ success: true, all: true });
  }

  if (typeof body.id === "string" && body.id) {
    await caller.supabase
      .from("notifications")
      .update({ read_at: now } as never)
      .eq("id", body.id)
      .eq("user_id", caller.user.id);
    return NextResponse.json({ success: true, id: body.id });
  }

  return NextResponse.json({ success: false, error: "id or all required" }, { status: 400 });
}
