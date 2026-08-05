import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import "./globals.css";
import { NavBar } from "./components/nav-bar";
import { Providers } from "./components/providers";
import { Analytics } from "./components/analytics";
import { Toaster } from "@/components/ui/toast";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "cyrillic"],
});

export const metadata: Metadata = {
  title: "Vibe Studio — AI-Powered Virtual Office",
  description:
    "Your AI-powered virtual office. Manage projects with 11 specialized AI agents, Kanban boards, real-time dashboards, and automated daily progress videos.",
  keywords: [
    "AI virtual office",
    "AI agents",
    "project management",
    "Kanban board",
    "automated software delivery",
    "AI team",
    "building in public",
    "Vibe Studio",
    "developer productivity",
    "AI-powered dashboard",
  ],
  metadataBase: new URL("https://vibe-studio.example.com"),
  alternates: {
    canonical: "https://vibe-studio.example.com",
    languages: {
      "en": "https://vibe-studio.example.com",
      "x-default": "https://vibe-studio.example.com",
    },
  },
  applicationName: "Vibe Studio",
  appleWebApp: {
    capable: true,
    title: "VS",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  openGraph: {
    title: "Vibe Studio — AI-Powered Virtual Office",
    description:
      "Manage projects with 11 specialized AI agents. Kanban boards, real-time dashboards, automated progress videos.",
    url: "https://vibe-studio.example.com",
    siteName: "Vibe Studio",
    locale: "en_US",
    type: "website",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Vibe Studio — AI-Powered Virtual Office",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@taaboroda",
    creator: "@taaboroda",
    title: "Vibe Studio — AI-Powered Virtual Office",
    description:
      "Manage projects with 11 specialized AI agents. Kanban boards, real-time dashboards, automated progress videos.",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

/**
 * HTML-weight фікс: NextIntlClientProvider серіалізує messages у RSC flight
 * payload (~38KB inline <script> на кожній сторінці). Клієнту шлемо лише
 * namespaces, які реально використовують "use client" компоненти
 * (перевірено: grep useTranslations по файлах з "use client").
 * Server-only namespaces (landing, portfolio, timeline, projects, privacy,
 * terms) рендеряться через getTranslations() на сервері — клієнту не потрібні.
 *
 * УВАГА: якщо монтуєш WaitlistForm (components/waitlist-form.tsx — наразі
 * ніде не імпортується) — додай "landing" у цей список.
 */
const CLIENT_MESSAGE_NAMESPACES = [
  "nav",
  "studio",
  "agents",
  "admin",
  "client",
  "smm",
  "communication",
] as const;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();
  const clientMessages = Object.fromEntries(
    CLIENT_MESSAGE_NAMESPACES.filter((ns) => ns in messages).map((ns) => [
      ns,
      messages[ns],
    ])
  );

  return (
    <html lang={locale} className={`${inter.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <Analytics />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{__html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            "name": "Vibe Studio",
            "applicationCategory": "BusinessApplication",
            "operatingSystem": "Web",
            "description": "AI-powered virtual office. Manage projects with 11 specialized AI agents, Kanban boards, real-time dashboards, and automated daily progress videos.",
            "url": "https://vibe-studio.example.com",
            "image": "https://vibe-studio.example.com/og-image.png",
            "author": { "@type": "Person", "name": "Your Name", "url": "https://example.com" },
            "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
            "featureList": [
              "11 specialized AI agents",
              "Kanban board project management",
              "Real-time dashboards",
              "Automated daily progress videos",
              "Initiative and task tracking",
              "Building in public timeline"
            ]
          }).replace(/</g, "\\u003c")}}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{__html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Organization",
            "name": "Vibe Studio",
            "url": "https://vibe-studio.example.com",
            "logo": "https://vibe-studio.example.com/logo.svg",
            "founder": { "@type": "Person", "name": "Your Name", "url": "https://example.com" }
          }).replace(/</g, "\\u003c")}}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{__html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebSite",
            "name": "Vibe Studio",
            "url": "https://vibe-studio.example.com",
            "potentialAction": {
              "@type": "SearchAction",
              "target": "https://vibe-studio.example.com/studio?q={search_term_string}",
              "query-input": "required name=search_term_string"
            }
          }).replace(/</g, "\\u003c")}}
        />
      </head>
      <body className="min-h-full flex flex-col font-sans">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded-md focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white focus:outline-none"
        >
          Skip to content
        </a>
        <NextIntlClientProvider messages={clientMessages}>
          <Providers>
            <NavBar />
            <main id="main-content">{children}</main>
            <Toaster />
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
