"use client";

import { Loader2, Trash2, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";

interface ConfirmModalProps {
  open: boolean;
  title: string;
  description: string;
  loading?: boolean;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  open, title, description, loading, confirmLabel, onConfirm, onCancel,
}: ConfirmModalProps) {
  const { t } = useLanguage();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // ESC to close + lock body scroll while open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, loading, onCancel]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 backdrop-blur-sm animate-fade-in"
        style={{ background: "rgba(0,0,0,0.65)" }}
        onClick={() => !loading && onCancel()}
      />
      <div
        className="relative card p-6 w-full max-w-sm animate-fade-up"
        style={{ borderColor: "var(--c-danger-bdr)", boxShadow: "0 20px 60px var(--c-shadow)" }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
      >
        <button
          onClick={onCancel}
          disabled={loading}
          className="btn-row absolute top-3 end-3 !p-1.5"
          aria-label={t("common_cancel")}
        >
          <X size={14} />
        </button>
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
          style={{ background: "var(--c-danger-bg)", border: "1px solid var(--c-danger-bdr)" }}
        >
          <Trash2 size={17} style={{ color: "var(--c-danger)" }} />
        </div>
        <h3 id="confirm-title" className="font-display font-bold text-base mb-1.5" style={{ color: "var(--c-ink)" }}>
          {title}
        </h3>
        <p className="text-sm mb-5" style={{ color: "var(--c-ink-muted)" }}>
          {description}
        </p>
        <div className="flex gap-2.5">
          <button onClick={onCancel} disabled={loading} className="btn-ghost flex-1 justify-center">
            {t("common_cancel")}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 justify-center inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-50"
            style={{ background: "var(--c-danger)", color: "#fff" }}
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : (confirmLabel ?? t("common_delete"))}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
