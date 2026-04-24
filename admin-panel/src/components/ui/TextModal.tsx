"use client";

import { X } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useState } from "react";

interface TextModalProps {
  open: boolean;
  title: string;
  text: string;
  onClose: () => void;
}

export function TextModal({ open, title, text, onClose }: TextModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 backdrop-blur-sm animate-fade-in"
        style={{ background: "rgba(0,0,0,0.65)" }}
        onClick={onClose}
      />
      <div
        className="relative card p-6 w-full max-w-lg animate-fade-up flex flex-col gap-4"
        style={{ boxShadow: "0 20px 60px var(--c-shadow)", maxHeight: "80vh" }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="text-modal-title"
      >
        <div className="flex items-start justify-between gap-3">
          <h3 id="text-modal-title" className="font-display font-bold text-base" style={{ color: "var(--c-ink)" }}>
            {title}
          </h3>
          <button onClick={onClose} className="btn-row !p-1.5 shrink-0" aria-label="Close">
            <X size={14} />
          </button>
        </div>
        <div className="overflow-y-auto">
          <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "var(--c-ink-muted)" }}>
            {text}
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
}
