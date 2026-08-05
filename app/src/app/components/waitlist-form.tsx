"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"

type FormState = "idle" | "loading" | "success" | "error" | "duplicate"

export function WaitlistForm() {
  const t = useTranslations("landing")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [state, setState] = useState<FormState>("idle")
  const [errorMsg, setErrorMsg] = useState("")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email) return

    setState("loading")
    setErrorMsg("")

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() || undefined, email: email.trim() }),
      })

      if (res.status === 409) {
        setState("duplicate")
        return
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setErrorMsg((data as { error?: string }).error || "Something went wrong")
        setState("error")
        return
      }

      setState("success")
    } catch {
      setState("error")
      setErrorMsg("Network error. Please try again.")
    }
  }

  if (state === "success") {
    return (
      <div className="text-center py-4">
        <div
          role="status"
          aria-live="polite"
          className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400"
        >
          <span className="text-xl">✓</span>
          <span className="font-medium">{t("waitlist_success")}</span>
        </div>
      </div>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 w-full max-w-md mx-auto"
      aria-busy={state === "loading"}
    >
      <label htmlFor="waitlist-name" className="sr-only">
        {t("waitlist_name_placeholder")}
      </label>
      <input
        id="waitlist-name"
        name="name"
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t("waitlist_name_placeholder")}
        className="px-4 py-3 rounded-lg bg-card-bg border border-card-border text-foreground placeholder-muted focus:outline-none focus:border-accent transition-colors"
        disabled={state === "loading"}
        autoComplete="name"
      />
      <div className="flex flex-col sm:flex-row gap-3">
        <label htmlFor="waitlist-email" className="sr-only">
          {t("waitlist_placeholder")}
        </label>
        <input
          id="waitlist-email"
          name="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("waitlist_placeholder")}
          required
          className="flex-1 px-4 py-3 rounded-lg bg-card-bg border border-card-border text-foreground placeholder-muted focus:outline-none focus:border-accent transition-colors"
          disabled={state === "loading"}
          autoComplete="email"
        />
        <button
          type="submit"
          disabled={state === "loading" || !email}
          className="bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-3 rounded-lg font-medium transition-colors whitespace-nowrap"
        >
          {state === "loading" ? t("waitlist_loading") : t("waitlist_button")}
        </button>
      </div>
      {state === "duplicate" && (
        <p role="status" aria-live="polite" className="text-sm text-yellow-400 text-center">
          {t("waitlist_duplicate")}
        </p>
      )}
      {state === "error" && (
        <p role="alert" className="text-sm text-red-400 text-center">
          {errorMsg || t("waitlist_error")}
        </p>
      )}
      <p className="text-xs text-muted text-center">{t("waitlist_disclaimer")}</p>
    </form>
  )
}
