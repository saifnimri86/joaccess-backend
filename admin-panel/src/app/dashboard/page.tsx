"use client";

import { useQuery } from "@tanstack/react-query";
import { getDashboardStats } from "@/lib/api";
import { StatCard } from "@/components/ui/StatCard";
import { StatCardSkeleton } from "@/components/ui/Skeleton";
import {
  Users, MapPin, CheckCircle2, Clock,
  MessageSquare, AlertTriangle, TrendingUp, Star, BarChart3,
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTheme } from "@/contexts/ThemeContext";

// Maroon-leaning palette — no more out-of-theme blues/purples
const CATEGORY_COLORS = [
  "#800000","#9A1C1C","#B33838","#D97070","#F4E3E3",
  "#4A0000","#600000","#D4A045","#6B8E4E","#5F4E2B","#8B5A2B","#A0522D",
];

const RADIAN = Math.PI / 180;
function CustomPieLabel({
  cx, cy, midAngle, innerRadius, outerRadius, percent,
}: {
  cx?: number; cy?: number; midAngle?: number;
  innerRadius?: number; outerRadius?: number; percent?: number;
}) {
  if (cx == null || cy == null || midAngle == null || innerRadius == null || outerRadius == null) return null;
  if (!percent || percent < 0.05) return null;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central" fontSize={10} fontWeight={600}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
}

