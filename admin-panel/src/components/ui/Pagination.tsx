"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface PaginationProps {
  page: number;
  total_pages: number;
  onPage: (p: number) => void;
}

export function Pagination({ page, total_pages, onPage }: PaginationProps) {
  const { isRTL } = useLanguage();

  if (total_pages <= 1) return null;

  const pages: (number | "…")[] = [];
  if (total_pages <= 7) {
    for (let i = 1; i <= total_pages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push("…");
    for (let i = Math.max(2, page - 1); i <= Math.min(total_pages - 1, page + 1); i++) pages.push(i);
    if (page < total_pages - 2) pages.push("…");
    pages.push(total_pages);
  }

  // Arrows follow the reading direction — in RTL "previous" should visually
  // point toward the right (the direction prior pages exist).
  const PrevIcon = isRTL ? ChevronRight : ChevronLeft;
  const NextIcon = isRTL ? ChevronLeft : ChevronRight;

  return (
    <div
      className="flex items-center gap-1 justify-end px-4 py-3"
      style={{ borderTop: "1px solid var(--c-border)" }}
    >
      <button
        onClick={() => onPage(page - 1)}
        disabled={page === 1}
        className="btn-row !p-1.5"
        aria-label="Previous page"
      >
        <PrevIcon size={15} />
      </button>

      {pages.map((p, i) =>
        p === "…" ? (
          <span key={`e${i}`} className="px-2 text-sm" style={{ color: "var(--c-ink-dim)" }}>…</span>
        ) : (
          <button
            key={p}
            onClick={() => onPage(p as number)}
            className="w-7 h-7 rounded-lg text-xs font-medium transition-all"
            style={
              p === page
                ? { background: "#800000", color: "#fff" }
                : { color: "var(--c-ink-muted)" }
            }
            aria-current={p === page ? "page" : undefined}
          >
            {p}
          </button>
        )
      )}

      <button
        onClick={() => onPage(page + 1)}
        disabled={page === total_pages}
        className="btn-row !p-1.5"
        aria-label="Next page"
      >
        <NextIcon size={15} />
      </button>
    </div>
  );
}
