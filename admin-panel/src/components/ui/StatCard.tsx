"use client";

import type { LucideIcon } from "lucide-react";
import { useCountUp } from "@/hooks/useCountUp";

interface StatCardProps {
  label: string;
  value: number;
  icon: LucideIcon;
  /** Icon tint — one of the semantic CSS vars, or maroon */
  tone?: "maroon" | "success" | "warn" | "danger" | "muted";
  suffix?: string;
  decimals?: number;
  delay?: number;
}

const TONE_MAP: Record<NonNullable<StatCardProps["tone"]>, { bg: string; color: string; border: string }> = {
  maroon:  { bg: "rgba(128,0,0,0.12)",       color: "var(--color-maroon-300)", border: "rgba(128,0,0,0.25)" },
  success: { bg: "var(--c-success-bg)",      color: "var(--c-success)",        border: "var(--c-success-bdr)" },
  warn:    { bg: "var(--c-warn-bg)",         color: "var(--c-warn)",           border: "var(--c-warn-bdr)" },
  danger:  { bg: "var(--c-danger-bg)",       color: "var(--c-danger)",         border: "var(--c-danger-bdr)" },
  muted:   { bg: "var(--c-surface-hov)",     color: "var(--c-ink-muted)",      border: "var(--c-border)" },
};

export function StatCard({
  label, value, icon: Icon, tone = "maroon", suffix = "", decimals = 0, delay = 0,
}: StatCardProps) {
  const animated = useCountUp(value, 900, decimals);
  const t = TONE_MAP[tone];

  return (
    <div
      className="card p-5 animate-fade-up"
      style={{ animationDelay: `${delay}ms`, opacity: 0 }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1.5 min-w-0 flex-1">
          <p
            className="text-xs font-semibold uppercase tracking-widest truncate"
            style={{ color: "var(--c-ink-muted)" }}
          >
            {label}
          </p>
          <p className="stat-number tabular">
            {decimals > 0 ? animated.toFixed(decimals) : Math.round(animated).toLocaleString()}
            {suffix}
          </p>
        </div>
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: t.bg, border: `1px solid ${t.border}` }}
        >
          <Icon size={18} style={{ color: t.color }} />
        </div>
      </div>
    </div>
  );
}
