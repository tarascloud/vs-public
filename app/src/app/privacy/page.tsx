import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("privacy");
  return {
    title: `${t("hero_title")} — Vibe Studio`,
    description: t("hero_subtitle"),
    alternates: { canonical: "https://vibe-studio.example.com/privacy" },
  };
}

const EFFECTIVE_DATE = "April 10, 2026";
const VERSION = "1.0";

const linkClass =
  "text-accent underline-offset-4 decoration-accent/40 hover:decoration-accent underline";
const codeClass =
  "bg-accent/10 border border-accent/20 rounded px-1.5 text-accent text-[13px]";

type RichChunks = (chunks: React.ReactNode) => React.ReactNode;

const richShared: Record<string, RichChunks> = {
  email: () => (
    <a href="mailto:info@example.com" className={linkClass}>
      info@example.com
    </a>
  ),
  site: () => (
    <a href="https://vibe-studio.example.com" className={linkClass}>
      https://vibe-studio.example.com
    </a>
  ),
  cal: () => (
    <a href="https://cal.example.com" className={linkClass}>
      cal.example.com
    </a>
  ),
  code: (chunks) => <code className={codeClass}>{chunks}</code>,
  policy: (chunks) => (
    <a
      href="https://developers.google.com/terms/api-services-user-data-policy"
      target="_blank"
      rel="noopener noreferrer"
      className={linkClass}
    >
      {chunks}
    </a>
  ),
  perms: (chunks) => (
    <a
      href="https://myaccount.google.com/permissions"
      target="_blank"
      rel="noopener noreferrer"
      className={linkClass}
    >
      {chunks}
    </a>
  ),
};