export default function DashboardPage() {
  const { t } = useLanguage();
  const { theme } = useTheme();
  const pieStroke = theme === "dark" ? "#181212" : "#ffffff";

  const { data, isLoading, error } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: getDashboardStats,
  });

  const monthlyLocData   = data?.monthly_locations.map(([month, count]) => ({ month, count })) ?? [];
  const monthlyUsersData = data?.monthly_users.map(([month, count]) => ({ month, users: count })) ?? [];
  const categoryData     = data?.categories.map(([name, value]) => ({ name, value })) ?? [];
  const ratingData       = data?.rating_distribution.map(([name, value]) => ({ name, value })) ?? [];

  return (
    <div className="space-y-6 max-w-screen-xl">
      {/* Header */}
      <div className="animate-fade-up">
        <h1 className="font-display text-2xl font-bold tracking-tight" style={{ color: "var(--c-ink)" }}>
          {t("dash_title")}
        </h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--c-ink-muted)" }}>
          {t("dash_subtitle")}
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard label={t("dash_users")}     value={data?.total_users ?? 0}          icon={Users}          tone="maroon"  delay={0} />
            <StatCard label={t("dash_locations")} value={data?.total_locations ?? 0}      icon={MapPin}         tone="maroon"  delay={60} />
            <StatCard label={t("dash_verified")}  value={data?.verified_locations ?? 0}   icon={CheckCircle2}   tone="success" delay={120} />
            <StatCard label={t("dash_pending")}   value={data?.unverified_locations ?? 0} icon={Clock}          tone="warn"    delay={180} />
            <StatCard label={t("dash_reviews")}   value={data?.total_reviews ?? 0}        icon={MessageSquare}  tone="muted"   delay={240} />
            <StatCard label={t("dash_reports")}   value={data?.total_reports ?? 0}        icon={AlertTriangle}  tone="danger"  delay={300} />
          </>
        )}
      </div>

      {/* Secondary stats */}
      {data && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 animate-fade-up delay-200">
          <div className="card p-5 flex items-center gap-4">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: "rgba(128,0,0,0.12)", border: "1px solid rgba(128,0,0,0.25)" }}
            >
              <TrendingUp size={18} style={{ color: "var(--color-maroon-300)" }} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--c-ink-muted)" }}>
                {t("dash_verif_rate")}
              </p>
              <p className="stat-number text-2xl tabular">{data.verification_rate.toFixed(1)}%</p>
            </div>
          </div>
          <div className="card p-5 flex items-center gap-4">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: "var(--c-warn-bg)", border: "1px solid var(--c-warn-bdr)" }}
            >
              <Star size={18} style={{ color: "var(--c-warn)" }} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--c-ink-muted)" }}>
                {t("dash_avg_rating")}
              </p>
              <p className="stat-number text-2xl tabular">
                {data.avg_rating.toFixed(1)}
                <span className="text-sm font-body font-normal" style={{ color: "var(--c-ink-muted)" }}> / 5</span>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-fade-up delay-300">
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 size={15} style={{ color: "var(--color-maroon-300)" }} />
            <h3 className="section-title">{t("dash_monthly_locs")}</h3>
          </div>
          {isLoading ? <div className="skeleton h-48 w-full" /> : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={monthlyLocData}>
                <defs>
                  <linearGradient id="locGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#800000" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#800000" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Area type="monotone" dataKey="count" stroke="#800000" strokeWidth={2} fill="url(#locGrad)" name="Locations" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Users size={15} style={{ color: "var(--color-maroon-300)" }} />
            <h3 className="section-title">{t("dash_monthly_users")}</h3>
          </div>
          {isLoading ? <div className="skeleton h-48 w-full" /> : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={monthlyUsersData}>
                <defs>
                  <linearGradient id="userGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#B33838" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#B33838" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Area type="monotone" dataKey="users" stroke="#B33838" strokeWidth={2} fill="url(#userGrad)" name="Users" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-fade-up delay-400">
        <div className="card p-5">
          <h3 className="section-title mb-4">{t("dash_categories")}</h3>
          {isLoading ? <div className="skeleton h-52 w-full" /> : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={categoryData} cx="50%" cy="44%" innerRadius={55} outerRadius={90}
                     dataKey="value" labelLine={false} label={CustomPieLabel}
                     stroke={pieStroke} strokeWidth={2}>
                  {categoryData.map((_, i) => (
                    <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend
                  iconType="circle" iconSize={8}
                  formatter={(v) => <span style={{ color: "var(--c-ink-muted)", fontSize: 11 }}>{v}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card p-5">
          <h3 className="section-title mb-4">{t("dash_rating_dist")}</h3>
          {isLoading ? <div className="skeleton h-52 w-full" /> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={ratingData} barSize={32}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip cursor={false} />
                <Bar dataKey="value" fill="#800000" radius={[5, 5, 0, 0]} name="Reviews" activeBar={{ fill: "#B33838" }} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Top + Recent */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-fade-up delay-500">
        <div className="card overflow-hidden">
          <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--c-border)" }}>
            <h3 className="section-title">{t("dash_top_locations")}</h3>
          </div>
          <div>
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="px-5 py-3 flex items-center gap-3" style={{ borderBottom: "1px solid var(--c-row-border)" }}>
                    <div className="skeleton h-4 w-4 shrink-0" />
                    <div className="skeleton h-4 flex-1" />
                    <div className="skeleton h-4 w-16 shrink-0" />
                  </div>
                ))
              : data?.top_locations.slice(0, 6).map((loc, i) => (
                  <div
                    key={i}
                    className="px-5 py-3 flex items-center gap-3"
                    style={{ borderBottom: "1px solid var(--c-row-border)" }}
                  >
                    <span className="font-mono text-xs w-5 shrink-0" style={{ color: "var(--c-ink-dim)" }}>
                      #{i + 1}
                    </span>
                    <span className="text-sm flex-1 truncate" style={{ color: "var(--c-ink)" }}>
                      {loc.name}
                    </span>
                    <span className="text-xs font-mono" style={{ color: "var(--c-warn)" }}>★ {loc.avg_rating.toFixed(1)}</span>
                    <span className="text-xs font-mono w-14 text-end" style={{ color: "var(--c-ink-muted)" }}>
                      {loc.review_count} {t("common_rev_per_abbr")}
                    </span>
                  </div>
                ))}
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--c-border)" }}>
            <h3 className="section-title">{t("dash_recent_reviews")}</h3>
          </div>
          <div>
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="px-5 py-3 space-y-1.5" style={{ borderBottom: "1px solid var(--c-row-border)" }}>
                    <div className="skeleton h-3.5 w-3/4" />
                    <div className="skeleton h-3 w-1/2" />
                  </div>
                ))
              : data?.recent_reviews.slice(0, 6).map((r) => (
                  <div key={r.id} className="px-5 py-3" style={{ borderBottom: "1px solid var(--c-row-border)" }}>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-sm font-medium truncate max-w-[60%]" style={{ color: "var(--c-ink)" }}>
                        {r.location_name}
                      </span>
                      <span className="text-xs font-mono" style={{ color: "var(--c-warn)" }}>{"★".repeat(r.rating)}</span>
                    </div>
                    <p className="text-xs truncate" style={{ color: "var(--c-ink-muted)" }}>
                      {r.user} · {r.comment?.slice(0, 60) || t("rev_no_comment")}
                    </p>
                  </div>
                ))}
          </div>
        </div>
      </div>

      {error && (
        <div className="card p-4 text-sm" style={{ borderColor: "var(--c-danger-bdr)", color: "var(--c-danger)" }}>
          {t("dash_error")}
        </div>
      )}
    </div>
  );
}
