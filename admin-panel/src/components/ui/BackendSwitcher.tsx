"use client";

import { useEffect, useState } from "react";
import { Server } from "lucide-react";
import { getBackendEnv, setBackendEnv, type BackendEnv } from "@/lib/api";

export function BackendSwitcher() {
  const [env, setEnv] = useState<BackendEnv | null>(null);

  useEffect(() => {
    setEnv(getBackendEnv());
  }, []);

  if (!env) {
    // Avoid SSR/CSR mismatch — render nothing until hydrated
    return null;
  }

  const isProd = env === "production";
  const label = isProd ? "PROD" : "STAGING";
  const next: BackendEnv = isProd ? "staging" : "production";
  const dotColor = isProd ? "#6B8E4E" : "#D4A045";

  function toggle() {
    setBackendEnv(next);
    // Full reload so all in-flight queries / cached state refetch against the new BASE.
    window.location.reload();
  }

  return (
    <button
      onClick={toggle}
      className="toggle-pill"
      title={`Backend: ${env} — click to switch to ${next}`}
    >
      <Server size={13} />
      <span
        className="inline-block w-1.5 h-1.5 rounded-full"
        style={{ background: dotColor }}
      />
      <span>{label}</span>
    </button>
  );
}