export default async function PrivacyPolicyPage() {
  const t = await getTranslations("privacy");

  const TOC = [
    { id: "who-we-are", num: "1", label: t("s1_label") },
    { id: "what-data-we-collect", num: "2", label: t("s2_label") },
    { id: "google-user-data", num: "3", label: t("s3_label") },
    { id: "how-we-use-your-data", num: "4", label: t("s4_label") },
    { id: "how-we-store-and-protect", num: "5", label: t("s5_label") },
    { id: "data-retention", num: "6", label: t("s6_label") },
    { id: "your-rights", num: "7", label: t("s7_label") },
    { id: "revoking-google-access", num: "8", label: t("s8_label") },
    { id: "changes-to-this-policy", num: "9", label: t("s9_label") },
    { id: "contact", num: "10", label: t("s10_label") },
  ];

  const dataItems = [
    { label: t("s2_account_label"), body: t("s2_account_body"), rich: false },
    { label: t("s2_calendar_label"), bodyKey: "s2_calendar_body", rich: true },
    { label: t("s2_usage_label"), body: t("s2_usage_body"), rich: false },
    { label: t("s2_content_label"), body: t("s2_content_body"), rich: false },
  ];

  const useItems = ["s4_item1", "s4_item2", "s4_item3", "s4_item4"];

  return (
    <main className="min-h-screen pt-24 pb-20 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">

        <nav className="text-sm text-muted mb-10">
          <Link href="/" className="hover:text-foreground transition-colors inline-flex items-center gap-1.5">
            <span aria-hidden="true">←</span> {t("back_home")}
          </Link>
        </nav>

        <section className="text-center mb-14">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-card-border text-sm text-muted mb-6">
            <span className="w-2 h-2 rounded-full bg-accent" aria-hidden="true" />
            Vibe Studio
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
            {t("hero_title")}
          </h1>
          <p className="text-lg text-muted max-w-xl mx-auto mb-6">
            {t("hero_subtitle")}
          </p>
          <span className="inline-block text-xs px-3 py-1 rounded-full bg-accent/10 border border-accent/20 text-accent font-medium">
            {t("hero_effective", { date: EFFECTIVE_DATE })}
          </span>
        </section>

        <details className="lg:hidden mb-8 bg-card-bg border border-card-border rounded-xl overflow-hidden">
          <summary className="px-5 py-4 text-sm font-medium text-foreground cursor-pointer select-none flex items-center justify-between">
            <span>{t("toc_mobile_label")}</span>
            <span className="text-muted text-xs">{t("toc_mobile_sections", { count: TOC.length })}</span>
          </summary>
          <nav className="px-5 pb-4 border-t border-card-border pt-3 space-y-1">
            {TOC.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className="flex items-center gap-2.5 py-1 text-sm text-muted hover:text-foreground transition-colors"
              >
                <span className="w-5 h-5 rounded-full bg-accent/10 border border-accent/20 text-accent text-[10px] font-bold flex items-center justify-center shrink-0">
                  {item.num}
                </span>
                {item.label}
              </a>
            ))}
          </nav>
        </details>

        <div className="lg:grid lg:grid-cols-[1fr_3fr] lg:gap-10 items-start">

          <aside className="hidden lg:block sticky top-28">
            <div className="bg-card-bg border border-card-border rounded-xl p-5">
              <p className="text-xs uppercase tracking-wider text-muted/60 mb-4 font-medium">{t("toc_contents")}</p>
              <nav className="space-y-1">
                {TOC.map((item) => (
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    className="flex items-center gap-2.5 py-1.5 text-sm text-muted hover:text-foreground transition-colors group"
                  >
                    <span className="w-5 h-5 rounded-full bg-accent/10 border border-accent/20 text-accent text-[10px] font-bold flex items-center justify-center shrink-0 group-hover:bg-accent/20 transition-colors">
                      {item.num}
                    </span>
                    {item.label}
                  </a>
                ))}
              </nav>
            </div>
          </aside>

          <div className="bg-card-bg border border-card-border rounded-xl p-6 sm:p-10 text-[15px] leading-relaxed">

            <article id="who-we-are" className="pt-2">
              <div className="flex items-center gap-3 mb-4">
                <span className="w-7 h-7 rounded-full bg-accent/10 border border-accent/20 text-accent text-xs font-bold flex items-center justify-center shrink-0">1</span>
                <h2 className="text-2xl font-semibold">{t("s1_title")}</h2>
              </div>
              <p>{t.rich("s1_body", richShared)}</p>
            </article>

            <article id="what-data-we-collect" className="pt-10 mt-10 border-t border-card-border">
              <div className="flex items-center gap-3 mb-4">
                <span className="w-7 h-7 rounded-full bg-accent/10 border border-accent/20 text-accent text-xs font-bold flex items-center justify-center shrink-0">2</span>
                <h2 className="text-2xl font-semibold">{t("s2_title")}</h2>
              </div>
              <p className="mb-3">{t("s2_intro")}</p>
              <ul className="space-y-2.5 pl-0">
                {dataItems.map((item, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-accent shrink-0" aria-hidden="true" />
                    <span>
                      <strong>{item.label}</strong>
                      {item.rich ? (
                        <> — {t.rich("s2_calendar_body", richShared)}</>
                      ) : (
                        <> — {item.body}</>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </article>

            <article id="google-user-data" className="pt-10 mt-10 border-t border-card-border">
              <div className="flex items-center gap-3 mb-4">
                <span className="w-7 h-7 rounded-full bg-accent/10 border border-accent/20 text-accent text-xs font-bold flex items-center justify-center shrink-0">3</span>
                <h2 className="text-2xl font-semibold">{t("s3_title")}</h2>
              </div>
              <p className="mb-4">{t.rich("s3_body1", richShared)}</p>
              <p>{t.rich("s3_body2", richShared)}</p>
            </article>

            <article id="how-we-use-your-data" className="pt-10 mt-10 border-t border-card-border">
              <div className="flex items-center gap-3 mb-4">
                <span className="w-7 h-7 rounded-full bg-accent/10 border border-accent/20 text-accent text-xs font-bold flex items-center justify-center shrink-0">4</span>
                <h2 className="text-2xl font-semibold">{t("s4_title")}</h2>
              </div>
              <ul className="space-y-2.5 mb-4 pl-0">
                {useItems.map((key) => (
                  <li key={key} className="flex items-start gap-2.5">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-accent shrink-0" aria-hidden="true" />
                    <span>{t(key)}</span>
                  </li>
                ))}
              </ul>
              <p>{t("s4_outro")}</p>
            </article>

            <article id="how-we-store-and-protect" className="pt-10 mt-10 border-t border-card-border">
              <div className="flex items-center gap-3 mb-4">
                <span className="w-7 h-7 rounded-full bg-accent/10 border border-accent/20 text-accent text-xs font-bold flex items-center justify-center shrink-0">5</span>
                <h2 className="text-2xl font-semibold">{t("s5_title")}</h2>
              </div>
              <p>{t("s5_body")}</p>
            </article>

            <article id="data-retention" className="pt-10 mt-10 border-t border-card-border">
              <div className="flex items-center gap-3 mb-4">
                <span className="w-7 h-7 rounded-full bg-accent/10 border border-accent/20 text-accent text-xs font-bold flex items-center justify-center shrink-0">6</span>
                <h2 className="text-2xl font-semibold">{t("s6_title")}</h2>
              </div>
              <p>{t.rich("s6_body", richShared)}</p>
            </article>

            <article id="your-rights" className="pt-10 mt-10 border-t border-card-border">
              <div className="flex items-center gap-3 mb-4">
                <span className="w-7 h-7 rounded-full bg-accent/10 border border-accent/20 text-accent text-xs font-bold flex items-center justify-center shrink-0">7</span>
                <h2 className="text-2xl font-semibold">{t("s7_title")}</h2>
              </div>
              <p>{t.rich("s7_body", richShared)}</p>
            </article>

            <article id="revoking-google-access" className="pt-10 mt-10 border-t border-card-border">
              <div className="flex items-center gap-3 mb-4">
                <span className="w-7 h-7 rounded-full bg-accent/10 border border-accent/20 text-accent text-xs font-bold flex items-center justify-center shrink-0">8</span>
                <h2 className="text-2xl font-semibold">{t("s8_title")}</h2>
              </div>
              <p>{t.rich("s8_body", richShared)}</p>
            </article>

            <article id="changes-to-this-policy" className="pt-10 mt-10 border-t border-card-border">
              <div className="flex items-center gap-3 mb-4">
                <span className="w-7 h-7 rounded-full bg-accent/10 border border-accent/20 text-accent text-xs font-bold flex items-center justify-center shrink-0">9</span>
                <h2 className="text-2xl font-semibold">{t("s9_title")}</h2>
              </div>
              <p>{t.rich("s9_body", richShared)}</p>
            </article>

            <article id="contact" className="pt-10 mt-10 border-t border-card-border">
              <div className="flex items-center gap-3 mb-4">
                <span className="w-7 h-7 rounded-full bg-accent/10 border border-accent/20 text-accent text-xs font-bold flex items-center justify-center shrink-0">10</span>
                <h2 className="text-2xl font-semibold">{t("s10_title")}</h2>
              </div>
              <p>{t.rich("s10_body", richShared)}</p>
            </article>

            <div className="mt-12 pt-8 border-t border-card-border grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-muted/60 uppercase tracking-wider mb-1">{t("meta_version_label")}</p>
                <p className="text-sm text-foreground-secondary">{VERSION}</p>
              </div>
              <div>
                <p className="text-xs text-muted/60 uppercase tracking-wider mb-1">{t("meta_updated_label")}</p>
                <p className="text-sm text-foreground-secondary">{EFFECTIVE_DATE}</p>
              </div>
              <div>
                <p className="text-xs text-muted/60 uppercase tracking-wider mb-1">{t("meta_law_label")}</p>
                <p className="text-sm text-foreground-secondary">{t("meta_law_value")}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-12">
          <p className="text-xs uppercase tracking-wider text-muted/60 mb-4 font-medium">{t("related_label")}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-card-bg border border-card-border rounded-xl p-5 opacity-40 cursor-default select-none">
              <p className="text-xs text-muted/60 uppercase tracking-wider mb-1">{t("related_current")}</p>
              <p className="font-semibold">{t("related_privacy_name")}</p>
              <p className="text-sm text-muted mt-1">{t("related_privacy_desc")}</p>
            </div>
            <Link
              href="/terms"
              className="bg-card-bg border border-card-border rounded-xl p-5 hover:border-accent/50 hover:shadow-xl hover:shadow-accent/5 transition-all group"
            >
              <p className="text-xs text-accent/60 uppercase tracking-wider mb-1">{t("related_read_also")}</p>
              <p className="font-semibold group-hover:text-accent transition-colors">{t("related_terms_name")}</p>
              <p className="text-sm text-muted mt-1">{t("related_terms_desc")}</p>
            </Link>
          </div>
        </div>

      </div>
    </main>
  );
}
