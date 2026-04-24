"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { adminLogin, setToken, getToken } from "@/lib/api";
import { Eye, EyeOff, Loader2, Sun, Moon, Globe } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Logo } from "@/components/ui/Logo";
import { toast } from "@/lib/toast";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { theme, toggleTheme } = useTheme();
  const { lang, toggleLang, t, isRTL } = useLanguage();

  useEffect(() => {
    if (getToken()) router.replace("/dashboard");
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await adminLogin(email, password);
      setToken(res.access_token);
      toast.success(`Welcome, ${res.user.username}`);
      router.push("/dashboard");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t("auth_invalid");
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{ background: "var(--c-bg)" }}
    >
      {/* Ambient glow */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(128,0,0,0.18) 0%, transparent 70%)",
          filter: "blur(80px)",
        }}
      />
      {/* Grid pattern */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(var(--c-border) 1px, transparent 1px), linear-gradient(90deg, var(--c-border) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          opacity: 0.4,
        }}
      />

      {/* Top-end controls (logical, so they flip in RTL) */}
      <div className="absolute top-4 end-4 flex items-center gap-2 z-10">
        <button onClick={toggleLang} className="toggle-pill" title="Toggle language">
          <Globe size={13} />
          <span>{lang === "en" ? "عر" : "EN"}</span>
        </button>
        <button onClick={toggleTheme} className="toggle-pill" title="Toggle theme">
          {theme === "dark" ? <Sun size={13} /> : <Moon size={13} />}
        </button>
      </div>

      {/* Card */}
      <div className="relative w-full max-w-md mx-4 animate-fade-up">
        <div className="card p-8" style={{ boxShadow: "0 20px 60px var(--c-shadow)" }}>
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
              style={{ background: "linear-gradient(135deg, #800000, #4A0000)", color: "#fff" }}
            >
              <Logo size={28} />
            </div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-center" style={{ color: "var(--c-ink)" }}>
              {t("auth_title")}
            </h1>
            <p className="text-sm mt-1 text-center" style={{ color: "var(--c-ink-muted)" }}>
              {t("auth_subtitle")}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: "var(--c-ink-muted)" }}>
                {t("auth_email")}
              </label>
              <input
                type="email"
                className="input"
                placeholder="admin@joaccess.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: "var(--c-ink-muted)" }}>
                {t("auth_password")}
              </label>
              <div className="relative">
                <input
                  type={showPass ? "text" : "password"}
                  className="input pe-11"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute end-3 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: "var(--c-ink-muted)" }}
                  aria-label={showPass ? "Hide password" : "Show password"}
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div
                className="rounded-lg px-4 py-3 text-sm"
                style={{ background: "var(--c-danger-bg)", border: "1px solid var(--c-danger-bdr)", color: "var(--c-danger)" }}
              >
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-maroon w-full justify-center py-3 text-base mt-2">
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  {t("auth_signing")}
                </>
              ) : (
                t("auth_signin")
              )}
            </button>
          </form>

          <p className="text-center text-xs mt-6" style={{ color: "var(--c-ink-dim)" }}>
            {t("auth_footer")}
          </p>
        </div>
      </div>

      {/* Silence unused-var lint for isRTL (kept in case we need it) */}
      <span className="hidden">{isRTL ? "" : ""}</span>
    </div>
  );
}
