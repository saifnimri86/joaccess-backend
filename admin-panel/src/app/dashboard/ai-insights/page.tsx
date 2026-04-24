"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { getAIInsights, type AIInsightsResponse } from "@/lib/api";
import {
  Sparkles, Loader2, RefreshCw, CheckCircle2, AlertTriangle,
  Brain, TrendingUp, Lightbulb, Download
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { toast } from "@/lib/toast";
import ReactMarkdown from "react-markdown";

export default function AIInsightsPage() {
  const { t } = useLanguage();
  const [result, setResult] = useState<AIInsightsResponse | null>(null);
  const [error, setError] = useState("");

  const { mutate, isPending } = useMutation({
    mutationFn: getAIInsights,
    onSuccess: (data) => {
      // Remove backticks and possible "json" identifiers
      let clean = data.insights.replace(/```json/gi, "").replace(/```/g, "");
      clean = clean.replace(/json\s*$/i, "").trim();
      data.insights = clean;

      setResult(data);
      setError("");
    },
    onError: (err: Error) => {
      setError(err.message ?? t("ai_err_title"));
      toast.error(err.message ?? t("ai_err_title"));
    },
  });

  function runAnalysis() {
    setResult(null);
    setError("");
    mutate();
  }

  const handleExportPDF = async () => {
    try {
      // Import PDF generation libraries dynamically
      const pdfMakeModule = await import("pdfmake/build/pdfmake");
      const pdfMake = pdfMakeModule.default ? pdfMakeModule.default : pdfMakeModule;
      const pdfFontsModule = await import("pdfmake/build/vfs_fonts");
      const pdfFonts = pdfFontsModule.default ? pdfFontsModule.default : pdfFontsModule;
      const htmlToPdfmakeModule = await import("html-to-pdfmake");
      const htmlToPdfmake = htmlToPdfmakeModule.default ? htmlToPdfmakeModule.default : (htmlToPdfmakeModule as any);

      if (pdfFonts && pdfFonts.pdfMake) {
        pdfMake.vfs = pdfFonts.pdfMake.vfs;
      }

      const element = document.getElementById("pdf-report-content");
      if (!element) return;
      
      const htmlString = element.innerHTML;
      const parsedHtml = htmlToPdfmake(htmlString, {
        defaultStyles: {
          h1: { fontSize: 20, bold: true, margin: [0, 8, 0, 4] },
          h2: { fontSize: 18, bold: true, margin: [0, 8, 0, 4] },
          h3: { fontSize: 14, bold: true, margin: [0, 8, 0, 4] },
          p: { margin: [0, 4, 0, 4], color: 'black' },
          ul: { margin: [0, 4, 0, 4], color: 'black' },
          ol: { margin: [0, 4, 0, 4], color: 'black' },
          li: { color: 'black' },
          strong: { bold: true, color: 'black' }
        }
      });

      const documentDefinition = {
        content: [
          { text: 'JOAccess AI Analysis', style: 'header' },
          { text: `Generated on ${new Date(result?.generated_at ?? "").toLocaleString()}`, style: 'subheader' },
          ...parsedHtml
        ],
        styles: {
          header: { fontSize: 24, bold: true, margin: [0, 0, 0, 5] as any, alignment: 'center' as const },
          subheader: { fontSize: 12, color: 'gray', margin: [0, 0, 0, 20] as any, alignment: 'center' as const }
        },
        defaultStyle: {
          color: 'black'
        }
      };

      pdfMake.createPdf(documentDefinition).download('joaccess-ai-insights.pdf');
    } catch (err) {
      console.error("PDF Export failed", err);
      toast.error("Failed to export PDF");
    }
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto flex flex-col items-center w-full">
      {/* Header */}
      <div className="animate-fade-up w-full flex flex-col items-center text-center">
        <h1 className="font-display text-2xl font-bold tracking-tight flex items-center gap-2" style={{ color: "var(--c-ink)" }}>
          <Sparkles size={22} style={{ color: "var(--color-maroon-300)" }} />
          {t("ai_title")}
        </h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--c-ink-muted)" }}>
          {t("ai_subtitle")}
        </p>
      </div>

      {/* Report & Top Actions */}
      {result && (
        <div className="w-full flex-col flex items-center animate-fade-up mt-4">
          <div className="flex gap-4 w-full justify-center mb-6">
            <button
              onClick={runAnalysis}
              disabled={isPending}
              className="btn-ai text-sm px-6 py-3 flex items-center gap-2 shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
            >
              {isPending ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  {t("ai_analyzing")}
                </>
              ) : (
                <>
                  <RefreshCw size={16} />
                  {t("ai_regen")}
                </>
              )}
            </button>
            
            <button
              onClick={handleExportPDF}
              className="px-6 py-3 rounded-xl flex items-center gap-2 font-medium text-sm transition-all duration-300 hover:shadow-md cursor-pointer hover:-translate-y-0.5 active:translate-y-0 dark:hover:bg-slate-800 hover:bg-slate-100"
              style={{
                background: "var(--c-surface)",
                color: "var(--c-ink)",
                border: "1px solid var(--c-border-hov)",
              }}
            >
              <Download size={16} />
              Export PDF
            </button>
          </div>

          <div className="w-full space-y-4">
            <div id="pdf-report-content" className="w-full space-y-4">
              <div className="card p-6 w-full text-left">
                <div className="flex items-center gap-2 mb-4">
                  <TrendingUp size={16} style={{ color: "var(--color-maroon-300)" }} />
                  <h3 className="font-display font-bold text-base" style={{ color: "var(--c-ink)" }}>
                    {t("ai_analysis")}
                  </h3>
                </div>
                <div className="text-sm leading-relaxed w-full max-w-none report-text [&>h1]:text-xl [&>h1]:font-bold [&>h2]:text-lg [&>h2]:font-bold [&>h3]:text-base [&>h3]:font-semibold [&>p]:my-3 [&>ul]:list-disc [&>ul]:pl-5 [&>ul]:my-2 [&>ol]:list-decimal [&>ol]:pl-5 [&>ol]:my-2 [&>li]:my-1 [&>strong]:font-bold">
                  <ReactMarkdown>{result.insights}</ReactMarkdown>
                </div>
              </div>

              {result.recommendations.length > 0 && (
                <div className="card p-6 w-full text-left">
                  <div className="flex items-center gap-2 mb-4">
                    <Lightbulb size={16} style={{ color: "var(--c-warn)" }} />
                    <h3 className="font-display font-bold text-base" style={{ color: "var(--c-ink)" }}>
                      {t("ai_recs")}
                    </h3>
                  </div>
                  <div className="space-y-3 flex flex-col items-start w-full">
                    {result.recommendations.map((rec, i) => (
                      <div key={i} className="flex items-start gap-3 w-full">
                        <div
                          className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                          style={{ background: "rgba(128,0,0,0.12)", border: "1px solid rgba(128,0,0,0.25)" }}
                        >
                          <CheckCircle2 size={11} style={{ color: "var(--color-maroon-300)" }} />
                        </div>
                        <div className="text-sm leading-relaxed m-0 report-text">
                          <div className="[&>p]:m-0"><ReactMarkdown>{rec}</ReactMarkdown></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            
            <p className="text-xs mt-3 text-center w-full" style={{ color: "var(--c-ink-dim)" }}>
              {t("ai_last_gen", { time: new Date(result.generated_at).toLocaleString() })}
            </p>
          </div>
        </div>
      )}

      {/* Styles for strict light/dark targeting without assuming Tailwind config */ }
      <style>{`
        .report-text {
          color: #FFFFFF;
        }
        html.light .report-text {
          color: #FF0000;
        }
        .report-text * {
          color: inherit;
        }
      `}</style>

      {/* Hero card (hidden if result exists) */}
      {!result && (
        <div
          className="card p-8 text-center animate-fade-up delay-100 relative overflow-hidden w-full"
          style={{
            borderColor: "rgba(128,0,0,0.25)",
            background: "linear-gradient(135deg, var(--c-card) 0%, var(--c-surface) 100%)",
          }}
        >
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full pointer-events-none"
            style={{
              background: "radial-gradient(circle, rgba(128,0,0,0.15), transparent 70%)",
              filter: "blur(40px)",
            }}
          />
          <div className="relative">
            <div
              className="w-16 h-16 rounded-2xl mx-auto mb-5 flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, #800000, #4A0000)" }}
            >
              <Brain size={28} className="text-white" />
            </div>
            <h2 className="font-display text-xl font-bold mb-2" style={{ color: "var(--c-ink)" }}>
              {t("ai_card_title")}
            </h2>
            <p className="text-sm mb-6 max-w-md mx-auto" style={{ color: "var(--c-ink-muted)" }}>
              {t("ai_card_desc")}
            </p>
            <button onClick={runAnalysis} disabled={isPending} className="btn-ai text-sm px-6 py-3 mx-auto cursor-pointer">
              {isPending ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  {t("ai_analyzing")}
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  {t("ai_run")}
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="card p-4 flex items-start gap-3 animate-fade-in w-full text-left" style={{ borderColor: "var(--c-danger-bdr)" }}>
          <AlertTriangle size={16} className="mt-0.5 shrink-0" style={{ color: "var(--c-danger)" }} />
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--c-danger)" }}>{t("ai_err_title")}</p>
            <p className="text-xs mt-0.5" style={{ color: "var(--c-ink-muted)" }}>{error}</p>
          </div>
        </div>
      )}
    </div>
  );
}
