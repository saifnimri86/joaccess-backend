"use client";

import { useEffect, useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { X, Sparkles, CheckCircle2, AlertTriangle, Loader2, ChevronLeft, ChevronRight, Brain } from "lucide-react";
import { analyzeLocationPhotos, photoUrl, type CVAnalysisResponse, type CVPhotoResult } from "@/lib/api";
import { useLanguage } from "@/contexts/LanguageContext";
import { toast } from "@/lib/toast";

interface CVAnalysisModalProps {
  open: boolean;
  locationId: number | null;
  locationName: string;
  photos: string[];
  onClose: () => void;
}

/**
 * CVAnalysisModal
 * ----------------
 * Modal that runs the EfficientNet-B0 classifier on every photo of a
 * location and displays per-class confidence scores side-by-side with
 * each photo. Used by admins to verify whether photo content matches
 * the user's claimed accessibility features.
 *
 * Layout decisions:
 *   - Two-pane: photo on the left, scores on the right. Switches to
 *     stacked on narrow widths.
 *   - Photo carousel preserved (chevrons + dots) so the admin can flip
 *     through photos and watch the right pane update in lockstep.
 *   - Per-class scores rendered as horizontal bars with the predicted
 *     class highlighted in maroon. The bar widths use the actual
 *     percentage (0–100) directly.
 *   - "Match badge" — green if the predicted class is one of the
 *     location's claimed accessibility features, amber otherwise.
 */
export function CVAnalysisModal({
  open,
  locationId,
  locationName,
  photos,
  onClose,
}: CVAnalysisModalProps) {
  const { t } = useLanguage();
  const [mounted, setMounted] = useState(false);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<CVAnalysisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setMounted(true), []);

  // Reset state when the modal opens for a new location, kick off analysis
  useEffect(() => {
    if (!open || !locationId) {
      setIndex(0);
      setAnalysis(null);
      setError(null);
      return;
    }

    // Lock body scroll while modal is open
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Keyboard nav: Esc closes, arrows flip through photos
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") setIndex((i) => (i - 1 + photos.length) % Math.max(1, photos.length));
      if (e.key === "ArrowRight") setIndex((i) => (i + 1) % Math.max(1, photos.length));
    };
    window.addEventListener("keydown", onKey);

    // Auto-trigger analysis as soon as the modal opens — admins always
    // want the results, no point making them click a second button.
    let cancelled = false;
    setLoading(true);
    setError(null);
    analyzeLocationPhotos(locationId)
      .then((data) => {
        if (cancelled) return;
        setAnalysis(data);
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setError(e.message);
        toast.error(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, locationId, photos.length, onClose]);

  // Look up the result for the currently-displayed photo by URL match.
  // The backend preserves photo order, so we could also index by position,
  // but matching by URL is more defensive against any reshuffling.
  const currentResult: CVPhotoResult | null = useMemo(() => {
    if (!analysis || !photos[index]) return null;
    const targetUrl = photos[index];
    return analysis.results.find((r) => r.photo_url === targetUrl) ?? null;
  }, [analysis, photos, index]);

  // Derive a sorted-by-confidence list for nice descending bar display
  const sortedScores = useMemo(() => {
    if (!currentResult?.all_scores) return [];
    return Object.entries(currentResult.all_scores)
      .sort(([, a], [, b]) => b - a) as [string, number][];
  }, [currentResult]);

  if (!mounted || !open) return null;

  const prev = () => setIndex((i) => (i - 1 + photos.length) % Math.max(1, photos.length));
  const next = () => setIndex((i) => (i + 1) % Math.max(1, photos.length));

  // Is the predicted class one the location actually claims?
  const isMatch = currentResult?.success
    && analysis?.claimed_features.includes(currentResult.predicted_class ?? "")
    || false;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 backdrop-blur-sm animate-fade-in"
        style={{ background: "rgba(0,0,0,0.85)" }}
        onClick={onClose}
      />

      {/* Modal shell */}
      <div
        className="relative flex flex-col animate-fade-up rounded-xl overflow-hidden"
        style={{
          width: "min(1100px, 100%)",
          maxHeight: "92vh",
          background: "var(--c-card)",
          border: "1px solid var(--c-border)",
          boxShadow: "0 30px 90px var(--c-shadow)",
        }}
        role="dialog"
        aria-modal="true"
        aria-label={`CV Analysis for ${locationName}`}
      >
        {/* ── Header ───────────────────────────────────────── */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: "1px solid var(--c-border)" }}
        >
          <div className="flex items-center gap-3">
            <div
              className="flex items-center justify-center rounded-lg"
              style={{
                width: 36, height: 36,
                background: "rgba(128,0,0,0.15)",
                border: "1px solid rgba(128,0,0,0.3)",
              }}
            >
              <Brain size={18} style={{ color: "var(--color-maroon-300)" }} />
            </div>
            <div>
              <p className="font-display font-bold text-base" style={{ color: "var(--c-ink)" }}>
                {t("cv_modal_title")}
              </p>
              <p className="text-xs mt-0.5 font-mono" style={{ color: "var(--c-ink-muted)" }}>
                {locationName} · {photos.length} {photos.length === 1 ? "photo" : "photos"}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="btn-row !p-1.5" aria-label="Close">
            <X size={14} />
          </button>
        </div>

        {/* ── Summary strip ────────────────────────────────── */}
        {analysis && (
          <div
            className="px-5 py-3 flex flex-wrap items-center gap-3 text-xs"
            style={{
              background: "var(--c-surface)",
              borderBottom: "1px solid var(--c-border)",
            }}
          >
            <span style={{ color: "var(--c-ink-muted)" }} className="uppercase tracking-widest font-semibold">
              {t("cv_summary")}:
            </span>
            <span className="badge" style={{
              background: "var(--c-success-bg)",
              color: "var(--c-success)",
              border: "1px solid var(--c-success-bdr)",
            }}>
              <CheckCircle2 size={10} /> {analysis.summary.feature_match_count} {t("cv_match")}
            </span>
            <span className="badge" style={{
              background: "var(--c-warn-bg)",
              color: "var(--c-warn)",
              border: "1px solid var(--c-warn-bdr)",
            }}>
              <AlertTriangle size={10} /> {analysis.summary.feature_mismatch_count} {t("cv_mismatch")}
            </span>
            {analysis.summary.failed > 0 && (
              <span className="badge" style={{
                background: "var(--c-danger-bg)",
                color: "var(--c-danger)",
                border: "1px solid var(--c-danger-bdr)",
              }}>
                <X size={10} /> {analysis.summary.failed} {t("cv_failed")}
              </span>
            )}
            {analysis.claimed_features.length > 0 && (
              <span className="ms-auto font-mono" style={{ color: "var(--c-ink-dim)" }}>
                {t("cv_claimed")}: {analysis.claimed_features.join(", ")}
              </span>
            )}
          </div>
        )}

        {/* ── Main two-pane area ───────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          {photos.length === 0 ? (
            <div className="p-12 text-center" style={{ color: "var(--c-ink-muted)" }}>
              <Sparkles size={28} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">{t("cv_no_photos")}</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-0" style={{ minHeight: 460 }}>
              {/* Left: photo viewer */}
              <div
                className="relative flex items-center justify-center overflow-hidden"
                style={{ background: "#000", minHeight: 320, maxHeight: "62vh" }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  key={photos[index]}
                  src={photoUrl(photos[index])}
                  alt={`Photo ${index + 1} of ${locationName}`}
                  className="max-w-full max-h-full object-contain animate-fade-in"
                  style={{ maxHeight: "62vh" }}
                />

                {/* Photo counter pill */}
                <div
                  className="absolute top-3 start-3 px-2.5 py-1 rounded-full text-xs font-mono"
                  style={{ background: "rgba(0,0,0,0.6)", color: "#F0ECEC" }}
                >
                  {index + 1} / {photos.length}
                </div>

                {/* Prev/Next */}
                {photos.length > 1 && (
                  <>
                    <button
                      onClick={(e) => { e.stopPropagation(); prev(); }}
                      className="absolute start-3 top-1/2 -translate-y-1/2 btn-row !p-2"
                      style={{ background: "rgba(0,0,0,0.55)" }}
                      aria-label="Previous photo"
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); next(); }}
                      className="absolute end-3 top-1/2 -translate-y-1/2 btn-row !p-2"
                      style={{ background: "rgba(0,0,0,0.55)" }}
                      aria-label="Next photo"
                    >
                      <ChevronRight size={18} />
                    </button>
                  </>
                )}
              </div>

              {/* Right: scores pane */}
              <div className="p-5 flex flex-col" style={{ background: "var(--c-card)" }}>
                {loading ? (
                  <div className="flex flex-1 flex-col items-center justify-center text-sm gap-3" style={{ color: "var(--c-ink-muted)" }}>
                    <Loader2 size={28} className="animate-spin" style={{ color: "var(--color-maroon-300)" }} />
                    <p className="font-mono uppercase tracking-widest text-xs">{t("cv_analyzing")}</p>
                  </div>
                ) : error ? (
                  <div className="flex flex-1 flex-col items-center justify-center text-center gap-2 px-4">
                    <AlertTriangle size={28} style={{ color: "var(--c-danger)" }} />
                    <p className="font-display font-bold text-sm" style={{ color: "var(--c-ink)" }}>{t("cv_err_title")}</p>
                    <p className="text-xs" style={{ color: "var(--c-ink-muted)" }}>{error}</p>
                  </div>
                ) : !currentResult ? (
                  <div className="flex flex-1 items-center justify-center text-sm" style={{ color: "var(--c-ink-muted)" }}>
                    {t("cv_waiting")}
                  </div>
                ) : !currentResult.success ? (
                  <div className="flex flex-1 flex-col items-center justify-center text-center gap-2 px-4">
                    <AlertTriangle size={24} style={{ color: "var(--c-danger)" }} />
                    <p className="font-display font-bold text-sm" style={{ color: "var(--c-ink)" }}>{t("cv_photo_failed")}</p>
                    <p className="text-xs" style={{ color: "var(--c-ink-muted)" }}>{currentResult.error}</p>
                  </div>
                ) : (
                  <>
                    {/* Top result */}
                    <div className="mb-5">
                      <p className="text-xs uppercase tracking-widest font-semibold mb-2" style={{ color: "var(--c-ink-muted)" }}>
                        {t("cv_predicted")}
                      </p>
                      <div className="flex items-center gap-3 flex-wrap">
                        <span
                          className="font-display font-bold text-2xl"
                          style={{ color: "var(--c-ink)" }}
                        >
                          {formatClassName(currentResult.predicted_class ?? "")}
                        </span>
                        <span
                          className="font-mono text-sm px-2 py-0.5 rounded-md"
                          style={{
                            background: "rgba(128,0,0,0.15)",
                            color: "var(--color-maroon-300)",
                          }}
                        >
                          {currentResult.confidence?.toFixed(2)}%
                        </span>
                        {isMatch ? (
                          <span className="badge badge-verified">
                            <CheckCircle2 size={10} /> {t("cv_match")}
                          </span>
                        ) : (
                          <span className="badge badge-pending">
                            <AlertTriangle size={10} /> {t("cv_mismatch")}
                          </span>
                        )}
                      </div>
                      {currentResult.inference_ms !== undefined && (
                        <p className="text-xs mt-2 font-mono" style={{ color: "var(--c-ink-dim)" }}>
                          {t("cv_inference_time")}: {currentResult.inference_ms} ms
                        </p>
                      )}
                    </div>

                    {/* Score bars */}
                    <div className="space-y-2.5">
                      <p className="text-xs uppercase tracking-widest font-semibold mb-1" style={{ color: "var(--c-ink-muted)" }}>
                        {t("cv_all_scores")}
                      </p>
                      {sortedScores.map(([cls, score], i) => {
                        const isTop = i === 0;
                        return (
                          <div key={cls}>
                            <div className="flex items-center justify-between mb-1 text-xs">
                              <span
                                className="font-medium"
                                style={{ color: isTop ? "var(--c-ink)" : "var(--c-ink-muted)" }}
                              >
                                {formatClassName(cls)}
                              </span>
                              <span className="font-mono" style={{ color: isTop ? "var(--color-maroon-300)" : "var(--c-ink-dim)" }}>
                                {score.toFixed(2)}%
                              </span>
                            </div>
                            <div
                              style={{
                                height: 6,
                                borderRadius: 3,
                                background: "var(--c-border)",
                                overflow: "hidden",
                              }}
                            >
                              <div
                                style={{
                                  width: `${Math.max(0.5, score)}%`,
                                  height: "100%",
                                  background: isTop
                                    ? "linear-gradient(90deg, #800000, #B33838)"
                                    : "var(--c-border-hov)",
                                  transition: "width 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
                                  borderRadius: 3,
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Footer / dot strip ───────────────────────────── */}
        {photos.length > 1 && (
          <div
            className="flex items-center justify-center gap-1.5 py-2.5"
            style={{ background: "var(--c-surface)", borderTop: "1px solid var(--c-border)" }}
          >
            {photos.map((_, i) => (
              <button
                key={i}
                onClick={() => setIndex(i)}
                aria-label={`Go to photo ${i + 1}`}
                style={{
                  width: i === index ? 22 : 6,
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

/**
 * Convert a snake_case class name like "wheelchair_ramp" into a
 * human-readable "Wheelchair Ramp" for display.
 */
function formatClassName(name: string): string {
  if (!name) return "—";
  return name
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
