"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getToken, getAdminMe, clearToken, type AdminUser } from "@/lib/api";
import { Sidebar } from "@/components/layout/Sidebar";
import { Loader2, Sun, Moon, Globe, Menu, X } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Logo } from "@/components/ui/Logo";
import { BackendSwitcher } from "@/components/ui/BackendSwitcher";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [user, setUser] = useState<AdminUser | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { theme, toggleTheme } = useTheme();
  const { lang, toggleLang } = useLanguage();

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace("/login");
      return;
    }
    setError(null);
    getAdminMe()
      .then((u) => {
        setUser(u);
        setChecking(false);
      })
      .catch((err) => {
        console.error("Dashboard profile fetch failed:", err);
        if (!getToken()) {
          router.replace("/login");
        } else {
          setError(err instanceof Error ? err.message : "Failed to connect to server");
          setChecking(false);
        }
      });
  }, [router]);

  useEffect(() => {
    setDrawerOpen(false);
  }, [children]);

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

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 text-center" style={{ background: "var(--c-bg)" }}>
        <div className="card max-w-md p-8 border border-red-500/20" style={{ boxShadow: "0 20px 60px var(--c-shadow)" }}>
          <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-950/30 flex items-center justify-center mx-auto mb-4 text-red-600 dark:text-red-400">
            <X size={24} />
          </div>
          <h2 className="text-xl font-display font-bold mb-2" style={{ color: "var(--c-ink)" }}>
            Connection Error
          </h2>
          <p className="text-sm mb-4" style={{ color: "var(--c-ink-muted)" }}>
            {error.includes("Failed to fetch") || error.includes("HTTP 502") || error.includes("HTTP 504")
              ? "Could not connect to the backend server. It may be offline or spinning up."
              : `Server returned an error: ${error}`}
          </p>
          <p className="text-xs mb-6" style={{ color: "var(--c-ink-dim)" }}>
            Note: The Render free tier backend automatically spins down after inactivity and can take up to 60 seconds to wake up.
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => {
                setChecking(true);
                setError(null);
                getAdminMe()
                  .then((u) => {
                    setUser(u);
                    setChecking(false);
                  })
                  .catch((err) => {
                    if (!getToken()) {
                      router.replace("/login");
                    } else {
                      setError(err instanceof Error ? err.message : "Failed to connect to server");
                      setChecking(false);
                    }
                  });
              }}
              className="btn-maroon px-5 py-2 text-sm"
            >
              Retry Connection
            </button>
            <button
              onClick={() => {
                clearToken();
                router.replace("/login");
              }}
              className="toggle-pill border border-gray-300 dark:border-zinc-700 px-5 py-2 text-sm"
            >
              Go to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <div className="hidden lg:block sticky top-0 h-screen">
        <Sidebar />
      </div>

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
        <header
          className="h-14 px-4 lg:px-6 flex items-center justify-between shrink-0 sticky top-0 z-30"
          style={{ background: "var(--c-surface)", borderBottom: "1px solid var(--c-border)" }}
        >
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

          <div className="flex items-center gap-2">
            <BackendSwitcher />
            <button onClick={toggleLang} className="toggle-pill" title="Toggle language">
              <Globe size={13} />
              <span>{lang === "en" ? "عر" : "EN"}</span>
            </button>
            <button onClick={toggleTheme} className="toggle-pill" title="Toggle theme">
              {theme === "dark" ? <Sun size={13} /> : <Moon size={13} />}
            </button>

            <div className="w-px h-5 mx-1 hidden sm:block" style={{ background: "var(--c-border)" }} />

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

            <span className="hidden">{drawerOpen ? <X size={0} /> : null}</span>
          </div>
        </header>

        <div className="flex-1 p-4 lg:p-6">{children}</div>
      </main>
    </div>
  );
}
