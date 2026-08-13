// lib/sanitize-html.ts
// =============================================================================
// AI Marketing Lab — conservative HTML sanitiser for blog post bodies
//
// Why hand-rolled: the build environment can't reach the npm registry, so
// DOMPurify / sanitize-html aren't installable. This is a deliberately strict
// ALLOWLIST sanitiser — anything not explicitly permitted is dropped. That's
// the safe failure direction: worst case a post loses formatting, never that a
// script executes.
//
// Threat model: blog_posts rows are written by the Blog Admin editor, which is
// now gated to NEXT_PUBLIC_ADMIN_EMAILS. But RLS still technically allows any
// authenticated user to insert, and AI-generated drafts pass through here too,
// so post bodies are treated as untrusted input on render regardless.
//
// Not a replacement for DOMPurify. If you ever get registry access, swap this
// out — the call site is a single function.
// =============================================================================

/** Tags we allow through. Everything else is stripped (contents kept). */
const ALLOWED_TAGS = new Set([
  "p", "br", "hr",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "strong", "b", "em", "i", "u", "s", "del", "mark", "sup", "sub",
  "ul", "ol", "li",
  "blockquote", "pre", "code",
  "a", "img", "figure", "figcaption",
  "table", "thead", "tbody", "tr", "th", "td",
  "span", "div",
]);

/** Per-tag attribute allowlist. Attributes not listed are dropped. */
const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a:   new Set(["href", "title", "target", "rel"]),
  img: new Set(["src", "alt", "title", "width", "height", "loading"]),
  td:  new Set(["colspan", "rowspan"]),
  th:  new Set(["colspan", "rowspan"]),
};

/** Tags whose entire contents are discarded, not just the tag itself. */
const VOID_CONTENT_TAGS = new Set(["script", "style", "iframe", "object", "embed", "noscript"]);

/**
 * Only http(s), protocol-relative, root-relative, and data:image URLs.
 * Blocks javascript:, vbscript:, data:text/html, and friends.
 */
function safeUrl(raw: string, allowDataImage = false): string | null {
  const url = raw.trim();
  // Strip control characters and whitespace that can be used to smuggle
  // "java\nscript:" past a naive check.
  const normalised = url.replace(/[\u0000-\u0020\s]/g, "").toLowerCase();

  if (normalised.startsWith("javascript:")) return null;
  if (normalised.startsWith("vbscript:"))   return null;
  if (normalised.startsWith("file:"))       return null;

  if (normalised.startsWith("data:")) {
    if (!allowDataImage) return null;
    // Permit only genuine inline images.
    if (!/^data:image\/(png|jpe?g|gif|webp|avif|svg\+xml);base64,/.test(normalised)) return null;
    return url;
  }

  // Relative, root-relative, protocol-relative, http(s), mailto — all fine.
  return url;
}

function escapeText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Sanitise an HTML string down to the allowlist above.
 *
 * Implementation note: this runs on the client (blog post page is a client
 * component) so we can use the browser's own parser via DOMParser, which is far
 * more reliable than regex against malformed markup. On the server (SSR pass)
 * DOMParser doesn't exist, so we fall back to returning escaped plain text —
 * the real content renders on hydration. That's intentional: it's better to
 * briefly show escaped text than to ship an unsanitised string into SSR HTML.
 */
export function sanitizeHtml(dirty: string): string {
  if (!dirty) return "";

  if (typeof window === "undefined" || typeof DOMParser === "undefined") {
    return escapeText(dirty);
  }

  const doc = new DOMParser().parseFromString(`<div>${dirty}</div>`, "text/html");
  const root = doc.body.firstElementChild;
  if (!root) return "";

  const walk = (node: Element) => {
    // Walk a LIVE child list with an explicit cursor rather than a snapshot.
    //
    // This matters for correctness, not style. When we unwrap a disallowed
    // element we splice its children up into `node`. Those promoted nodes were
    // never in a snapshot taken beforehand, so a snapshot-based loop would skip
    // them entirely — meaning `<unknown><img onerror=alert(1)></unknown>` would
    // survive with its event handler intact. By not advancing the cursor after
    // an unwrap, the promoted nodes land at the current index and get inspected
    // on the next iteration.
    let i = 0;
    while (i < node.children.length) {
      const child = node.children[i];
      const tag   = child.tagName.toLowerCase();

      if (VOID_CONTENT_TAGS.has(tag)) {
        child.remove();
        continue;              // same index now holds the next sibling
      }

      if (!ALLOWED_TAGS.has(tag)) {
        // Unwrap: keep the text/children, drop the element itself. Deliberately
        // no i++ — the promoted children now sit at this index and must be
        // re-examined.
        while (child.firstChild) node.insertBefore(child.firstChild, child);
        child.remove();
        continue;
      }

      // Scrub attributes.
      const allowed = ALLOWED_ATTRS[tag] ?? new Set<string>();
      for (const attr of Array.from(child.attributes)) {
        const name = attr.name.toLowerCase();

        // Every on* handler goes, unconditionally.
        if (name.startsWith("on") || !allowed.has(name)) {
          child.removeAttribute(attr.name);
          continue;
        }

        if (name === "href" || name === "src") {
          const cleaned = safeUrl(attr.value, tag === "img");
          if (cleaned === null) child.removeAttribute(attr.name);
          else                  child.setAttribute(attr.name, cleaned);
        }
      }

      // External links open safely.
      if (tag === "a" && child.getAttribute("target") === "_blank") {
        child.setAttribute("rel", "noopener noreferrer");
      }
      // Images below the fold shouldn't block first paint.
      if (tag === "img" && !child.getAttribute("loading")) {
        child.setAttribute("loading", "lazy");
      }

      walk(child);
      i++;                     // this element is clean — move on
    }
  };

  walk(root);
  return root.innerHTML;
}

/**
 * Heuristic: does this string look like HTML (from the TipTap editor) rather
 * than markdown (from the AI draft generator)?
 *
 * The two content sources produce different formats and both land in
 * blog_posts.content, so the renderer has to branch. We look for block-level
 * tags specifically — a stray "<" in prose or an inline `**bold**` marker
 * shouldn't flip the decision.
 */
export function looksLikeHtml(content: string): boolean {
  if (!content) return false;
  return /<(p|div|h[1-6]|ul|ol|li|blockquote|pre|img|table|figure|br)\b[^>]*>/i.test(content);
}
