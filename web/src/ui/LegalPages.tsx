import { useCopy } from '../lib/copy';

function SectionBlock({ title, lines }: { title: string; lines: string[] }) {
  return (
    <section className="mt-8">
      <h2 className="text-base font-extrabold">{title}</h2>
      {lines.map((line) => (
        <p key={line.slice(0, 48)} className="mt-2 text-sm leading-relaxed text-[var(--text-2)]">
          {line}
        </p>
      ))}
    </section>
  );
}

function sectionsFrom(record: Record<string, Record<string, string>>) {
  return Object.values(record).map((sec) => ({
    heading: sec.heading ?? '',
    lines: Object.entries(sec)
      .filter(([k, v]) => k !== 'heading' && typeof v === 'string')
      .map(([, v]) => v),
  }));
}

export function TermsPage() {
  const { termsPage } = useCopy();
  const sections = sectionsFrom(termsPage.sections as Record<string, Record<string, string>>);
  return (
    <article className="mx-auto max-w-3xl pb-8">
      <h1 className="text-2xl font-extrabold">{termsPage.title}</h1>
      <p className="mt-1 text-sm text-[var(--text-3)]">{termsPage.subtitle}</p>
      {sections.map((s) => (
        <SectionBlock key={s.heading} title={s.heading} lines={s.lines} />
      ))}
    </article>
  );
}

export function PrivacyPage() {
  const { privacyPolicyPage: privacyPage } = useCopy();
  const sections = sectionsFrom(privacyPage.sections as Record<string, Record<string, string>>);
  return (
    <article className="mx-auto max-w-3xl pb-8">
      <h1 className="text-2xl font-extrabold">{privacyPage.title}</h1>
      <p className="mt-1 text-sm text-[var(--text-3)]">{privacyPage.subtitle}</p>
      {sections.map((s) => (
        <SectionBlock key={s.heading} title={s.heading} lines={s.lines} />
      ))}
    </article>
  );
}
