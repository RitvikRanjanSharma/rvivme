// lib/admin.ts
// =============================================================================
// AI Marketing Lab — Admin allowlist helper
//
// Blog Admin (and any future operator-only surface) is gated by email. The
// allowlist lives in an env var so we can change it without touching code:
//
//   NEXT_PUBLIC_ADMIN_EMAILS=fvzj7p9f6n@privaterelay.appleid.com,other@you.com
//
// Why NEXT_PUBLIC_*: the check runs in the browser (client component). This is
// fine because the list itself isn't a secret — anyone can guess an email
// address. The real defence-in-depth is a Supabase RLS policy on `blog_posts`
// that only allows INSERT/UPDATE/DELETE from admin emails; the client-side
// gate is a nice UX layer on top so non-admins don't see a broken admin page.
//
// TODO (RLS): add a policy on `blog_posts` like:
//   USING (auth.jwt() ->> 'email' IN ('fvzj7p9f6n@privaterelay.appleid.com'))
// once we're ready to open the public URL to unauthenticated inbound traffic.
// =============================================================================

/** Comma-separated admin emails from the environment, lowercased. */
function adminEmailList(): string[] {
  const raw = process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? "";
  return raw
    .split(",")
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
}

/** True if the given email is on the admin allowlist. Empty/missing → false. */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const list = adminEmailList();
  if (list.length === 0) return false;
  return list.includes(email.toLowerCase());
}
