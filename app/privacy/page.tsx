// app/privacy/page.tsx
// =============================================================================
// AI Marketing Lab — Privacy Notice (UK GDPR + DPA 2018)
// =============================================================================
// This is a baseline privacy notice for the soft-launch period. It is NOT a
// substitute for a legal review. Before the September full launch, this page
// must be reviewed by counsel covering:
//   * data controller identity (currently a sole trader)
//   * lawful basis per processing purpose
//   * international transfers (Anthropic, Google, Supabase, DataForSEO)
//   * retention schedule
//   * DPIA / record of processing activities (Art. 30)
// The structure below covers the headings the ICO recommends, with content
// that's accurate for what the app actually does today.
// =============================================================================

import { LegalShell } from "../ui/legal-shell";

export const metadata = {
  title:       "Privacy Notice — AI Marketing Lab",
  description: "How AI Marketing Lab collects, uses and protects personal data under UK GDPR.",
};

export default function PrivacyPage() {
  return (
    <LegalShell title="Privacy Notice" updated="5 May 2026">
      <p>
        This notice explains how <strong>AI Marketing Lab</strong> (&ldquo;we&rdquo;,
        &ldquo;us&rdquo;) collects and uses personal data when you use our application
        at <em>aimarketinglab.co.uk</em>. We are the data controller for the personal
        data described below. We process personal data in line with the UK General Data
        Protection Regulation (UK GDPR) and the Data Protection Act 2018.
      </p>

      <h2>1. Who we are</h2>
      <p>
        AI Marketing Lab is an early-stage SEO and AI-search analytics product. During
        the soft-launch period we operate as a sole trader based in the United Kingdom.
        For privacy queries, please contact us at{" "}
        <a href="mailto:privacy@aimarketinglab.co.uk">privacy@aimarketinglab.co.uk</a>.
      </p>

      <h2>2. What we collect</h2>
      <ul>
        <li>
          <strong>Account information.</strong> Email address, password (hashed by our
          auth provider), company name, your website URL, brand colour, profile photo
          (optional).
        </li>
        <li>
          <strong>Workspace settings.</strong> Google Search Console site URL and
          Google Analytics 4 property ID you connect to your account, list of
          competitors you add, AI strategies you generate, content drafts you save.
        </li>
        <li>
          <strong>Analytics data you authorise.</strong> When you connect Google
          Search Console or Google Analytics 4, we read aggregate metrics (clicks,
          impressions, sessions, page paths, query strings) on your behalf and display
          them in your dashboard. We do not store the underlying user-level data; we
          fetch it on demand via Google&rsquo;s APIs.
        </li>
        <li>
          <strong>Usage data.</strong> Server logs of API calls you make, with
          timestamps and counts, used to enforce daily quotas and prevent abuse.
        </li>
        <li>
          <strong>Cookies.</strong> Strictly necessary cookies for login and session.
          Optional cookies for analytics and marketing only with your consent &mdash;
          see our cookie banner.
        </li>
      </ul>

      <h2>3. Why we use it (lawful basis)</h2>
      <ul>
        <li>
          <strong>To deliver the service</strong> &mdash; performance of a contract
          (Art. 6(1)(b)). Provisioning your account, running searches, displaying your
          analytics, generating AI strategies you request.
        </li>
        <li>
          <strong>To keep the service safe</strong> &mdash; legitimate interests
          (Art. 6(1)(f)). Rate limiting, abuse detection, security logging.
        </li>
        <li>
          <strong>To send transactional emails</strong> &mdash; performance of a
          contract. Welcome emails, alerts you have configured (rank drops, etc.),
          weekly digest summaries.
        </li>
        <li>
          <strong>To send marketing emails</strong> &mdash; only with your separate
          consent. You can opt out at any time from any marketing email.
        </li>
        <li>
          <strong>To improve the product</strong> &mdash; legitimate interests, with
          analytics cookies set only after you consent.
        </li>
      </ul>

      <h2>4. Who we share it with</h2>
      <p>
        We use a small number of carefully chosen processors to run the service. They
        only process your data on our instructions and do not sell it.
      </p>
      <ul>
        <li><strong>Supabase</strong> &mdash; database hosting and authentication (EU region).</li>
        <li><strong>Vercel</strong> &mdash; application hosting (global edge network).</li>
        <li><strong>Anthropic</strong> &mdash; AI model used to generate strategies and
            content drafts you request. Your prompts and the generated outputs are sent
            to Anthropic. They do not train on your data under their commercial terms.</li>
        <li><strong>Google</strong> &mdash; Search Console and Analytics 4 APIs (only the
            properties you connect).</li>
        <li><strong>DataForSEO</strong> &mdash; keyword and SERP data provider. We send
            keywords and domains you query; we do not send personal data.</li>
        <li><strong>Resend</strong> &mdash; transactional email delivery.</li>
      </ul>
      <p>
        Some of these providers process data outside the UK. Where this happens we rely
        on the UK&rsquo;s adequacy regulations (for the EEA) or on the UK Addendum to
        the EU Standard Contractual Clauses.
      </p>

      <h2>5. How long we keep it</h2>
      <ul>
        <li>Account data: while your account is active, plus 30 days after deletion to allow restore.</li>
        <li>Server logs and quota counters: 90 days.</li>
        <li>AI strategies and content drafts: until you delete them or close your account.</li>
        <li>Email send logs: 12 months.</li>
      </ul>

      <h2>6. Your rights</h2>
      <p>
        Under UK GDPR you have the right to access your data, correct it, ask us to
        erase it, restrict or object to processing, and to data portability. You can
        exercise any of these rights by emailing{" "}
        <a href="mailto:privacy@aimarketinglab.co.uk">privacy@aimarketinglab.co.uk</a>.
      </p>
      <p>
        If you believe we have not handled your data correctly, you can complain to the{" "}
        <a href="https://ico.org.uk/" target="_blank" rel="noreferrer">
          Information Commissioner&rsquo;s Office (ICO)
        </a>
        .
      </p>

      <h2>7. Cookies</h2>
      <p>
        We use the following cookies:
      </p>
      <ul>
        <li><strong>Strictly necessary</strong> &mdash; Supabase auth session cookies. Required for login.</li>
        <li><strong>Preferences</strong> &mdash; theme mode and brand colour stored in localStorage.</li>
        <li><strong>Analytics &amp; marketing</strong> &mdash; only set if you opted in via the cookie banner.</li>
      </ul>
      <p>
        You can change your cookie choice at any time by clearing the
        <code> aiml-consent-v1 </code> entry in your browser&rsquo;s storage, or from the
        Settings &rarr; Privacy section in the app once we ship it.
      </p>

      <h2>8. Changes to this notice</h2>
      <p>
        We will post a notice in the app if we make material changes to this policy.
        The current version date is shown at the top of this page.
      </p>
    </LegalShell>
  );
}
