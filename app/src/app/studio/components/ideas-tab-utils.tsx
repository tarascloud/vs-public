"use client";

import { useRef, useEffect } from "react";

// ---------- Quick Reply Parser ----------

/** Parse [Button Text] patterns from message content for quick reply buttons */
export function parseQuickReplies(content: string): { cleanContent: string; replies: string[] } | null {
  const buttons = content.match(/\[([^\]]+)\]/g);
  if (!buttons || buttons.length === 0) return null;
  const cleanContent = content.replace(/\[([^\]]+)\]/g, "").trim();
  return { cleanContent, replies: buttons.map((b) => b.slice(1, -1)) };
}

// ---------- AutoGrow Textarea ----------

interface AutoGrowTextareaProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
  minRows?: number;
}

export function AutoGrowTextarea({ value, onChange, placeholder, className = "", minRows = 4 }: AutoGrowTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={minRows}
      style={{ resize: "none", overflow: "hidden" }}
      className={`w-full px-3 py-2 rounded-lg bg-background border border-card-border text-foreground text-sm focus:outline-none focus:border-accent/50 ${className}`}
    />
  );
}
