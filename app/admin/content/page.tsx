// app/admin/content/page.tsx
// ============================================================================
// Editable page copy.
//
// The registry below is the list of strings that have been wired up in the
// code. It is explicit rather than discovered because a block only exists once
// its call site passes the key — listing a key here that no page reads would be
// an editor for text that never appears anywhere, which is worse than not
// offering it.
//
// Adding a block is two steps: wrap the string at its call site with
// t("some.key", "the current text"), and add the key here.
// ============================================================================

import { getContentBlocks } from "@/lib/site-content";
import { saveContentBlock } from "../actions";
import { AdminForm, Field, Card } from "../ui";
import { HEADLINE_DEFAULT } from "@/app/home-view";

export const dynamic = "force-dynamic";

type BlockSpec = {
  key: string; label: string; fallback: string; hint?: string; long?: boolean;
};

const GROUPS: { group: string; blocks: BlockSpec[] }[] = [
  {
    group: "Homepage hero",
    blocks: [
      {
        key: "home.hero.headline",
        label: "Headline",
        fallback: HEADLINE_DEFAULT,
        hint: "Also drives the particle animation, so the two can never disagree. The shipped wording has a hand-tuned line break; anything else is wrapped automatically into four lines.",
      },
      {
        key: "home.hero.subheadline",
        label: "Sub-headline",
        fallback: "GA4 and Search Console unified. AI forecasts on your real traffic. Answer-engine visibility before anyone else notices.",
        long: true,
      },
      { key: "home.hero.cta_primary",   label: "Primary button",   fallback: "Open platform" },
      { key: "home.hero.cta_secondary", label: "Secondary button", fallback: "Read intelligence" },
    ],
  },
];

export default async function AdminContent() {
  const blocks = await getContentBlocks();

  return (
    <div>
      <p style={{
        fontFamily: "var(--font-body)", fontSize: "13px",
        color: "var(--text-reading)", lineHeight: 1.7, margin: "0 0 18px",
      }}>
        Clearing a field restores the text that ships with the site — it will
        never leave a blank space on the page. The shipped wording is shown as
        the placeholder.
      </p>

      {GROUPS.map(({ group, blocks: specs }) => (
        <Card key={group} title={group}>
          {specs.map(spec => (
            <div key={spec.key} style={{ marginBottom: "18px" }}>
              <AdminForm action={saveContentBlock}>
                <input type="hidden" name="key" value={spec.key} />
                <Field
                  label={spec.label}
                  name="value"
                  textarea={spec.long}
                  rows={spec.long ? 3 : undefined}
                  defaultValue={blocks[spec.key] ?? ""}
                  placeholder={spec.fallback}
                  hint={spec.hint}
                />
              </AdminForm>
            </div>
          ))}
        </Card>
      ))}

      <Card
        title="Adding more"
        description="Only strings wired up in the code appear here. To make another piece of copy editable, wrap it at its call site and add its key to the registry in this file — both steps are needed, because a key with no call site is an editor for text that never renders."
      >
        <span />
      </Card>
    </div>
  );
}
