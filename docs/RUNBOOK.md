# AI Marketing Lab — Runbook

Operational reference for the soft launch (June 2026 → September 2026 full launch).
Covers the env vars, cron jobs, manual one-time setup, and what to do when something
breaks. Anything not in here belongs in either `AGENTS.md` (for Claude) or the
in-app `/privacy` page (for users).

---

## 1. Required environment variables

These all live in Vercel project settings → Environment Variables. Anything
marked **secret** must be set in production *only* — never check it into git
or share it in screenshots.

### Supabase
| Var                              | Purpose                                                     |
| -------------------------------- | ----------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`       | Project URL — public                                        |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`  | Anon key — public, used by browser + RLS                    |
| `SUPABASE_SERVICE_ROLE_KEY`      | **secret** — cron jobs only, bypasses RLS                   |

### Cron + transactional email
| Var                              | Purpose                                                     |
| -------------------------------- | ----------------------------------------------------------- |
| `CRON_SECRET`                    | **secret** — Vercel Cron sends `Authorization: Bearer <this>` |
| `APP_URL`                        | Public app URL, used to build links in emails (`https://aimarketinglab.co.uk`) |
| `RESEND_API_KEY`                 | **secret** — Resend transactional sending                   |
| `RESEND_FROM_EMAIL`              | Verified sender, e.g. `AI Marketing Lab <hello@aimarketinglab.co.uk>` |

If `RESEND_API_KEY` is unset, email sending is a soft no-op. Notifications
still get written to the inbox; just no email goes out.

### Data providers
| Var                              | Purpose                                                     |
| -------------------------------- | ----------------------------------------------------------- |
| `DATAFORSEO_LOGIN`               | DataForSEO basic auth username                              |
| `DATAFORSEO_PASSWORD`            | **secret** — DataForSEO basic auth password                 |
| `DFS_SERP_ENABLED`               | Set to `"true"` to use real DataForSEO AI Overview data for GEO. Otherwise GEO falls back to Claude simulation |
| `ANTHROPIC_API_KEY`              | **secret** — Claude API key                                 |
| `GOOGLE_PSI_API_KEY`             | Optional — PageSpeed Insights API key (raises rate limit from anonymous tier) |
| `GA4_SERVICE_ACCOUNT_KEY`        | **secret** — base64-encoded GA4 service account JSON        |
| `GSC_SITE_URL`                   | Default GSC site URL when user hasn't set one               |

### Behaviour switches
| Var                              | Purpose                                                     |
| -------------------------------- | ----------------------------------------------------------- |
| `QUOTA_ENFORCE`                  | `"true"` to actually enforce daily quotas. Default is observe-only — quotas are counted but never block calls |

---

## 2. One-time setup checklist

After deploying for the first time:

1. **Run migration `007_seo_foundations.sql`** in Supabase SQL editor (or via the
   migrations CLI). This adds: `keyword_rankings_history`, `site_audits`,
   `audit_findings`, `alerts`, `notifications`, `api_usage_quotas`, `cache_entries`,
   plus the `unread_notification_count` helper function and RLS policies.

2. **Generate `CRON_SECRET`** — `openssl rand -hex 32` works. Set it in Vercel,
   then redeploy. Vercel Cron picks it up automatically because the routes use
   `Authorization: Bearer <CRON_SECRET>`.

3. **Get a `SUPABASE_SERVICE_ROLE_KEY`** from the Supabase project settings.
   This bypasses RLS and is used by every cron route.

4. **Verify a sender domain in Resend** for `aimarketinglab.co.uk`. Without
   this, emails fail with `domain not verified`. Then set `RESEND_FROM_EMAIL`
   to the verified address.

5. **Test each cron manually** by hitting it with the secret as a query param
   while logged out. They are idempotent and safe to re-run.

   ```bash
   curl https://aimarketinglab.co.uk/api/cron/cleanup?secret=$CRON_SECRET
   curl https://aimarketinglab.co.uk/api/cron/daily-rank-snapshot?secret=$CRON_SECRET
   curl https://aimarketinglab.co.uk/api/cron/check-alerts?secret=$CRON_SECRET
   curl https://aimarketinglab.co.uk/api/cron/weekly-digest?secret=$CRON_SECRET
   ```

6. **In the app**, sign up as yourself. Confirm:
   - Onboarding wizard sends you to `/onboarding` after signup.
   - Cookie banner appears on the first visit.
   - `/audit` runs end-to-end against your own domain.
   - `/alerts` renders the seeded default rules.

---

## 3. Cron schedule

