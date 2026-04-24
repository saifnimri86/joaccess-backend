"use client";

import { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { photoUrl } from "@/lib/api";

interface PhotoCarouselModalProps {
  open: boolean;
  photos: string[];
  locationName: string;
  onClose: () => void;
}

export function PhotoCarouselModal({ open, photos, locationName, onClose }: PhotoCarouselModalProps) {
  const [mounted, setMounted] = useState(false);
  const [index, setIndex] = useState(0);

  useEffect(() => setMounted(true), []);

  const prev = useCallback(() => setIndex((i) => (i - 1 + photos.length) % photos.length), [photos.length]);
  const next = useCallback(() => setIndex((i) => (i + 1) % photos.length), [photos.length]);

  useEffect(() => {
    if (!open) { setIndex(0); return; }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") setIndex((i) => (i - 1 + photos.length) % photos.length);
      if (e.key === "ArrowRight") setIndex((i) => (i + 1) % photos.length);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, photos.length]);

  if (!mounted || !open || photos.length === 0) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 backdrop-blur-sm animate-fade-in"
        style={{ background: "rgba(0,0,0,0.8)" }}
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="relative flex flex-col animate-fade-up"
        style={{ width: "min(720px, 100%)", maxHeight: "90vh" }}
        role="dialog"
        aria-modal="true"
        aria-label={`Photos of ${locationName}`}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 rounded-t-xl"
          style={{ background: "var(--c-surface)", borderBottom: "1px solid var(--c-border)" }}
        >
          <div>
            <p className="font-display font-bold text-sm" style={{ color: "var(--c-ink)" }}>{locationName}</p>
            <p className="text-xs font-mono mt-0.5" style={{ color: "var(--c-ink-muted)" }}>
              {index + 1} / {photos.length}
            </p>
          </div>
          <button onClick={onClose} className="btn-row !p-1.5" aria-label="Close">
            <X size={14} />
          </button>
        </div>

        {/* Image area */}
        <div
          className="relative flex items-center justify-center overflow-hidden"
          style={{ background: "#000", minHeight: 320, maxHeight: "70vh" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={photos[index]}
            src={photoUrl(photos[index])}
            alt={`Photo ${index + 1} of ${locationName}`}
            className="max-w-full max-h-full object-contain animate-fade-in"
            style={{ maxHeight: "70vh" }}
          />

          {/* Prev / Next — only shown when more than one photo */}
          {photos.length > 1 && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); prev(); }}
                className="absolute start-3 btn-row !p-2"
                style={{ background: "rgba(0,0,0,0.55)" }}
                aria-label="Previous photo"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); next(); }}
                className="absolute end-3 btn-row !p-2"
                style={{ background: "rgba(0,0,0,0.55)" }}
                aria-label="Next photo"
              >
                <ChevronRight size={18} />
              </button>
            </>
          )}
        </div>

        {/* Dot strip */}
        {photos.length > 1 && (
          <div
            className="flex items-center justify-center gap-1.5 py-2.5 rounded-b-xl"
            style={{ background: "var(--c-surface)", borderTop: "1px solid var(--c-border)" }}
          >
            {photos.map((_, i) => (
              <button
                key={i}
                onClick={() => setIndex(i)}
                aria-label={`Go to photo ${i + 1}`}
                style={{
                  width: i === index ? 20 : 6,
                  height: 6,
                  borderRadius: 9999,
                  background: i === index ? "#800000" : "var(--c-border)",
                  transition: "all 0.2s",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
