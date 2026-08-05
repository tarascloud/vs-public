"use client";

import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";

const LANGUAGES = [
  { code: "en", label: "EN" },
  { code: "uk", label: "UA" },
  { code: "es", label: "ES" },
] as const;

export function LanguageSelector() {
  const locale = useLocale();
  const router = useRouter();

  const handleChange = async (newLocale: string) => {
    document.cookie = `locale=${newLocale};path=/;max-age=31536000;samesite=lax`;
    router.refresh();
  };

  return (
    <div className="inline-flex rounded-lg border border-card-border overflow-hidden">
      {LANGUAGES.map((lang) => (
        <button
          key={lang.code}
          onClick={() => handleChange(lang.code)}
          className={`px-3 py-1.5 min-h-[44px] text-xs font-medium transition-colors ${
            locale === lang.code
              ? "bg-accent text-white"
              : "text-muted hover:text-foreground hover:bg-card-bg"
          }`}
        >
          {lang.label}
        </button>
      ))}
    </div>
  );
}
