"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getUsers, deleteUser, type AdminUser } from "@/lib/api";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Pagination } from "@/components/ui/Pagination";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { Search, Trash2, Shield, User, Building2, Users } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { localizeUserType } from "@/lib/i18n";
import { toast } from "@/lib/toast";

export default function UsersPage() {
  const qc = useQueryClient();
  const { t, lang } = useLanguage();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [toDelete, setToDelete] = useState<AdminUser | null>(null);

  useEffect(() => { setPage(1); }, [search]);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-users", page, search],
    queryFn: () => getUsers({ page, per_page: 15, search: search || undefined }),
    placeholderData: (prev) => prev,
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteUser(id),
    onSuccess: () => {
      toast.success(t("common_delete"));
      setToDelete(null);
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4 max-w-screen-xl">
      <div className="animate-fade-up">
        <h1 className="font-display text-2xl font-bold tracking-tight" style={{ color: "var(--c-ink)" }}>
          {t("usr_title")}
        </h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--c-ink-muted)" }}>
          {t("usr_subtitle", { n: data?.total ?? "—" })}
        </p>
      </div>

      {/* Search */}
      <div className="card p-4 animate-fade-up delay-100">
        <div className="relative max-w-sm">
          <Search size={14} className="absolute start-3 top-1/2 -translate-y-1/2" style={{ color: "var(--c-ink-muted)" }} />
          <input className="input ps-9 h-9 text-sm" placeholder={t("usr_search")} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden animate-fade-up delay-150">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("usr_col_user")}</th>
                <th>{t("usr_col_type")}</th>
                <th>{t("usr_col_locs")}</th>
                <th>{t("usr_col_reviews")}</th>
                <th>{t("usr_col_role")}</th>
                <th>{t("usr_col_joined")}</th>
                <th style={{ textAlign: "end" }}>{t("usr_col_actions")}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="p-0"><TableSkeleton rows={10} /></td></tr>
              ) : data?.users.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-14 text-sm" style={{ color: "var(--c-ink-muted)" }}>
                    <Users size={28} className="mx-auto mb-3 opacity-30" />
                    {t("usr_empty")}
                  </td>
                </tr>
              ) : (
                data?.users.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold font-display uppercase shrink-0"
                          style={{ background: "rgba(128,0,0,0.15)", border: "1px solid rgba(128,0,0,0.2)", color: "var(--color-maroon-300)" }}
                        >
                          {user.username[0]}
                        </div>
                        <div>
                          <div className="font-medium text-sm" style={{ color: "var(--c-ink)" }}>{user.username}</div>
                          <div className="text-xs" style={{ color: "var(--c-ink-muted)" }}>{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="flex items-center gap-1.5 text-xs" style={{ color: "var(--c-ink-muted)" }}>
                        {user.user_type === "organization"
                          ? <Building2 size={12} style={{ color: "var(--color-maroon-300)" }} />
                          : <User size={12} style={{ color: "var(--c-ink-dim)" }} />}
                        {localizeUserType(lang, user.user_type)}
                      </span>
                      {user.org_name && (
                        <span className="text-xs block truncate max-w-[140px]" style={{ color: "var(--c-ink-dim)" }}>
                          {user.org_name}
                        </span>
                      )}
                    </td>
                    <td><span className="font-mono text-sm" style={{ color: "var(--c-ink)" }}>{user.location_count}</span></td>
                    <td><span className="font-mono text-sm" style={{ color: "var(--c-ink)" }}>{user.review_count}</span></td>
                    <td>
                      {user.is_admin ? (
                        <span className="badge badge-admin"><Shield size={10} /> {t("usr_admin")}</span>
                      ) : (
                        <span className="text-xs" style={{ color: "var(--c-ink-muted)" }}>{t("usr_user")}</span>
                      )}
                    </td>
                    <td className="text-xs font-mono" style={{ color: "var(--c-ink-muted)" }}>
                      {new Date(user.created_at).toLocaleDateString()}
                    </td>
                    <td>
                      <div className="flex justify-end">
                        {!user.is_admin && (
                          <button onClick={() => setToDelete(user)} className="btn-row row-danger" aria-label={t("common_delete")}>
                            <Trash2 size={13} />
                          </button>
                        )}
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
        title={t("usr_del_title")}
        description={t("usr_del_desc", { username: toDelete?.username ?? "", email: toDelete?.email ?? "" })}
        loading={deleteMut.isPending}
        onConfirm={() => toDelete && deleteMut.mutate(toDelete.id)}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
