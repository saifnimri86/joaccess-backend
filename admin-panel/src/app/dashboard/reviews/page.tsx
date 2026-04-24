"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getReviews, deleteReview, type Review } from "@/lib/api";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { TextModal } from "@/components/ui/TextModal";
import { Pagination } from "@/components/ui/Pagination";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { Trash2, MessageSquare } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { toast } from "@/lib/toast";

function Stars({ n }: { n: number }) {
  return (
    <span className="font-mono text-sm">
      <span style={{ color: "var(--c-warn)" }}>{"★".repeat(n)}</span>
      <span style={{ color: "var(--c-ink-dim)" }}>{"★".repeat(5 - n)}</span>
    </span>
  );
}

export default function ReviewsPage() {
  const qc = useQueryClient();
  const { t } = useLanguage();
  const [page, setPage] = useState(1);
  const [toDelete, setToDelete] = useState<Review | null>(null);
  const [preview, setPreview] = useState<Review | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-reviews", page],
    queryFn: () => getReviews({ page, per_page: 15 }),
    placeholderData: (prev) => prev,
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteReview(id),
    onSuccess: () => {
      toast.success(t("common_delete"));
      setToDelete(null);
      qc.invalidateQueries({ queryKey: ["admin-reviews"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4 max-w-screen-xl">
      <div className="animate-fade-up">
        <h1 className="font-display text-2xl font-bold tracking-tight" style={{ color: "var(--c-ink)" }}>
          {t("rev_title")}
        </h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--c-ink-muted)" }}>
          {t("rev_subtitle", { n: data?.total ?? "—" })}
        </p>
      </div>

      <div className="card overflow-hidden animate-fade-up delay-100">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("rev_col_loc")}</th>
                <th>{t("rev_col_user")}</th>
                <th>{t("rev_col_rating")}</th>
                <th>{t("rev_col_comment")}</th>
                <th>{t("rev_col_date")}</th>
                <th style={{ textAlign: "end" }}>{t("rev_col_actions")}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} className="p-0"><TableSkeleton rows={10} /></td></tr>
              ) : data?.reviews.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-14 text-sm" style={{ color: "var(--c-ink-muted)" }}>
                    <MessageSquare size={28} className="mx-auto mb-3 opacity-30" />
                    {t("rev_empty")}
                  </td>
                </tr>
              ) : (
                data?.reviews.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <span className="text-sm font-medium max-w-[160px] truncate block" style={{ color: "var(--c-ink)" }}>
                        {r.location_name}
                      </span>
                      <span className="text-xs font-mono" style={{ color: "var(--c-ink-muted)" }}>ID #{r.location_id}</span>
                    </td>
                    <td className="text-sm" style={{ color: "var(--c-ink)" }}>{r.user}</td>
                    <td><Stars n={r.rating} /></td>
                    <td>
                      {r.comment ? (
                        <button
                          onClick={() => setPreview(r)}
                          className="text-sm max-w-[260px] truncate block text-start hover:underline underline-offset-2"
                          style={{ color: "var(--c-ink-muted)" }}
                        >
                          {r.comment}
                        </button>
                      ) : (
                        <span className="text-sm italic" style={{ color: "var(--c-ink-dim)" }}>{t("rev_no_comment")}</span>
                      )}
                    </td>
                    <td className="text-xs font-mono" style={{ color: "var(--c-ink-muted)" }}>
                      {new Date(r.created_at).toLocaleDateString()}
                    </td>
                    <td>
                      <div className="flex justify-end">
                        <button onClick={() => setToDelete(r)} className="btn-row row-danger" aria-label={t("common_delete")}>
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
        title={t("rev_del_title")}
        description={t("rev_del_desc", { user: toDelete?.user ?? "", location: toDelete?.location_name ?? "" })}
        loading={deleteMut.isPending}
        onConfirm={() => toDelete && deleteMut.mutate(toDelete.id)}
        onCancel={() => setToDelete(null)}
      />

      <TextModal
        open={!!preview}
        title={`${preview?.user ?? ""} — ${preview?.location_name ?? ""}`}
        text={preview?.comment ?? ""}
        onClose={() => setPreview(null)}
      />
    </div>
  );
}
