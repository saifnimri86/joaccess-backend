"use client";

import { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getLocations, verifyLocation, unverifyLocation, deleteLocation,
  type Location,
} from "@/lib/api";
import { localizeCategory } from "@/lib/i18n";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { PhotoCarouselModal } from "@/components/ui/PhotoCarouselModal";
import { Pagination } from "@/components/ui/Pagination";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { MapPin, CheckCircle2, XCircle, Trash2, Search, Clock, Images } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTheme } from "@/contexts/ThemeContext";
import { toast } from "@/lib/toast";

// Leaflet must be dynamically imported — it requires `window`
const LocationsMap = dynamic(
  () => import("@/components/ui/LocationsMap").then((m) => m.LocationsMap),
  { ssr: false, loading: () => <div className="skeleton w-full" style={{ height: 380, borderRadius: 12 }} /> }
);

const CATEGORIES = [
  "restaurant","government","park","shopping","healthcare",
  "education","hotels","mosque","library","gym","pharmacy",
];

// Stable query key for the full location cache
const ALL_LOCS_KEY = ["admin-locations-all"] as const;

type CacheShape = { locations: Location[]; total: number; pages: number };

export default function LocationsPage() {
  const qc = useQueryClient();
  const { t, lang } = useLanguage();
  const { theme } = useTheme();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [category, setCategory] = useState("");
  const [verified, setVerified] = useState<"" | "true" | "false">("");
  const [toDelete, setToDelete] = useState<Location | null>(null);
  const [photoLoc, setPhotoLoc] = useState<Location | null>(null);

  // Debounce search by 350 ms — table only fires a request after typing stops
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(id);
  }, [search]);

  useEffect(() => { setPage(1); }, [debouncedSearch, category, verified]);

  // Paginated table query — uses debouncedSearch to avoid per-keystroke requests
  const { data, isLoading } = useQuery({
    queryKey: ["admin-locations", page, debouncedSearch, category, verified],
    queryFn: () =>
      getLocations({
        page,
        per_page: 15,
        search: debouncedSearch || undefined,
        category: category || undefined,
        verified: verified === "" ? undefined : verified === "true",
      }),
    placeholderData: (prev) => prev,
  });

  // Full location cache — fetched once per browser session, never automatically refetched.
  // staleTime: Infinity means React Query will never consider it stale and trigger a background refetch.
  // gcTime: Infinity prevents eviction from the cache while the tab is open.
  const { data: allData } = useQuery<CacheShape>({
    queryKey: ALL_LOCS_KEY,
    queryFn: () => getLocations({ page: 1, per_page: 2000 }),
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const allCachedLocations = allData?.locations ?? [];
  const isFiltered = !!(search || category || verified);

  // Client-side filtering for the map — instant, no network round-trip.
  // Uses the real-time `search` value (not debounced) so pins update as you type.
  const mapLocations = useMemo(() => {
    if (!isFiltered) return allCachedLocations;
    const q = search.toLowerCase();
    return allCachedLocations.filter((loc) => {
      if (search) {
        const hit =
          loc.name.toLowerCase().includes(q) ||
          (loc.name_ar ?? "").toLowerCase().includes(q) ||
          (loc.address ?? "").toLowerCase().includes(q);
        if (!hit) return false;
      }
      if (category && loc.category !== category) return false;
      if (verified === "true" && !loc.is_verified) return false;
      if (verified === "false" && loc.is_verified) return false;
      return true;
    });
  }, [allCachedLocations, search, category, verified, isFiltered]);

  // Optimistically patch the full cache after mutations so the map
  // reflects changes immediately without a network refetch.
  function patchCache(updater: (locs: Location[]) => Location[]) {
    qc.setQueryData<CacheShape>(ALL_LOCS_KEY, (old) => {
      if (!old) return old;
      return { ...old, locations: updater(old.locations) };
    });
  }

  const verifyMut = useMutation({
    mutationFn: (id: number) => verifyLocation(id),
    onSuccess: (_, id) => {
      toast.success(t("loc_verified_f"));
      patchCache((locs) => locs.map((l) => l.id === id ? { ...l, is_verified: true } : l));
      qc.invalidateQueries({ queryKey: ["admin-locations"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const unverifyMut = useMutation({
    mutationFn: (id: number) => unverifyLocation(id),
    onSuccess: (_, id) => {
      toast.success(t("loc_unverify"));
      patchCache((locs) => locs.map((l) => l.id === id ? { ...l, is_verified: false } : l));
      qc.invalidateQueries({ queryKey: ["admin-locations"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteLocation(id),
    onSuccess: (_, id) => {
      toast.success(t("common_delete"));
      setToDelete(null);
      patchCache((locs) => locs.filter((l) => l.id !== id));
      qc.invalidateQueries({ queryKey: ["admin-locations"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4 max-w-screen-xl">
      <div className="flex items-center justify-between animate-fade-up">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight" style={{ color: "var(--c-ink)" }}>
            {t("loc_title")}
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--c-ink-muted)" }}>
            {t("loc_subtitle", { n: data?.total ?? "—" })}
          </p>
        </div>
      </div>

      {/* Map */}
      <div className="card overflow-hidden animate-fade-up delay-75" style={{ padding: 0 }}>
        <div className="px-4 pt-3 pb-2 flex items-center justify-between" style={{ borderBottom: "1px solid var(--c-border)" }}>
          <div className="flex items-center gap-2">
            <MapPin size={14} style={{ color: "var(--color-maroon-300)" }} />
            <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--c-ink-muted)" }}>
              {isFiltered ? mapLocations.length : allCachedLocations.length} {t("loc_title").toLowerCase()} {isFiltered ? "matched" : "total"}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs" style={{ color: "var(--c-ink-dim)" }}>
            <span className="flex items-center gap-1">
              <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: "#800000" }} />
              {t("loc_verified_f")}
            </span>
            <span className="flex items-center gap-1">
              <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: "#B33838" }} />
              {t("loc_pending_f")}
            </span>
          </div>
        </div>
        <LocationsMap
          locations={mapLocations}
          isFiltered={isFiltered}
          theme={theme}
        />
      </div>

      {/* Filters */}
      <div className="card p-4 animate-fade-up delay-100">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-52">
            <Search size={14} className="absolute start-3 top-1/2 -translate-y-1/2" style={{ color: "var(--c-ink-muted)" }} />
            <input
              className="input ps-9 h-9 text-sm"
              placeholder={t("loc_search")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select className="input h-9 text-sm w-44" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">{t("loc_all_cats")}</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{localizeCategory(lang, c)}</option>
            ))}
          </select>
          <select className="input h-9 text-sm w-40" value={verified} onChange={(e) => setVerified(e.target.value as "" | "true" | "false")}>
            <option value="">{t("loc_all_status")}</option>
            <option value="true">{t("loc_verified_f")}</option>
            <option value="false">{t("loc_pending_f")}</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden animate-fade-up delay-150">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("loc_col_name")}</th>
                <th>{t("loc_col_cat")}</th>
                <th>{t("loc_col_creator")}</th>
                <th>{t("loc_col_rating")}</th>
                <th>{t("loc_col_status")}</th>
                <th>{t("loc_col_added")}</th>
                <th style={{ textAlign: "end" }}>{t("loc_col_actions")}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="p-0"><TableSkeleton rows={10} /></td></tr>
              ) : data?.locations.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-14 text-sm" style={{ color: "var(--c-ink-muted)" }}>
                    <MapPin size={28} className="mx-auto mb-3 opacity-30" />
                    {t("loc_empty")}
                  </td>
                </tr>
              ) : (
                data?.locations.map((loc) => (
                  <tr key={loc.id}>
                    <td>
                      <div className="font-medium max-w-[200px] truncate" style={{ color: "var(--c-ink)" }}>{loc.name}</div>
                      {loc.address && (
                        <div className="text-xs truncate max-w-[200px]" style={{ color: "var(--c-ink-muted)" }}>{loc.address}</div>
                      )}
                    </td>
                    <td>
                      <span className="text-xs px-2 py-0.5 rounded-md" style={{ background: "rgba(128,0,0,0.1)", color: "var(--c-ink-muted)" }}>
                        {localizeCategory(lang, loc.category)}
                      </span>
                    </td>
                    <td>
                      <div className="text-sm" style={{ color: "var(--c-ink)" }}>{loc.creator}</div>
                      <div className="text-xs capitalize" style={{ color: "var(--c-ink-muted)" }}>{loc.creator_type}</div>
                    </td>
                    <td>
                      <span className="font-mono text-sm" style={{ color: "var(--c-warn)" }}>★ {loc.avg_rating.toFixed(1)}</span>
                      <span className="text-xs ms-1" style={{ color: "var(--c-ink-muted)" }}>({loc.review_count})</span>
                    </td>
                    <td>
                      {loc.is_verified ? (
                        <span className="badge badge-verified"><CheckCircle2 size={10} /> {t("loc_verified_f")}</span>
                      ) : (
                        <span className="badge badge-pending"><Clock size={10} /> {t("loc_pending_f")}</span>
                      )}
                    </td>
                    <td className="text-xs font-mono" style={{ color: "var(--c-ink-muted)" }}>
                      {new Date(loc.created_at).toLocaleDateString()}
                    </td>
                    <td>
                      <div className="flex items-center gap-1.5 justify-end">
                        {loc.photos.length > 0 && (
                          <button onClick={() => setPhotoLoc(loc)} className="btn-row" aria-label="View photos">
                            <Images size={13} />
                            <span className="font-mono text-[10px]">{loc.photos.length}</span>
                          </button>
                        )}
                        {loc.is_verified ? (
                          <button onClick={() => unverifyMut.mutate(loc.id)} disabled={unverifyMut.isPending} className="btn-row row-warn">
                            <XCircle size={13} /> {t("loc_unverify")}
                          </button>
                        ) : (
                          <button onClick={() => verifyMut.mutate(loc.id)} disabled={verifyMut.isPending} className="btn-row row-success">
                            <CheckCircle2 size={13} /> {t("loc_verify")}
                          </button>
                        )}
                        <button onClick={() => setToDelete(loc)} className="btn-row row-danger" aria-label={t("common_delete")}>
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
        title={t("loc_del_title")}
        description={t("loc_del_desc", { name: toDelete?.name ?? "" })}
        loading={deleteMut.isPending}
        onConfirm={() => toDelete && deleteMut.mutate(toDelete.id)}
        onCancel={() => setToDelete(null)}
      />

      <PhotoCarouselModal
        open={!!photoLoc}
        photos={photoLoc?.photos ?? []}
        locationName={photoLoc?.name ?? ""}
        onClose={() => setPhotoLoc(null)}
      />
    </div>
  );
}
