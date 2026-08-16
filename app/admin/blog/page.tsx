// app/admin/blog/page.tsx
// ============================================================================
// The blog editor, folded into /admin.
//
// The editor itself is not duplicated — this renders the existing component
// from app/dashboard/blog. Copying ~600 lines of TipTap wiring to move it under
// a different URL would create two editors to keep in step, and the second one
// would drift.
//
// The old /dashboard/blog URL still works and still has its own gate. Both
// point at the same component, so there is one editor with two doors.
// ============================================================================

import BlogAdmin from "@/app/dashboard/blog/page";

export const dynamic = "force-dynamic";

export default function AdminBlog() {
  return <BlogAdmin />;
}
