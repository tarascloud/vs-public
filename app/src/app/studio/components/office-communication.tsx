"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import EmailInbox from "./email-inbox";
import TelegramChat from "./telegram-chat";

type SubTab = "email" | "telegram";

export default function OfficeCommunication() {
  const t = useTranslations("communication");
  const searchParams = useSearchParams();
  const router = useRouter();

  const subTab = (searchParams.get("sub") as SubTab) || "email";

  const handleSubTab = (tab: SubTab) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "communication");
    params.set("sub", tab);
    router.push(`/studio?${params.toString()}`);
  };

  return (
    <div className="space-y-4">
      {/* Sub-tab bar */}
      <div className="flex items-center gap-1 bg-card-bg border border-card-border rounded-xl p-1 w-fit">
        <button
          onClick={() => handleSubTab("email")}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            subTab === "email"
              ? "bg-accent text-white"
              : "text-muted hover:text-foreground hover:bg-card-border/30"
          }`}
        >
          {t("email")}
        </button>
        <button
          onClick={() => handleSubTab("telegram")}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            subTab === "telegram"
              ? "bg-accent text-white"
              : "text-muted hover:text-foreground hover:bg-card-border/30"
          }`}
        >
          {t("telegram")}
        </button>
      </div>

      {/* Sub-tab content */}
      {subTab === "email" && <EmailInbox />}
      {subTab === "telegram" && <TelegramChat />}
    </div>
  );
}
