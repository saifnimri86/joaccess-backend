"use client";

import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getUsers, deleteUser, type AdminUser } from "@/lib/api";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Pagination } from "@/components/ui/Pagination";
import { TableSkeleton } from "@/components/ui/Skeleton";
import {
  Search,
  Trash2,
  Shield,
  User,
  Building2,
  Users,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Filter,
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { localizeUserType } from "@/lib/i18n";
import { toast } from "@/lib/toast";

// "" sentinels mean "no filter / no sort"
type SortBy = "reviews" | "locations" | "";
type SortOrder = "asc" | "desc";
type UserTypeFilter = "individual" | "organization" | "";
type RoleFilter = "admin" | "user" | "";

function SortableHeader({
  label,
  column,
  sortBy,
  sortOrder,
  onSort,
}: {
  label: string;
  column: "reviews" | "locations";
  sortBy: SortBy;
  sortOrder: SortOrder;
  onSort: (col: SortBy, order: SortOrder) => void;
}) {
  const isActive = sortBy === column;

  // cycle: not active → desc → asc → clear
  const handleClick = useCallback(() => {
    if (!isActive) {
      onSort(column, "desc");
    } else if (sortOrder === "desc") {
      onSort(column, "asc");
    } else {
      onSort("", "desc");
    }
  }, [isActive, sortOrder, column, onSort]);

  return (
    <th>
      <button
        onClick={handleClick}
        className="flex items-center gap-1 group select-none"
        style={{
          color: isActive ? "var(--color-maroon-300)" : "inherit",
          background: "none",
          border: "none",
          padding: 0,
          cursor: "pointer",
          font: "inherit",
          fontWeight: "inherit",
        }}
        title={
          !isActive
            ? `Sort by ${label} descending`
            : sortOrder === "desc"
            ? `Sort by ${label} ascending`
            : `Clear sort`
        }
      >
        {label}
        <span
          style={{
            display: "inline-flex",
            flexDirection: "column",
            opacity: isActive ? 1 : 0.35,
            transition: "opacity 0.15s",
            marginLeft: "2px",
          }}
          className="group-hover:opacity-100"
        >
          {!isActive ? (
            <ChevronsUpDown size={12} />
          ) : sortOrder === "desc" ? (
            <ChevronDown size={12} />
          ) : (
            <ChevronUp size={12} />
          )}
        </span>
      </button>
    </th>
  );
}

export default function UsersPage() {
  const qc = useQueryClient();
  const { t, lang } = useLanguage();

  const [page, setPage]               = useState(1);
  const [search, setSearch]           = useState("");
  const [userType, setUserType]       = useState<UserTypeFilter>("");
  const [role, setRole]               = useState<RoleFilter>("");
  const [sortBy, setSortBy]           = useState<SortBy>("");
  const [sortOrder, setSortOrder]     = useState<SortOrder>("desc");
  const [toDelete, setToDelete]       = useState<AdminUser | null>(null);

  // reset to page 1 when filters/sort change so we don't land on a non-existent page
  useEffect(() => {
    setPage(1);
  }, [search, userType, role, sortBy, sortOrder]);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-users", page, search, userType, role, sortBy, sortOrder],
    queryFn: () =>
      getUsers({
        page,
        per_page: 15,
        search:     search    || undefined,
        user_type:  userType  || undefined,
        role:       role      || undefined,
        sort_by:    sortBy    || undefined,
        sort_order: sortBy ? sortOrder : undefined,
      }),
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

  const handleSort = useCallback((col: SortBy, order: SortOrder) => {
    setSortBy(col);
    setSortOrder(order);
  }, []);

  const hasActiveFilters = userType !== "" || role !== "" || sortBy !== "";

  const clearFilters = () => {
    setUserType("");
    setRole("");
    setSortBy("");
    setSortOrder("desc");
  };

  return (
    <div className="space-y-4 max-w-screen-xl">

      <div className="animate-fade-up">
        <h1
          className="font-display text-2xl font-bold tracking-tight"
          style={{ color: "var(--c-ink)" }}
        >
          {t("usr_title")}
        </h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--c-ink-muted)" }}>
          {t("usr_subtitle", { n: data?.total ?? "—" })}
        </p>
      </div>

      <div className="card p-4 animate-fade-up delay-100">
        <div className="flex flex-wrap gap-3 items-center">

          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search
              size={14}
              className="absolute start-3 top-1/2 -translate-y-1/2"
              style={{ color: "var(--c-ink-muted)" }}
            />
            <input
              className="input ps-9 h-9 text-sm w-full"
              placeholder={t("usr_search")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter size={13} style={{ color: "var(--c-ink-muted)", flexShrink: 0 }} />
            <select
              className="input h-9 text-sm pe-8 cursor-pointer"
              value={userType}
              onChange={(e) => setUserType(e.target.value as UserTypeFilter)}
              aria-label="Filter by user type"
              style={{ minWidth: "150px" }}
            >
              <option value="">
                {lang === "ar" ? "كل الأنواع" : "All Types"}
              </option>
              <option value="individual">
                {localizeUserType(lang, "individual")}
              </option>
              <option value="organization">
                {localizeUserType(lang, "organization")}
              </option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <Shield size={13} style={{ color: "var(--c-ink-muted)", flexShrink: 0 }} />
            <select
              className="input h-9 text-sm pe-8 cursor-pointer"
              value={role}
              onChange={(e) => setRole(e.target.value as RoleFilter)}
              aria-label="Filter by role"
              style={{ minWidth: "140px" }}
            >
              <option value="">
                {lang === "ar" ? "كل الأدوار" : "All Roles"}
              </option>
              <option value="admin">
                {t("usr_admin")}
              </option>
              <option value="user">
                {t("usr_user")}
              </option>
            </select>
          </div>

          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="text-xs underline underline-offset-2 whitespace-nowrap"
              style={{ color: "var(--color-maroon-300)", background: "none", border: "none", cursor: "pointer" }}
            >
              {lang === "ar" ? "مسح الفلاتر" : "Clear filters"}
            </button>
          )}
        </div>

        {hasActiveFilters && (
          <div className="flex flex-wrap gap-2 mt-3">

            {userType && (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                style={{
                  background: "rgba(128,0,0,0.12)",
                  color: "var(--color-maroon-300)",
                  border: "1px solid rgba(128,0,0,0.2)",
                }}
              >
                {userType === "organization"
                  ? <Building2 size={10} />
                  : <User size={10} />}
                {localizeUserType(lang, userType)}
                <button
                  onClick={() => setUserType("")}
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 0, lineHeight: 1 }}
                  aria-label="Remove type filter"
                >
                  ×
                </button>
              </span>
            )}

            {role && (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                style={{
                  background: "rgba(128,0,0,0.12)",
                  color: "var(--color-maroon-300)",
                  border: "1px solid rgba(128,0,0,0.2)",
                }}
              >
                <Shield size={10} />
                {role === "admin" ? t("usr_admin") : t("usr_user")}
                <button
                  onClick={() => setRole("")}
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 0, lineHeight: 1 }}
                  aria-label="Remove role filter"
                >
                  ×
                </button>
              </span>
            )}

            {sortBy && (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                style={{
                  background: "rgba(128,0,0,0.12)",
                  color: "var(--color-maroon-300)",
                  border: "1px solid rgba(128,0,0,0.2)",
                }}
              >
                {sortOrder === "desc" ? <ChevronDown size={10} /> : <ChevronUp size={10} />}
                {lang === "ar" ? "ترتيب:" : "Sort:"}{" "}
                {sortBy === "reviews"
                  ? t("usr_col_reviews")
                  : t("usr_col_locs")}{" "}
                ({sortOrder === "desc"
                  ? (lang === "ar" ? "تنازلي" : "desc")
                  : (lang === "ar" ? "تصاعدي" : "asc")})
                <button
                  onClick={() => { setSortBy(""); setSortOrder("desc"); }}
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 0, lineHeight: 1 }}
                  aria-label="Remove sort"
                >
                  ×
                </button>
              </span>
            )}
          </div>
        )}
      </div>

      <div className="card overflow-hidden animate-fade-up delay-150">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("usr_col_user")}</th>
                <th>{t("usr_col_type")}</th>

                <SortableHeader
                  label={t("usr_col_locs")}
                  column="locations"
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  onSort={handleSort}
                />

                <SortableHeader
                  label={t("usr_col_reviews")}
                  column="reviews"
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  onSort={handleSort}
                />

                <th>{t("usr_col_role")}</th>
                <th>{t("usr_col_joined")}</th>
                <th style={{ textAlign: "end" }}>{t("usr_col_actions")}</th>
              </tr>
            </thead>

            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="p-0">
                    <TableSkeleton rows={10} />
                  </td>
                </tr>
              ) : data?.users.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="text-center py-14 text-sm"
                    style={{ color: "var(--c-ink-muted)" }}
                  >
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
                          style={{
                            background: "rgba(128,0,0,0.15)",
                            border: "1px solid rgba(128,0,0,0.2)",
                            color: "var(--color-maroon-300)",
                          }}
                        >
                          {user.username[0]}
                        </div>
                        <div>
                          <div
                            className="font-medium text-sm"
                            style={{ color: "var(--c-ink)" }}
                          >
                            {user.username}
                          </div>
                          <div
                            className="text-xs"
                            style={{ color: "var(--c-ink-muted)" }}
                          >
                            {user.email}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td>
                      <span
                        className="flex items-center gap-1.5 text-xs"
                        style={{ color: "var(--c-ink-muted)" }}
                      >
                        {user.user_type === "organization" ? (
                          <Building2
                            size={12}
                            style={{ color: "var(--color-maroon-300)" }}
                          />
                        ) : (
                          <User
                            size={12}
                            style={{ color: "var(--c-ink-dim)" }}
                          />
                        )}
                        {localizeUserType(lang, user.user_type)}
                      </span>
                      {user.org_name && (
                        <span
                          className="text-xs block truncate max-w-[140px]"
                          style={{ color: "var(--c-ink-dim)" }}
                        >
                          {user.org_name}
                        </span>
                      )}
                    </td>

                    <td>
                      <span
                        className="font-mono text-sm"
                        style={{
                          color:
                            sortBy === "locations"
                              ? "var(--color-maroon-300)"
                              : "var(--c-ink)",
                          fontWeight: sortBy === "locations" ? 600 : 400,
                        }}
                      >
                        {user.location_count}
                      </span>
                    </td>

                    <td>
                      <span
                        className="font-mono text-sm"
                        style={{
                          color:
                            sortBy === "reviews"
                              ? "var(--color-maroon-300)"
                              : "var(--c-ink)",
                          fontWeight: sortBy === "reviews" ? 600 : 400,
                        }}
                      >
                        {user.review_count}
                      </span>
                    </td>

                    <td>
                      {user.is_admin ? (
                        <span className="badge badge-admin">
                          <Shield size={10} /> {t("usr_admin")}
                        </span>
                      ) : (
                        <span
                          className="text-xs"
                          style={{ color: "var(--c-ink-muted)" }}
                        >
                          {t("usr_user")}
                        </span>
                      )}
                    </td>

                    <td
                      className="text-xs font-mono"
                      style={{ color: "var(--c-ink-muted)" }}
                    >
                      {new Date(user.created_at).toLocaleDateString()}
                    </td>

                    <td>
                      <div className="flex justify-end">
                        {!user.is_admin && (
                          <button
                            onClick={() => setToDelete(user)}
                            className="btn-row row-danger"
                            aria-label={t("common_delete")}
                          >
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

        <Pagination
          page={page}
          total_pages={data?.pages ?? 1}
          onPage={setPage}
        />
      </div>

      <ConfirmModal
        open={!!toDelete}
        title={t("usr_del_title")}
        description={t("usr_del_desc", {
          username: toDelete?.username ?? "",
          email: toDelete?.email ?? "",
        })}
        loading={deleteMut.isPending}
        onConfirm={() => toDelete && deleteMut.mutate(toDelete.id)}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}