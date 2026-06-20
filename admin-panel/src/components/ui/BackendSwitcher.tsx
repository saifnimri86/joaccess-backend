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
    // avoid ssr/csr mismatch
    return null;
  }

  const isProd = env === "production";
  const label = isProd ? "PROD" : "LOCAL";
  const next: BackendEnv = isProd ? "local" : "production";
  const dotColor = isProd ? "#6B8E4E" : "#3b82f6";

  function toggle() {
    setBackendEnv(next);
    // full reload so cached queries refetch against the new base
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
