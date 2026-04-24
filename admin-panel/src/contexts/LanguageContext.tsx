"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { translate, type Lang, type TranslationKey } from "@/lib/i18n";

interface LangCtx {
  lang: Lang;
  isRTL: boolean;
  toggleLang: () => void;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LangCtx>({
  lang: "en",
  isRTL: false,
  toggleLang: () => {},
  t: (key) => key,
});

function applyLang(l: Lang) {
  const html = document.documentElement;
  html.lang = l;
  html.dir = l === "ar" ? "rtl" : "ltr";
  html.classList.toggle("rtl", l === "ar");
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Lang>("en");

  useEffect(() => {
    // Pre-hydration script already set <html>; just mirror to state.
    const isAr = document.documentElement.classList.contains("rtl");
    setLang(isAr ? "ar" : "en");
  }, []);

  function toggleLang() {
    const next: Lang = lang === "en" ? "ar" : "en";
    setLang(next);
    localStorage.setItem("joa-lang", next);
    applyLang(next);
  }

  function t(key: TranslationKey, vars?: Record<string, string | number>) {
    return translate(lang, key, vars);
  }

  return (
    <LanguageContext.Provider value={{ lang, isRTL: lang === "ar", toggleLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
