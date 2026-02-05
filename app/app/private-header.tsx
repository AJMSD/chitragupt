"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  IconGlobe,
  IconHeart,
  IconPower,
  IconRefresh,
} from "@/app/components/icons";
import type { DiskInfo, DisksResponse, MetricsResponse } from "@/lib/types";

const POLL_INTERVAL_MS = 1000;
const WARNING_THRESHOLDS = {
  cpu: 90,
  memory: 90,
  disk: 85,
};

type StatusLevel = "ok" | "warn" | "error" | "idle";

function StatusHearts({ level, sizeClass = "h-10 w-10" }: { level: StatusLevel; sizeClass?: string }) {
  const color =
    level === "ok"
      ? "text-emerald-300"
      : level === "warn"
      ? "text-amber-300"
      : level === "error"
      ? "text-rose-400"
      : "text-slate-500/40";

  const count =
    level === "ok" ? 3 : level === "warn" ? 2 : level === "error" ? 1 : 3;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {Array.from({ length: count }, (_, index) => (
        <IconHeart key={`${level}-${index}`} className={`${sizeClass} ${color}`} />
      ))}
    </div>
  );
}

export default function PrivateHeader() {
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
  const [disks, setDisks] = useState<DiskInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchStatus = useCallback(async (manual = false) => {
    if (manual) setIsRefreshing(true);
    try {
      const [metricsRes, disksRes] = await Promise.all([
        fetch("/api/public/metrics", { cache: "no-store" }),
        fetch("/api/public/disks", { cache: "no-store" }),
      ]);

      if (!metricsRes.ok || !disksRes.ok) {
        throw new Error("Failed to load metrics");
      }

      const metricsData = (await metricsRes.json()) as MetricsResponse;
      const disksData = (await disksRes.json()) as DisksResponse;

      setMetrics(metricsData);
      setDisks(disksData.disks ?? []);
      setError(null);
      setLastUpdated(new Date());
    } catch {
      setError("Unable to reach the ops agent.");
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const startPolling = async () => {
      if (!mounted) return;
      await fetchStatus();
      const interval = setInterval(() => {
        if (!mounted) return;
        void fetchStatus();
      }, POLL_INTERVAL_MS);

      return () => clearInterval(interval);
    };

    let cleanup: (() => void) | null = null;
    void startPolling().then((stop) => {
      cleanup = stop ?? null;
    });

    return () => {
      mounted = false;
      if (cleanup) cleanup();
    };
  }, [fetchStatus]);

  const statusLevel = useMemo<StatusLevel>(() => {
    if (error) return "error";
    if (!metrics) return "idle";
    const hasWarning =
      metrics.cpu.usagePercent >= WARNING_THRESHOLDS.cpu ||
      metrics.memory.usedPercent >= WARNING_THRESHOLDS.memory ||
      disks.some((disk) => disk.usedPercent >= WARNING_THRESHOLDS.disk);
    return hasWarning ? "warn" : "ok";
  }, [error, metrics, disks]);

  const updatedLabel = lastUpdated ? lastUpdated.toLocaleTimeString() : "--";

  return (
    <header className="flex flex-col gap-6 rounded-[32px] border border-orange-500/20 bg-[#120c08]/80 p-8 shadow-[0_20px_60px_rgba(14,8,4,0.65)] md:flex-row md:items-center md:justify-between motion-safe:animate-[fade-up_0.6s_ease-out]">
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.4em] text-amber-200/70">
          AJMSD OPS
        </p>
        <h1 className="font-[var(--font-display)] text-2xl text-amber-100 md:text-3xl">
          Private Command Deck
        </h1>
        <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.3em] text-amber-200/70">
          <span>Updated {updatedLabel}</span>
          <button
            className="flex h-9 w-9 items-center justify-center rounded-full border border-orange-400/40 bg-orange-400/10 text-orange-100 transition hover:border-orange-300 hover:bg-orange-400/20"
            type="button"
            onClick={() => void fetchStatus(true)}
            disabled={isRefreshing}
            aria-label="Refresh status"
            title="Refresh status"
          >
            <IconRefresh className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <StatusHearts level={statusLevel} sizeClass="h-11 w-11" />
        <Link
          className="flex h-11 w-11 items-center justify-center rounded-full border border-orange-400/50 bg-orange-400/10 text-orange-100 transition hover:border-orange-300 hover:bg-orange-400/20"
          href="/"
          aria-label="Public dashboard"
          title="Public dashboard"
        >
          <IconGlobe className="h-5 w-5" />
          <span className="sr-only">Public dashboard</span>
        </Link>
        <form action="/api/auth/logout" method="post">
          <button
            className="flex h-11 w-11 items-center justify-center rounded-full border border-orange-400/50 bg-orange-400/10 text-orange-100 transition hover:border-orange-300 hover:bg-orange-400/20"
            type="submit"
            aria-label="Sign out"
            title="Sign out"
          >
            <IconPower className="h-5 w-5" />
            <span className="sr-only">Sign out</span>
          </button>
        </form>
      </div>
    </header>
  );
}
