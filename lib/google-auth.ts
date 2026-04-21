// lib/google-auth.ts
// =============================================================================
// AI Marketing Lab — Google service-account auth helper
// Shared by /api/ga4 and /api/gsc. The biggest real-world footgun is that the
// JSON key pasted into .env often contains *literal* newlines inside the
// `private_key` field, which makes JSON.parse fail. We accept three forms:
//
//   1. Raw JSON string (ideal, with \n escaped)
//   2. Base64-encoded JSON string (GA4_SERVICE_ACCOUNT_KEY_B64 pattern)
//   3. JSON whose string values contain unescaped newlines — we rewrite those
//      to \n so the parser can read it.
// =============================================================================

export type ServiceAccountKey = {
  client_email: string;
  private_key:  string;
};

/** Escape unescaped newlines / tabs that appear inside JSON string literals. */
function escapeNewlinesInStrings(raw: string): string {
  let out      = "";
  let inString = false;
  let escape   = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (escape) { out += ch; escape = false; continue; }
    if (ch === "\\") { out += ch; escape = true; continue; }
    if (ch === '"')  { inString = !inString; out += ch; continue; }
    if (inString) {
      if (ch === "\n") { out += "\\n"; continue; }
      if (ch === "\r") { out += "\\r"; continue; }
      if (ch === "\t") { out += "\\t"; continue; }
    }
    out += ch;
  }
  return out;
}

export function parseServiceAccountKey(raw: string | undefined | null): ServiceAccountKey {
  if (!raw || !raw.trim()) {
    throw new Error("GA4_SERVICE_ACCOUNT_KEY is not set");
  }
  const trimmed = raw.trim();

  // 1. Direct JSON parse.
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed.client_email && parsed.private_key) return parsed as ServiceAccountKey;
  } catch { /* fall through */ }

  // 2. Base64-encoded JSON.
  if (/^[A-Za-z0-9+/=\s]+$/.test(trimmed) && !trimmed.startsWith("{")) {
    try {
      const decoded = Buffer.from(trimmed, "base64").toString("utf8");
      const parsed  = JSON.parse(decoded);
      if (parsed.client_email && parsed.private_key) return parsed as ServiceAccountKey;
    } catch { /* fall through */ }
  }

  // 3. JSON with unescaped newlines inside string literals (common .env case).
  if (trimmed.startsWith("{")) {
    try {
      const patched = escapeNewlinesInStrings(trimmed);
      const parsed  = JSON.parse(patched);
      if (parsed.client_email && parsed.private_key) return parsed as ServiceAccountKey;
    } catch { /* fall through */ }
  }

  throw new Error(
    "GA4_SERVICE_ACCOUNT_KEY is not valid JSON. " +
    "Paste the entire service-account JSON as a single line with \\n in the private_key, " +
    "or base64-encode it before putting it in .env."
  );
}

/** Sign a JWT for Google's OAuth token endpoint. Pure runtime: no npm deps. */
export async function getGoogleAccessToken(scope: string): Promise<string> {
  const key = parseServiceAccountKey(process.env.GA4_SERVICE_ACCOUNT_KEY);

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss:   key.client_email,
    scope,
    aud:   "https://oauth2.googleapis.com/token",
    iat:   now,
    exp:   now + 3600,
  };

  const header = { alg: "RS256", typ: "JWT" };
  const b64    = (obj: object) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  const unsigned = `${b64(header)}.${b64(payload)}`;

  const pemBody = key.private_key
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    Buffer.from(pemBody, "base64"),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    Buffer.from(unsigned),
  );

  const jwt = `${unsigned}.${Buffer.from(signature).toString("base64url")}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:    new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion:  jwt,
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error(`Failed to get Google access token: ${err}`);
  }

  const tokenData = await tokenRes.json();
  return tokenData.access_token as string;
}
