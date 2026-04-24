"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getToken, getAdminMe, type AdminUser } from "@/lib/api";
import { Sidebar } from "@/components/layout/Sidebar";
import { Loader2, Sun, Moon, Globe, Menu, X } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Logo } from "@/components/ui/Logo";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [user, setUser] = useState<AdminUser | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const { lang, toggleLang } = useLanguage();

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace("/login");
      return;
    }
    getAdminMe()
      .then((u) => {
        setUser(u);
        setChecking(false);
      })
      .catch(() => {
        router.replace("/login");
      });
  }, [router]);

  // Close drawer on route change (parent re-renders with new children)
  useEffect(() => {
    setDrawerOpen(false);
  }, [children]);

  // ESC closes drawer
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--c-bg)" }}>
        <Loader2 size={22} className="animate-spin" style={{ color: "var(--color-maroon-300)" }} />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <div className="hidden lg:block sticky top-0 h-screen">
        <Sidebar />
      </div>

      {/* Mobile drawer */}
      {drawerOpen && (
        <>
          <div className="drawer-backdrop lg:hidden" onClick={() => setDrawerOpen(false)} />
          <div
            className="fixed inset-y-0 start-0 z-50 lg:hidden animate-slide-in"
            style={{ opacity: 0, animationFillMode: "forwards" }}
          >
            <Sidebar onNavigate={() => setDrawerOpen(false)} />
          </div>
        </>
      )}

      <main className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header
          className="h-14 px-4 lg:px-6 flex items-center justify-between shrink-0 sticky top-0 z-30"
          style={{ background: "var(--c-surface)", borderBottom: "1px solid var(--c-border)" }}
        >
          {/* Mobile: hamburger + logo; Desktop: spacer */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setDrawerOpen(true)}
              className="btn-row lg:hidden !p-2"
              aria-label="Open menu"
            >
              <Menu size={16} />
            </button>
            <div className="flex items-center gap-2 lg:hidden">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, #800000, #4A0000)", color: "#fff" }}
              >
                <Logo size={16} />
              </div>
              <span className="font-display font-bold text-sm" style={{ color: "var(--c-ink)" }}>
                JOAccess
              </span>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2">
            <button onClick={toggleLang} className="toggle-pill" title="Toggle language">
              <Globe size={13} />
              <span>{lang === "en" ? "عر" : "EN"}</span>
            </button>
            <button onClick={toggleTheme} className="toggle-pill" title="Toggle theme">
              {theme === "dark" ? <Sun size={13} /> : <Moon size={13} />}
            </button>

            <div className="w-px h-5 mx-1 hidden sm:block" style={{ background: "var(--c-border)" }} />

            {/* User — hidden on very small screens */}
            <div className="hidden sm:flex items-center gap-2.5">
              <div className="text-end">
                <p className="text-xs font-semibold leading-none" style={{ color: "var(--c-ink)" }}>
                  {user?.username}
                </p>
                <p className="text-[10px] mt-0.5" style={{ color: "var(--c-ink-muted)" }}>
                  {user?.email}
                </p>
              </div>
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold font-display uppercase shrink-0"
                style={{
                  background: "rgba(128,0,0,0.15)",
                  border: "1px solid rgba(128,0,0,0.25)",
                  color: "var(--color-maroon-300)",
                }}
              >
                {user?.username?.[0] ?? "A"}
              </div>
            </div>

            {/* Close-drawer helper on mobile when open (unused visually but keeps React happy) */}
            <span className="hidden">{drawerOpen ? <X size={0} /> : null}</span>
          </div>
        </header>

        <div className="flex-1 p-4 lg:p-6">{children}</div>
      </main>
    </div>
  );
}
