# Google OAuth Setup — User Checklist

Before I (Claude) can build the OAuth flow that lets users connect *their own*
GA4 property and Search Console site, you need to set up the Google Cloud
project so it's allowed to ask users for permission. This is a one-time human
job — Google won't let an automated process do it. Plan ~90 minutes total,
spread over a few sittings, plus 2–6 weeks of clock time waiting for Google
to approve the verification.

You can do all of this in parallel with customer discovery. Nothing here
requires the product to be working.

---

## 1. Create or reuse a Google Cloud project (~5 min)

You probably already have `ai-marketing-labs` from your existing GA4 service
account. You can keep using it.

1. Go to https://console.cloud.google.com/
2. Top bar → select project `ai-marketing-labs` (or whatever you used)
3. If you don't have one yet: top bar → "New Project" → name it
   `ai-marketing-lab` → Create.

## 2. Enable the APIs we need (~3 min)

Still in Google Cloud Console:

1. Left menu → APIs & Services → Enabled APIs & Services → "+ ENABLE APIS AND SERVICES"
2. Search and enable each of these (one at a time):
   - **Google Analytics Data API** (for GA4 reads)
   - **Google Search Console API**
   - **Google PageSpeed Insights API** (you may already have this enabled)

If they show "API enabled" they're already on. Skip those.

## 3. Configure the OAuth consent screen (~15 min)

This is what users will see when they click "Connect Google" in the app.

1. Left menu → APIs & Services → **OAuth consent screen**
2. User Type → **External** → Create
3. App information:
   - **App name**: `AI Marketing Lab`
   - **User support email**: your real email (the one you check)
   - **App logo**: upload your logo (optional but improves trust — if you
     have one in `public/`, upload that)
4. App domain:
   - **Application home page**: `https://aimarketinglab.co.uk`
   - **Application privacy policy link**: `https://aimarketinglab.co.uk/privacy`
   - **Application terms of service link**: `https://aimarketinglab.co.uk/terms`
5. Authorized domains: `aimarketinglab.co.uk`
6. Developer contact: your email again
7. Save and continue.

## 4. Add the scopes we'll request (~5 min)

Same wizard, next step is Scopes.

1. Click "Add or remove scopes"
2. Filter the list and tick:
   - `.../auth/analytics.readonly` — read GA4 data
   - `.../auth/webmasters.readonly` — read Search Console data
   - `.../auth/userinfo.email` — so we know which Google account they connected
   - `openid`
3. **Sensitive scopes** are the first two (Google flags them in red). They're
   the reason you'll need verification later — but we still tick them now.
4. Save and continue.

## 5. Add yourself as a test user (~2 min)

Until Google approves verification, only test users you list explicitly can
sign in with these scopes. Up to 100 test users.

1. Test users → Add users → enter your email + 2-3 friend emails
2. Save and continue → Back to dashboard

You can now develop and test as a "test user." It will say "unverified app —
proceed at your own risk" — that's normal during development.

## 6. Create OAuth client credentials (~5 min)

1. Left menu → APIs & Services → **Credentials**
2. + CREATE CREDENTIALS → OAuth client ID
3. Application type → **Web application**
4. Name: `AI Marketing Lab — Web`
5. Authorized JavaScript origins:
   - `https://aimarketinglab.co.uk`
   - `http://localhost:3000` (for local dev)
6. Authorized redirect URIs (this is critical — copy exactly):
   - `https://aimarketinglab.co.uk/api/auth/google/callback`
   - `http://localhost:3000/api/auth/google/callback`
7. Create.

A modal pops up with:
- **Client ID** (something like `1234-abc.apps.googleusercontent.com`)
- **Client secret** (something like `GOCSPX-...`)

Copy both. You'll add them to Vercel as env vars:
- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`

Don't commit either to git. They're Vercel env vars only.

## 7. Submit for verification (~10 min, then 2–6 weeks of waiting)

You can skip this for the closed beta with test users, but kick it off now
because Google takes weeks to respond. The waiting time is dead time you
can't compress, so start the clock today.

1. OAuth consent screen page → "Publish App" → "Prepare for verification"
2. You'll need:
   - A **demo video** (~2 min) showing your app, the OAuth flow, what data
     you read, and how the user can disconnect. Record on your phone, upload
     unlisted to YouTube, paste link.
   - **Justification** for each sensitive scope. Use these (edit to fit):
     - `analytics.readonly`: "We display the user's website traffic trends
       and forecast future traffic so they can see how their SEO efforts are
       performing. Read-only — we never modify or delete GA4 data."
     - `webmasters.readonly`: "We pull the user's search queries, click-
       through rates, and average positions to track keyword rankings over
       time. Read-only."
   - Show that your **privacy policy** mentions Google API data usage and
     that you "use Google API Services data in compliance with the
     Limited Use requirements." (We need to add this language to
     `/privacy` — small task.)
3. Submit.

Google will email you with questions or approval. Reply quickly when they do
or the case stalls.

---

## What you give me when you're done

Once steps 1–6 are complete, ping me with:

```
GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...
```

(Don't paste these in chat — set them in Vercel env. I just need to know
they're set so I can wire up the OAuth flow on the code side.)

Then I'll:
- Add `google_oauth_tokens` table to Supabase (refresh-token storage per user)
- Build `/api/auth/google/start` and `/api/auth/google/callback` routes
- Update `lib/google-auth.ts` to use the user's refresh token instead of the
  shared service account
- Update `/onboarding` so step 3 ("Analytics") becomes a "Connect Google"
  button instead of asking for property IDs
- Deprecate `GA4_SERVICE_ACCOUNT_KEY` (we keep it as a fallback for your own
  workspace until you decide to remove it)

That's the engineering side. Should be 3-4 days of work once you've done
steps 1-6.

---

## What if Google rejects verification?

Common reasons + fixes:

- **Privacy policy doesn't mention Limited Use** → I'll add the boilerplate.
- **Demo video too short or unclear** → re-record showing the full OAuth
  flow including the scope consent screen and a disconnect option.
- **No homepage** → we have one, just point them at it.
- **Scopes look excessive** → we're only requesting the minimum read-only
  ones, so this should be defensible.

Most rejections are fixable in one or two iterations. Plan for it; don't
panic if the first reply is "needs more information."
