"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, MapPin, Users, MessageSquare,
  AlertTriangle, Brain, LogOut,
} from "lucide-react";
import { clearToken } from "@/lib/api";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTheme } from "@/contexts/ThemeContext";
import { Logo } from "@/components/ui/Logo";
import { toast } from "@/lib/toast";

const NAV = [
  { href: "/dashboard",             icon: LayoutDashboard, labelKey: "nav_dashboard" as const },
  { href: "/dashboard/locations",   icon: MapPin,          labelKey: "nav_locations" as const },
  { href: "/dashboard/users",       icon: Users,           labelKey: "nav_users"     as const },
  { href: "/dashboard/reviews",     icon: MessageSquare,   labelKey: "nav_reviews"   as const },
  { href: "/dashboard/reports",     icon: AlertTriangle,   labelKey: "nav_reports"   as const },
  { href: "/dashboard/ai-insights", icon: Brain,           labelKey: "nav_ai"        as const },
];

export function Sidebar({ onNavigate }: { onNavigate?: () => void } = {}) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useLanguage();
  const { theme } = useTheme();

  function logout() {
    clearToken();
    toast.info(t("nav_signout"));
    router.push("/login");
  }

  return (
    <aside
      className="w-60 shrink-0 h-full flex flex-col"
      style={{
        background: "var(--c-surface)",
        borderInlineEnd: "1px solid var(--c-border)",
      }}
    >
      {/* Brand */}
      <div className="px-5 py-5 flex items-center gap-3" style={{ borderBottom: "1px solid var(--c-border)" }}>
        <Logo size={56} className="shrink-0" style={{ color: theme === "dark" ? "#B33838" : "#800000" }} />
        <div>
          <p className="font-display font-bold text-sm leading-none" style={{ color: "var(--c-ink)" }}>
            JOAccess
          </p>
          <p className="text-[10px] mt-1 font-mono uppercase tracking-widest" style={{ color: "var(--c-ink-dim)" }}>
            {t("nav_admin_label")}
          </p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV.map(({ href, icon: Icon, labelKey }) => {
          const exact = href === "/dashboard";
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              className={`sidebar-nav-link ${active ? "active" : ""}`}
            >
              <Icon size={16} className="shrink-0" />
              <span className="flex-1">{t(labelKey)}</span>
            </Link>
          );
        })}
      </nav>

      {/* Signout */}
      <div className="px-3 py-4" style={{ borderTop: "1px solid var(--c-border)" }}>
        <button onClick={logout} className="btn-signout">
          <LogOut size={15} className="shrink-0" />
          <span>{t("nav_signout")}</span>
        </button>
      </div>
    </aside>
  );
}
