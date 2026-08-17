// app/BingSiteAuth.xml/route.ts
// =============================================================================
// Bing Webmaster Tools site-ownership verification.
//
// Bing checks for this exact file at the site root and reads the token inside
// it. Serving it from a Route Handler rather than public/ keeps it beside the
// other generated root files (robots.txt, llms.txt) and means it cannot be lost
// in a future reshuffle of static assets.
//
// THIS TOKEN IS NOT A SECRET.
//
// It is a public proof-of-ownership marker — its whole purpose is to be
// readable by anyone who fetches https://www.aimarketinglab.co.uk/BingSiteAuth.xml,
// which is how Bing verifies it. Hardcoding it is correct. The Bing Webmaster
// API KEY is an entirely different value, is genuinely secret, and belongs in
// the environment (BING_WEBMASTER_API_KEY) — never here.
//
// Why Bing matters for this product specifically: Bing's index is what powers
// ChatGPT Search. For a tool whose differentiator is answer-engine visibility,
// having Google Search Console but not Bing leaves out the index sitting behind
// the answer engine we talk about most.
// =============================================================================

const VERIFICATION_TOKEN = "FD04AC6FF6A22066E7EFEFD2E84F00E5";

export const dynamic = "force-static";

export function GET() {
  const body = `<?xml version="1.0"?>
<users>
  <user>${VERIFICATION_TOKEN}</user>
</users>
`;

  return new Response(body, {
    headers: {
      // Bing expects XML here. Serving it as text/plain has been known to fail
      // verification even when the content is byte-identical.
      "Content-Type":  "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
