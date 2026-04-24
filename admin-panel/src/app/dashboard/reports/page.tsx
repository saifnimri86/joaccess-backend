"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getReports, resolveReport, deleteReport, type Report } from "@/lib/api";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { TextModal } from "@/components/ui/TextModal";
import { Pagination } from "@/components/ui/Pagination";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { Trash2, CheckCircle2, AlertTriangle } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { localizeReportReason } from "@/lib/i18n";
import { toast } from "@/lib/toast";

export default function ReportsPage() {
  const qc = useQueryClient();
  const { t, lang } = useLanguage();
  const [page, setPage] = useState(1);
  const [toDelete, setToDelete] = useState<Report | null>(null);
  const [preview, setPreview] = useState<Report | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-reports", page],
    queryFn: () => getReports({ page, per_page: 15 }),
    placeholderData: (prev) => prev,
  });

  const resolveMut = useMutation({
    mutationFn: (id: number) => resolveReport(id),
    onSuccess: () => {
      toast.success(t("rep_resolved"));
      qc.invalidateQueries({ queryKey: ["admin-reports"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteReport(id),
    onSuccess: () => {
      toast.success(t("common_delete"));
      setToDelete(null);
      qc.invalidateQueries({ queryKey: ["admin-reports"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4 max-w-screen-xl">
      <div className="animate-fade-up">
        <h1 className="font-display text-2xl font-bold tracking-tight" style={{ color: "var(--c-ink)" }}>
          {t("rep_title")}
        </h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--c-ink-muted)" }}>
          {t("rep_subtitle", { n: data?.total ?? "—" })}
        </p>
      </div>

      <div className="card overflow-hidden animate-fade-up delay-100">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("rep_col_loc")}</th>
                <th>{t("rep_col_reporter")}</th>
                <th>{t("rep_col_reason")}</th>
                <th>{t("rep_col_desc")}</th>
                <th>{t("rep_col_status")}</th>
                <th>{t("rep_col_date")}</th>
                <th style={{ textAlign: "end" }}>{t("rep_col_actions")}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="p-0"><TableSkeleton rows={8} /></td></tr>
              ) : data?.reports.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-14 text-sm" style={{ color: "var(--c-ink-muted)" }}>
                    <CheckCircle2 size={28} className="mx-auto mb-3 opacity-60" style={{ color: "var(--c-success)" }} />
                    {t("rep_empty")}
                  </td>
                </tr>
              ) : (
                data?.reports.map((rep) => (
                  <tr key={rep.id}>
                    <td>
                      <span className="text-sm font-medium max-w-[150px] truncate block" style={{ color: "var(--c-ink)" }}>
                        {rep.location_name}
                      </span>
                      <span className="text-xs font-mono" style={{ color: "var(--c-ink-muted)" }}>ID #{rep.location_id}</span>
                    </td>
                    <td className="text-sm" style={{ color: "var(--c-ink)" }}>{rep.reporter}</td>
                    <td><span className="badge badge-report text-xs">{localizeReportReason(lang, rep.reason)}</span></td>
                    <td>
                      {rep.description ? (
                        <button
                          onClick={() => setPreview(rep)}
                          className="text-sm max-w-[220px] truncate block text-start hover:underline underline-offset-2"
                          style={{ color: "var(--c-ink-muted)" }}
                        >
                          {rep.description}
                        </button>
                      ) : (
                        <span className="text-sm italic" style={{ color: "var(--c-ink-dim)" }}>{t("rep_no_desc")}</span>
                      )}
                    </td>
                    <td>
                      {rep.resolved ? (
                        <span className="badge badge-verified"><CheckCircle2 size={10} /> {t("rep_resolved")}</span>
                      ) : (
                        <span className="badge badge-report"><AlertTriangle size={10} /> {t("rep_open")}</span>
                      )}
                    </td>
                    <td className="text-xs font-mono" style={{ color: "var(--c-ink-muted)" }}>
                      {new Date(rep.created_at).toLocaleDateString()}
                    </td>
                    <td>
                      <div className="flex items-center gap-1.5 justify-end">
                        {!rep.resolved && (
                          <button onClick={() => resolveMut.mutate(rep.id)} disabled={resolveMut.isPending} className="btn-row row-success">
                            <CheckCircle2 size={13} /> {t("rep_resolve")}
                          </button>
                        )}
                        <button onClick={() => setToDelete(rep)} className="btn-row row-danger" aria-label={t("common_delete")}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={page} total_pages={data?.pages ?? 1} onPage={setPage} />
      </div>

      <ConfirmModal
        open={!!toDelete}
        title={t("rep_del_title")}
        description={t("rep_del_desc", { reporter: toDelete?.reporter ?? "" })}
        loading={deleteMut.isPending}
        onConfirm={() => toDelete && deleteMut.mutate(toDelete.id)}
        onCancel={() => setToDelete(null)}
      />

      <TextModal
        open={!!preview}
        title={`${preview?.reporter ?? ""} — ${preview?.location_name ?? ""}`}
        text={preview?.description ?? ""}
        onClose={() => setPreview(null)}
      />
    </div>
  );
}