Defined in `vercel.json`. All times UTC.

| Path                             | Schedule       | Purpose                                          |
| -------------------------------- | -------------- | ------------------------------------------------ |
| `/api/cron/daily-rank-snapshot`  | `20 3 * * *`   | 03:20 daily — pull GSC rankings, write history   |
| `/api/cron/check-alerts`         | `30 4 * * *`   | 04:30 daily — evaluate alert rules, send emails  |
| `/api/cron/weekly-digest`        | `0 8 * * 1`    | Mondays 08:00 — weekly digest email per user     |
| `/api/cron/cleanup`              | `0 5 * * *`    | 05:00 daily — purge expired cache + 90-day data  |

The order is intentional: rank snapshot must run before check-alerts so today's
rankings are present when rules evaluate.

---

## 4. Daily quota caps

Defined in `lib/quota.ts`. Soft launch defaults (per user, per UTC day):

| Provider     | Count | Cost units |
| ------------ | ----- | ---------- |
| `dataforseo` | 30    | 1.5        |
| `anthropic`  | 50    | —          |
| `psi`        | 20    | —          |
| `ga4`        | 200   | —          |
| `gsc`        | 200   | —          |
| `trends`     | 100   | —          |

To raise a single user's cap, edit the row in `api_usage_quotas` for today.
To raise the global cap, edit `DAILY_CAPS` in `lib/quota.ts`.

`QUOTA_ENFORCE=false` (the default) means we count without blocking. Flip it
to `true` once we have real usage data and trust the limits.

---

## 5. GEO modes (real vs simulated)

`/api/geo` runs in one of three modes, decided at request time:

- **`live`** — `DFS_SERP_ENABLED=true` and DataForSEO creds set. Calls DFS's
  Live SERP API and inspects the `ai_overview` / `ai_summary` SERP element for
  real Google AI Overview citations.
- **`simulated`** — Anthropic key set, DFS not enabled. Asks Claude haiku to
  predict a likely AI answer. The UI labels this as a simulation; do not pass
  it off as live measurement.
- **`not_configured`** — neither path available; UI shows an empty state.

The response includes `mode` so the UI can render the correct label.

---

## 6. Email rendering notes

`lib/email.ts` is a thin Resend wrapper. Templates use inline styles only —
no external CSS, no images. Tested against Gmail, Apple Mail, and Outlook.com.

If a recipient bounces, Resend logs it; the `notifications.emailed_at` column
remains null and the cron will retry the next time the rule fires.

---

## 7. Privacy & compliance

- Cookie banner: `app/ui/cookie-banner.tsx`. Stores choice in `localStorage`
  under `aiml-consent-v1`. Necessary cookies always on; analytics + marketing
  toggleable.
- Privacy notice: `app/privacy/page.tsx` — ICO-recommended structure (controller,
  lawful basis, processors, retention, rights).
- Terms of service: `app/terms/page.tsx` — soft-launch period clause, AI output
  disclaimer, £100 liability cap, English law.

Data retention promises in the privacy notice are enforced by
`/api/cron/cleanup`:
- `cache_entries`: deleted when `expires_at < now()`
- `api_usage_quotas`: pruned older than 90 days
- `data_provider_logs`: pruned older than 90 days

---

## 8. Things still on the September list

These are intentionally deferred from the soft launch:

- Site audit history (currently we only show the latest)
- Schema generator + on-page schema validator
- Content brief generator
- Internal linking suggestions
- Sitemap monitoring
- Per-page on-page SEO scoring
- PDF export
- Stripe billing
- Admin dashboard (manual Supabase access only for now)
- Sentry / PostHog
- Mobile responsiveness pass
- Team invites / multi-project
- Fix marketing-page promises that don't yet match the product

---

## 9. When something breaks

| Symptom                                            | First thing to check                      |
| -------------------------------------------------- | ----------------------------------------- |
| Cron 401s in logs                                  | `CRON_SECRET` is set in Vercel env        |
| Cron 500s with "service role" error                | `SUPABASE_SERVICE_ROLE_KEY` is set        |
| Emails never arrive                                | Resend domain verified? `RESEND_API_KEY` set? |
| GEO returns "not_configured"                       | Neither `ANTHROPIC_API_KEY` nor DFS creds set |
| Daily snapshot runs but writes 0 rows              | User has tracked keywords + `gsc_site_url`?  |
| Audit fails with `psi 4xx`                         | `GOOGLE_PSI_API_KEY` quota or invalid     |

For everything else, check `data_provider_logs` for the failed call.
