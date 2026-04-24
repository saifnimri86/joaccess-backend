"use client";

import { createContext, useContext, useEffect, useState } from "react";

type Theme = "dark" | "light";

interface ThemeCtx {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeCtx>({ theme: "dark", toggleTheme: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Default to "dark". The pre-hydration script in layout.tsx already set
  // `html.light` if needed, so we just read from the DOM on mount.
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const isLight = document.documentElement.classList.contains("light");
    setTheme(isLight ? "light" : "dark");
  }, []);

  function toggleTheme() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("joa-theme", next);
    document.documentElement.classList.toggle("light", next === "light");
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
