"use client";

/**
 * toast.tsx
 * ---------
 * A minimal toast implementation with no extra dependencies.
 *
 * Why DIY instead of react-hot-toast?
 *   - We only need 3 variants (success / error / info), a portal, and an
 *     auto-dismiss timer. That's ~100 lines. Adding a package for it
 *     bloats the bundle and lets default styles leak into the design.
 *   - Styling lives in globals.css (.toast / .toast-success / …) so theme
 *     switching Just Works via CSS variables.
 *
 * Usage:
 *   import { toast, ToastContainer } from "@/lib/toast";
 *   toast.success("Verified");
 *   toast.error("Something went wrong");
 *
 * Mount <ToastContainer /> once in the app (we do it in providers.tsx).
 */

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";

type ToastKind = "success" | "error" | "info";
interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
  /** `leaving=true` triggers the exit animation before the item is removed */
  leaving?: boolean;
}

// Module-level subscription store. Each `useToasts` call subscribes and gets
// the live list. This avoids spinning up a React context for a small feature.
let listeners = new Set<(items: ToastItem[]) => void>();
let items: ToastItem[] = [];
let nextId = 1;

function emit() {
  listeners.forEach((l) => l(items));
}

function push(kind: ToastKind, message: string, timeoutMs = 3200) {
  const id = nextId++;
  items = [...items, { id, kind, message }];
  emit();
  // Schedule exit animation, then removal.
  setTimeout(() => {
    items = items.map((t) => (t.id === id ? { ...t, leaving: true } : t));
    emit();
    setTimeout(() => {
      items = items.filter((t) => t.id !== id);
      emit();
    }, 220); // matches .toast.leaving animation duration
  }, timeoutMs);
}

function dismiss(id: number) {
  items = items.map((t) => (t.id === id ? { ...t, leaving: true } : t));
  emit();
  setTimeout(() => {
    items = items.filter((t) => t.id !== id);
    emit();
  }, 220);
}

export const toast = {
  success: (message: string, timeoutMs?: number) => push("success", message, timeoutMs),
  error:   (message: string, timeoutMs?: number) => push("error", message, timeoutMs),
  info:    (message: string, timeoutMs?: number) => push("info", message, timeoutMs),
};

function useToasts() {
  const [state, setState] = useState<ToastItem[]>(items);
  useEffect(() => {
    listeners.add(setState);
    return () => { listeners.delete(setState); };
  }, []);
  return state;
}

const ICONS: Record<ToastKind, React.ComponentType<{ size?: number; className?: string }>> = {
  success: CheckCircle2,
  error: AlertTriangle,
  info: Info,
};

const ICON_COLORS: Record<ToastKind, string> = {
  success: "var(--c-success)",
  error:   "var(--c-danger)",
  info:    "var(--c-ink-muted)",
};

export function ToastContainer() {
  const [mounted, setMounted] = useState(false);
  const list = useToasts();
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center gap-2 pointer-events-none"
      aria-live="polite"
      aria-atomic="true"
    >
      {list.map((t) => {
        const Icon = ICONS[t.kind];
        return (
          <div
            key={t.id}
            className={`toast toast-${t.kind} pointer-events-auto ${t.leaving ? "leaving" : ""}`}
            role={t.kind === "error" ? "alert" : "status"}
          >
            <Icon size={15} style={{ color: ICON_COLORS[t.kind] }} />
            <span className="flex-1">{t.message}</span>
            <button
              onClick={() => dismiss(t.id)}
              className="opacity-60 hover:opacity-100 transition-opacity"
              aria-label="Dismiss"
            >
              <X size={13} />
            </button>
          </div>
        );
      })}
    </div>,
    document.body
  );
}
