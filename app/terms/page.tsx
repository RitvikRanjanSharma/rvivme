// app/terms/page.tsx
// =============================================================================
// AI Marketing Lab — Terms of Service
// =============================================================================
// Soft-launch terms for the free testing period. These cover the basics
// (acceptable use, no warranty, limitation of liability, governing law) and
// MUST be reviewed by counsel before the September full launch, especially
// the indemnity, liability cap, and AI-output disclaimer language.
// =============================================================================

import { LegalShell } from "../ui/legal-shell";

export const metadata = {
  title:       "Terms of Service — AI Marketing Lab",
  description: "Terms of Service for AI Marketing Lab during the soft-launch period.",
};

export default function TermsPage() {
  return (
    <LegalShell title="Terms of Service" updated="5 May 2026">
      <p>
        These terms govern your use of <strong>AI Marketing Lab</strong>
        (&ldquo;the Service&rdquo;). By creating an account, you agree to them.
        We are based in the United Kingdom; English law applies and the courts
        of England and Wales have exclusive jurisdiction over any dispute.
      </p>

      <h2>1. Soft-launch period</h2>
      <p>
        Until the public launch in September 2026, the Service is offered free of
        charge for testing and feedback purposes. Features may change, be removed,
        or be temporarily unavailable. We will give reasonable notice before
        introducing fees.
      </p>

      <h2>2. Your account</h2>
      <ul>
        <li>You must be at least 18 years old and using the Service for a business purpose.</li>
        <li>You&rsquo;re responsible for keeping your login credentials secure.</li>
        <li>You may close your account at any time. We can suspend or close accounts that breach these terms or that pose a security risk.</li>
      </ul>

      <h2>3. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>use the Service to violate any law or third-party rights;</li>
        <li>scrape, reverse-engineer, or attempt to disrupt the Service;</li>
        <li>use the Service to send spam, phishing, or malware;</li>
        <li>resell or sublicense access without written permission.</li>
      </ul>

      <h2>4. Connected services</h2>
      <p>
        The Service integrates with third-party platforms you choose to connect
        (Google Search Console, Google Analytics 4, and others). You authorise us
        to access those accounts only as needed to provide the features you use.
        We do not warrant the availability or accuracy of those third-party services.
      </p>

      <h2>5. AI-generated content</h2>
      <p>
        Some features generate text using large language models (e.g. SEO strategies,
        content drafts). AI output can be inaccurate, biased, or out of date. You are
        responsible for reviewing every AI output before using or publishing it. We
        do not warrant that AI content is fit for any particular purpose, free of
        infringement, or accurate.
      </p>

      <h2>6. Your data and content</h2>
      <p>
        You retain all rights to the data and content you upload or generate. You
        grant us a non-exclusive licence to host and process it as necessary to run
        the Service. We will not use your content to train AI models. See our{" "}
        <a href="/privacy">Privacy Notice</a> for how we handle personal data.
      </p>

      <h2>7. Service quotas and limits</h2>
      <p>
        We apply per-user daily quotas to expensive integrations (e.g. keyword data
        providers, AI generation) so that the free service remains available to all
        users. We may change quotas with reasonable notice.
      </p>

      <h2>8. Warranties</h2>
      <p>
        During the soft-launch period the Service is provided &ldquo;as is&rdquo;.
        To the fullest extent permitted by law, we exclude all implied warranties
        including those of satisfactory quality, fitness for a particular purpose,
        and non-infringement. Nothing in these terms limits or excludes liability
        for death or personal injury caused by negligence, fraud, or any other
        liability that cannot be limited under English law.
      </p>

      <h2>9. Limitation of liability</h2>
      <p>
        Subject to clause 8, our total aggregate liability arising out of or in
        connection with the Service is limited to &pound;100. We are not liable for
        indirect or consequential losses, loss of profits, loss of revenue, loss of
        anticipated savings, or loss of data. You agree the Service is not a
        substitute for professional SEO or legal advice.
      </p>

      <h2>10. Changes to these terms</h2>
      <p>
        We may update these terms from time to time. Material changes will be
        announced in the app or by email. Continued use after a change means you
        accept the new terms.
      </p>

      <h2>11. Contact</h2>
      <p>
        Questions about these terms? Email{" "}
        <a href="mailto:hello@aimarketinglab.co.uk">hello@aimarketinglab.co.uk</a>.
      </p>
    </LegalShell>
  );
}
