// app/api/auth/google/disconnect/route.ts
// =============================================================================
// Removes the caller's Google connection and revokes the token at Google's end
// so the grant also disappears from their account permissions page.
// =============================================================================

import { NextResponse } from "next/server";
import { getCallerOrNull } from "@/lib/supabase-server";
import { deleteConnection, oauthConfigured } from "@/lib/google-oauth";

export const dynamic = "force-dynamic";

export async function POST() {
  const caller = await getCallerOrNull();
  if (!caller) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (!oauthConfigured()) {
    return NextResponse.json({ success: false, reason: "not_configured" }, { status: 200 });
  }

  try {
    await deleteConnection(caller.user.id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[auth/google/disconnect]", (err as Error).message);
    return NextResponse.json({ success: false, error: (err as Error).message }, { status: 500 });
  }
}
