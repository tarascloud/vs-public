import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import { routing, type Locale } from "./routing";

const messageImports = {
  en: () => import("../../messages/en.json"),
  uk: () => import("../../messages/uk.json"),
  es: () => import("../../messages/es.json"),
} as const;

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get("locale")?.value;

  const locale: Locale =
    cookieLocale && routing.locales.includes(cookieLocale as Locale)
      ? (cookieLocale as Locale)
      : routing.defaultLocale;

  let messages;
  try {
    messages = (await messageImports[locale]()).default;
  } catch {
    messages = (await messageImports[routing.defaultLocale]()).default;
  }

  return { locale, messages };
});
