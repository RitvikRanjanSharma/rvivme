// app/api/geo/route.ts
// =============================================================================
// AI Marketing Lab — GEO Citation Tracker
// Queries Claude to simulate what AI engines return for target keywords
// Checks if your domain is cited in AI-generated answers
// =============================================================================

import { NextResponse, type NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      // Structured signal — the UI renders a calm "not configured" state.
      return NextResponse.json(
        {
          success: false,
          reason:  "not_configured",
          message: "GEO citation tracking is not set up on this workspace yet.",
        },
        { status: 200 },
      );
    }

    const { domain, keywords } = await request.json();
    if (!domain || !keywords?.length) {
      return NextResponse.json({ error: "domain and keywords required" }, { status: 400 });
    }

    const results = await Promise.all(
      keywords.slice(0, 5).map(async (kw: string) => {
        try {
          const res = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "Content-Type":      "application/json",
              "anthropic-version": "2023-06-01",
              "x-api-key":         apiKey,
            },
            body: JSON.stringify({
              model:      "claude-haiku-4-5-20251001",
              max_tokens: 400,
              system: `You are simulating what an AI search engine (like Perplexity or Google AI Overviews) would return for a search query. Respond as if you are an AI giving a direct answer. Mention specific websites and domains that are authoritative sources on this topic. Be specific with domain names.`,
              messages: [{
                role:    "user",
                content: `Search query: "${kw}"\n\nGive a concise AI search answer (2-3 paragraphs) that cites specific websites and domains as sources.`,
              }],
            }),
          });

          if (!res.ok) {
            const text = await res.text().catch(() => "");
            console.error(`[geo] Anthropic ${res.status}: ${text.slice(0, 200)}`);
            return { keyword: kw, cited: false, answer: "", mentioned: [] };
          }

          const data    = await res.json();
          const answer  = data.content?.[0]?.text ?? "";
          // Check if domain appears in the answer
          const cited   = answer.toLowerCase().includes(domain.toLowerCase()) ||
                          answer.toLowerCase().includes(domain.replace("www.", "").toLowerCase());

          // Extract any domains mentioned
          const domainPattern = /(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:\.[a-zA-Z]{2,})?)/g;
          const mentioned: string[] = [];
          let match;
          while ((match = domainPattern.exec(answer)) !== null) {
            const d = match[1].toLowerCase();
            if (!mentioned.includes(d) && d.includes(".") && !d.startsWith("example")) {
              mentioned.push(d);
            }
          }

          return {
            keyword:   kw,
            cited,
            answer:    answer.slice(0, 300) + (answer.length > 300 ? "…" : ""),
            mentioned: mentioned.slice(0, 5),
          };
        } catch {
          return { keyword: kw, cited: false, answer: "", mentioned: [] };
        }
      })
    );

    const citationRate = results.length > 0
      ? Math.round((results.filter(r => r.cited).length / results.length) * 100)
      : 0;

    return NextResponse.json({
      success: true,
      domain,
      citationRate,
      results,
      totalChecked: results.length,
      cited:        results.filter(r => r.cited).length,
    });

  } catch (err: any) {
    console.error("[geo]", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
