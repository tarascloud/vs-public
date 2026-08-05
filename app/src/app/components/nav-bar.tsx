"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useSession, signIn, signOut } from "next-auth/react";
import { useTranslations } from "next-intl";
import { useState, useEffect, useRef, useCallback } from "react";
import { LanguageSelector } from "./language-selector";
import { ThemeToggle } from "./theme-toggle";

export function NavBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const t = useTranslations("nav");
  const [adminOpen, setAdminOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userRole, setUserRole] = useState<string>("CLIENT");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const tabScrollRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef<HTMLAnchorElement>(null);

  // Fetch user role
  useEffect(() => {
    async function fetchRole() {
      try {
        const res = await fetch("/api/auth/session");
        const data = await res.json();
        if (data?.user?.role) {
          setUserRole(data.user.role);
        }
      } catch {
        // ignore
      }
    }
    if (session?.user) fetchRole();
  }, [session]);

  // Close admin dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setAdminOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Scroll active tab pill into view on mobile tab bar
  const scrollActiveTabIntoView = useCallback(() => {
    if (activeTabRef.current && tabScrollRef.current) {
      const container = tabScrollRef.current;
      const el = activeTabRef.current;
      const elLeft = el.offsetLeft;
      const elWidth = el.offsetWidth;
      const containerWidth = container.offsetWidth;
      const scrollTarget = elLeft - containerWidth / 2 + elWidth / 2;
      container.scrollTo({ left: scrollTarget, behavior: "smooth" });
    }
  }, []);

  // Close mobile drawer on route change — track previous pathname
  const prevPathnameRef = useRef(pathname);
  const prevSearchRef = useRef(searchParams.toString());
  useEffect(() => {
    const currentSearch = searchParams.toString();
    if (prevPathnameRef.current !== pathname || prevSearchRef.current !== currentSearch) {
      prevPathnameRef.current = pathname;
      prevSearchRef.current = currentSearch;
      // Use startTransition to avoid sync setState in effect
      setTimeout(() => setMobileOpen(false), 0);
    }
  });

  // Scroll active studio tab into view when tab changes on mobile
  useEffect(() => {
    if (pathname === "/studio") {
      // Small delay to let DOM render
      setTimeout(scrollActiveTabIntoView, 50);
    }
  }, [pathname, searchParams, scrollActiveTabIntoView]);

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  // Landing page has its own navigation
  if (pathname === "/") return null;

  const isOwner = userRole === "OWNER";
  const currentTab = searchParams.get("tab") || "ideas";

  const isIdeasActive = pathname === "/studio" && currentTab === "ideas";
  const isBoardActive = pathname === "/studio" && currentTab === "board";
  const isOfficeActive = pathname === "/studio" && currentTab === "office";
  const isControlsActive = pathname === "/studio" && currentTab === "controls";
  const isCommunicationActive = pathname === "/studio" && currentTab === "communication";
  const isSmmActive = pathname === "/studio" && currentTab === "smm";
  const isMempalaceActive = pathname === "/studio" && currentTab === "mempalace";
  const isAdminActive = pathname.startsWith("/admin");

  return (
    <>
      <nav
        className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-card-border max-w-[100vw]"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link href={session ? "/studio" : "/"} className="flex items-center gap-2 shrink-0">
            <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center text-white font-bold text-sm">
              VS
            </div>
            <span className="font-semibold text-base hidden sm:inline">Vibe Studio</span>
          </Link>

          {/* Desktop nav (md+) */}
          <div className="hidden md:flex items-center gap-6 text-sm">
            {/* Ideas */}
            <Link
              href="/studio?tab=ideas"
              className={`transition-colors py-1 ${
                isIdeasActive
                  ? "text-accent font-medium"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {t("ideas")}
            </Link>

            {/* Board */}
            <Link
              href="/studio?tab=board"
              className={`transition-colors py-1 ${
                isBoardActive
                  ? "text-accent font-medium"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {t("board")}
            </Link>

            {/* Office */}
            <Link
              href="/studio?tab=office"
              className={`transition-colors py-1 ${
                isOfficeActive
                  ? "text-accent font-medium"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {t("office")}
            </Link>

            {/* Controls (OWNER only) */}
            {isOwner && (
              <Link
                href="/studio?tab=controls"
                className={`transition-colors py-1 ${
                  isControlsActive
                    ? "text-accent font-medium"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {t("controls")}
              </Link>
            )}

            {/* Communication (OWNER only) */}
            {isOwner && (
              <Link
                href="/studio?tab=communication"
                className={`transition-colors py-1 ${
                  isCommunicationActive
                    ? "text-accent font-medium"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {t("communication")}
              </Link>
            )}

            {/* SMM (OWNER only) */}
            {isOwner && (
              <Link
                href="/studio?tab=smm"
                className={`transition-colors py-1 ${
                  isSmmActive
                    ? "text-accent font-medium"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {t("smm")}
              </Link>
            )}

            {/* MemPalace (OWNER only) */}
            {isOwner && (
              <Link
                href="/studio?tab=mempalace"
                className={`transition-colors py-1 ${
                  isMempalaceActive
                    ? "text-accent font-medium"
                    : "text-muted hover:text-foreground"
                }`}
              >
                MemPalace
              </Link>
            )}

            {/* Admin dropdown - OWNER only */}
            {isOwner && (
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setAdminOpen(!adminOpen)}
                  className={`flex items-center gap-1 transition-colors ${
                    isAdminActive
                      ? "text-accent font-medium"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  {t("admin")}
                  <svg
                    className={`w-3.5 h-3.5 transition-transform ${adminOpen ? "rotate-180" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {adminOpen && (
                  <div className="absolute top-full right-0 mt-2 w-48 bg-card-bg border border-card-border rounded-lg shadow-lg overflow-hidden z-50">
                    <Link
                      href="/admin/agents"
                      onClick={() => setAdminOpen(false)}
                      className={`block px-4 py-2.5 text-sm transition-colors ${
                        pathname === "/admin/agents"
                          ? "text-accent bg-accent/10"
                          : "text-muted hover:text-foreground hover:bg-card-border/30"
                      }`}
                    >
                      {t("agents")}
                    </Link>
                    <Link
                      href="/admin/clients"
                      onClick={() => setAdminOpen(false)}
                      className={`block px-4 py-2.5 text-sm transition-colors ${
                        pathname === "/admin/clients"
                          ? "text-accent bg-accent/10"
                          : "text-muted hover:text-foreground hover:bg-card-border/30"
                      }`}
                    >
                      {t("clients")}
                    </Link>
                    <Link
                      href="/admin/projects"
                      onClick={() => setAdminOpen(false)}
                      className={`block px-4 py-2.5 text-sm transition-colors ${
                        pathname === "/admin/projects"
                          ? "text-accent bg-accent/10"
                          : "text-muted hover:text-foreground hover:bg-card-border/30"
                      }`}
                    >
                      {t("projects")}
                    </Link>
                    <Link
                      href="/admin/office-editor"
                      onClick={() => setAdminOpen(false)}
                      className={`block px-4 py-2.5 text-sm transition-colors ${
                        pathname === "/admin/office-editor"
                          ? "text-accent bg-accent/10"
                          : "text-muted hover:text-foreground hover:bg-card-border/30"
                      }`}
                    >
                      {t("officeEditor")}
                    </Link>
                  </div>
                )}
              </div>
            )}

            {/* Theme toggle */}
            <ThemeToggle />

            {/* Language selector */}
            <LanguageSelector />

            {/* Auth */}
            {status === "loading" ? (
              <div className="w-8 h-8 rounded-full bg-card-border animate-pulse" />
            ) : session?.user ? (
              <div className="flex items-center gap-3">
                {session.user.image && (
                  <img
                    src={session.user.image}
                    alt=""
                    className="w-8 h-8 rounded-full border border-card-border"
                  />
                )}
                <span className="text-muted hidden lg:inline">{session.user.name}</span>
                <button
                  onClick={() => signOut()}
                  className="text-muted hover:text-foreground transition-colors"
                >
                  {t("sign_out")}
                </button>
              </div>
            ) : (
              <button
                onClick={() => signIn(undefined, { callbackUrl: "/studio" })}
                className="bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-lg transition-colors"
              >
                {t("sign_in")}
              </button>
            )}
          </div>

          {/* Mobile right side: avatar + hamburger */}
          <div className="flex md:hidden items-center gap-3">
            {session?.user?.image && (
              <img
                src={session.user.image}
                alt=""
                className="w-8 h-8 rounded-full border border-card-border"
              />
            )}
            <button
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation menu"
              className="w-11 h-11 flex items-center justify-center rounded-lg text-muted hover:text-foreground hover:bg-card-bg transition-colors"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile studio tab bar — horizontal scroll pills, only on /studio, only on mobile */}
      {pathname === "/studio" && (
        <div className="fixed top-16 left-0 right-0 z-40 md:hidden bg-background/80 backdrop-blur-md border-b border-card-border overflow-hidden">
          <div
            ref={tabScrollRef}
            className="flex items-center gap-2 px-4 py-2 overflow-x-auto no-scrollbar snap-x snap-mandatory"
          >
            <Link
              ref={currentTab === "ideas" ? activeTabRef : null}
              href="/studio?tab=ideas"
              className={`snap-start shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
                isIdeasActive
                  ? "bg-accent text-white"
                  : "bg-card-bg border border-card-border text-muted hover:text-foreground"
              }`}
            >
              {t("ideas")}
            </Link>
            <Link
              ref={currentTab === "board" ? activeTabRef : null}
              href="/studio?tab=board"
              className={`snap-start shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
                isBoardActive
                  ? "bg-accent text-white"
                  : "bg-card-bg border border-card-border text-muted hover:text-foreground"
              }`}
            >
              {t("board")}
            </Link>
            <Link
              ref={currentTab === "office" ? activeTabRef : null}
              href="/studio?tab=office"
              className={`snap-start shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
                isOfficeActive
                  ? "bg-accent text-white"
                  : "bg-card-bg border border-card-border text-muted hover:text-foreground"
              }`}
            >
              {t("office")}
            </Link>
            {isOwner && (
              <Link
                ref={currentTab === "controls" ? activeTabRef : null}
                href="/studio?tab=controls"
                className={`snap-start shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
                  isControlsActive
                    ? "bg-accent text-white"
                    : "bg-card-bg border border-card-border text-muted hover:text-foreground"
                }`}
              >
                {t("controls")}
              </Link>
            )}
            {isOwner && (
              <Link
                ref={currentTab === "communication" ? activeTabRef : null}
                href="/studio?tab=communication"
                className={`snap-start shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
                  isCommunicationActive
                    ? "bg-accent text-white"
                    : "bg-card-bg border border-card-border text-muted hover:text-foreground"
                }`}
              >
                {t("communication")}
              </Link>
            )}
            {isOwner && (
              <Link
                ref={currentTab === "smm" ? activeTabRef : null}
                href="/studio?tab=smm"
                className={`snap-start shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
                  isSmmActive
                    ? "bg-accent text-white"
                    : "bg-card-bg border border-card-border text-muted hover:text-foreground"
                }`}
              >
                {t("smm")}
              </Link>
            )}
            {isOwner && (
              <Link
                ref={currentTab === "mempalace" ? activeTabRef : null}
                href="/studio?tab=mempalace"
                className={`snap-start shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
                  isMempalaceActive
                    ? "bg-accent text-white"
                    : "bg-card-bg border border-card-border text-muted hover:text-foreground"
                }`}
              >
                MemPalace
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Mobile drawer backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-50 md:hidden"
          aria-modal="true"
          role="dialog"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />

          {/* Slide-in panel from right */}
          <div
            className="absolute right-0 top-0 bottom-0 w-72 bg-card-bg border-l border-card-border flex flex-col overflow-y-auto"
            style={{ paddingTop: "env(safe-area-inset-top)" }}
          >
            {/* Drawer header */}
            <div className="h-16 flex items-center justify-between px-4 border-b border-card-border shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center text-white font-bold text-sm">
                  VS
                </div>
                <span className="font-semibold text-base">Vibe Studio</span>
              </div>
              <button
                onClick={() => setMobileOpen(false)}
                aria-label="Close navigation menu"
                className="w-11 h-11 flex items-center justify-center rounded-lg text-muted hover:text-foreground hover:bg-card-border/30 transition-colors"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Nav links */}
            <nav className="flex-1 px-4 py-4 flex flex-col gap-1">
              <Link
                href="/studio?tab=ideas"
                className={`flex items-center min-h-[44px] px-3 rounded-lg text-sm font-medium transition-colors ${
                  isIdeasActive
                    ? "text-accent bg-accent/10"
                    : "text-muted hover:text-foreground hover:bg-card-border/30"
                }`}
              >
                {t("ideas")}
              </Link>

              <Link
                href="/studio?tab=board"
                className={`flex items-center min-h-[44px] px-3 rounded-lg text-sm font-medium transition-colors ${
                  isBoardActive
                    ? "text-accent bg-accent/10"
                    : "text-muted hover:text-foreground hover:bg-card-border/30"
                }`}
              >
                {t("board")}
              </Link>

              <Link
                href="/studio?tab=office"
                className={`flex items-center min-h-[44px] px-3 rounded-lg text-sm font-medium transition-colors ${
                  isOfficeActive
                    ? "text-accent bg-accent/10"
                    : "text-muted hover:text-foreground hover:bg-card-border/30"
                }`}
              >
                {t("office")}
              </Link>

              {isOwner && (
                <Link
                  href="/studio?tab=controls"
                  className={`flex items-center min-h-[44px] px-3 rounded-lg text-sm font-medium transition-colors ${
                    isControlsActive
                      ? "text-accent bg-accent/10"
                      : "text-muted hover:text-foreground hover:bg-card-border/30"
                  }`}
                >
                  {t("controls")}
                </Link>
              )}

              {isOwner && (
                <Link
                  href="/studio?tab=communication"
                  className={`flex items-center min-h-[44px] px-3 rounded-lg text-sm font-medium transition-colors ${
                    isCommunicationActive
                      ? "text-accent bg-accent/10"
                      : "text-muted hover:text-foreground hover:bg-card-border/30"
                  }`}
                >
                  {t("communication")}
                </Link>
              )}

              {isOwner && (
                <Link
                  href="/studio?tab=smm"
                  className={`flex items-center min-h-[44px] px-3 rounded-lg text-sm font-medium transition-colors ${
                    isSmmActive
                      ? "text-accent bg-accent/10"
                      : "text-muted hover:text-foreground hover:bg-card-border/30"
                  }`}
                >
                  {t("smm")}
                </Link>
              )}

              {isOwner && (
                <Link
                  href="/studio?tab=mempalace"
                  className={`flex items-center min-h-[44px] px-3 rounded-lg text-sm font-medium transition-colors ${
                    isMempalaceActive
                      ? "text-accent bg-accent/10"
                      : "text-muted hover:text-foreground hover:bg-card-border/30"
                  }`}
                >
                  MemPalace
                </Link>
              )}

              {/* Admin section (OWNER only) */}
              {isOwner && (
                <>
                  <div className="mt-3 mb-1 px-3">
                    <span className="text-xs font-medium text-muted uppercase tracking-wider">
                      {t("admin")}
                    </span>
                  </div>
                  <Link
                    href="/admin/agents"
                    className={`flex items-center min-h-[44px] px-3 rounded-lg text-sm transition-colors ${
                      pathname === "/admin/agents"
                        ? "text-accent bg-accent/10 font-medium"
                        : "text-muted hover:text-foreground hover:bg-card-border/30"
                    }`}
                  >
                    {t("agents")}
                  </Link>
                  <Link
                    href="/admin/clients"
                    className={`flex items-center min-h-[44px] px-3 rounded-lg text-sm transition-colors ${
                      pathname === "/admin/clients"
                        ? "text-accent bg-accent/10 font-medium"
                        : "text-muted hover:text-foreground hover:bg-card-border/30"
                    }`}
                  >
                    {t("clients")}
                  </Link>
                  <Link
                    href="/admin/projects"
                    className={`flex items-center min-h-[44px] px-3 rounded-lg text-sm transition-colors ${
                      pathname === "/admin/projects"
                        ? "text-accent bg-accent/10 font-medium"
                        : "text-muted hover:text-foreground hover:bg-card-border/30"
                    }`}
                  >
                    {t("projects")}
                  </Link>
                  <Link
                    href="/admin/office-editor"
                    className={`flex items-center min-h-[44px] px-3 rounded-lg text-sm transition-colors ${
                      pathname === "/admin/office-editor"
                        ? "text-accent bg-accent/10 font-medium"
                        : "text-muted hover:text-foreground hover:bg-card-border/30"
                    }`}
                  >
                    {t("officeEditor")}
                  </Link>
                </>
              )}
            </nav>

            {/* Drawer footer: LangSelector + user + sign-out */}
            <div className="border-t border-card-border px-4 py-4 flex flex-col gap-4 shrink-0">
              {/* Language & Theme */}
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-medium text-muted uppercase tracking-wider mb-2 block">
                    Language
                  </span>
                  <LanguageSelector />
                </div>
                <ThemeToggle />
              </div>

              {/* User info + sign-out */}
              {status === "loading" ? (
                <div className="w-full h-10 rounded-lg bg-card-border animate-pulse" />
              ) : session?.user ? (
                <div className="flex flex-col gap-3">
                  {/* User info row */}
                  <div className="flex items-center gap-3">
                    {session.user.image && (
                      <img
                        src={session.user.image}
                        alt=""
                        className="w-9 h-9 rounded-full border border-card-border shrink-0"
                      />
                    )}
                    <span className="text-sm text-muted truncate">{session.user.name}</span>
                  </div>
                  {/* Sign-out */}
                  <button
                    onClick={() => signOut()}
                    className="flex items-center justify-center min-h-[44px] w-full rounded-lg border border-card-border text-sm text-muted hover:text-foreground hover:bg-card-border/30 transition-colors"
                  >
                    {t("sign_out")}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => signIn(undefined, { callbackUrl: "/studio" })}
                  className="flex items-center justify-center min-h-[44px] w-full bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium transition-colors"
                >
                  {t("sign_in")}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
