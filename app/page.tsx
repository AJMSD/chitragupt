"use client";

import { useEffect, useMemo, useState } from "react";
import type { DiskInfo, DisksResponse, MetricsResponse } from "@/lib/types";

const POLL_INTERVAL_MS = 5000;
const WARNING_THRESHOLDS = {
  cpu: 90,
  memory: 90,
  disk: 85,
};

const STORAGE_MOUNT_PREFIX = "/mnt/";

function getDiskLabel(mount: string): string {
  if (mount === "/") return "laptop";
  if (mount.startsWith(STORAGE_MOUNT_PREFIX)) {
    const label = mount.slice(STORAGE_MOUNT_PREFIX.length);
    return label.length > 0 ? label : mount;
  }
  return mount;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) {
    return "--";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatUptime(seconds: number): string {
  if (!Number.isFinite(seconds)) {
    return "--";
  }

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0 || days > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);

  return parts.join(" ");
}

type StatCardProps = {
  label: string;
  value: string;
  detail?: string;
};

type UsageRingProps = {
  percent: number;
};

function UsageRing({ percent }: UsageRingProps) {
  const clamped = Number.isFinite(percent) ? Math.min(Math.max(percent, 0), 100) : 0;
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <svg className="h-16 w-16" viewBox="0 0 64 64" role="img" aria-label={`Used ${clamped.toFixed(0)} percent`}>
      <circle
        cx="32"
        cy="32"
        r={radius}
        stroke="rgba(148,163,184,0.3)"
        strokeWidth="6"
        fill="none"
      />
      <circle
        cx="32"
        cy="32"
        r={radius}
        stroke="rgba(251,191,36,0.9)"
        strokeWidth="6"
        fill="none"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 32 32)"
      />
      <text
        x="32"
        y="36"
        textAnchor="middle"
        className="fill-slate-100 text-xs font-semibold"
      >
        {clamped.toFixed(0)}%
      </text>
    </svg>
  );
}

function StatCard({ label, value, detail }: StatCardProps) {
  return (
    <div className="rounded-3xl border border-amber-300/10 bg-slate-900/70 p-6 shadow-[0_0_35px_rgba(251,191,36,0.18)] md:p-7">
      <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
        {label}
      </div>
      <div className="mt-3 text-3xl font-semibold text-slate-100">
        {value}
      </div>
      {detail ? (
        <div className="mt-2 text-sm text-slate-400">{detail}</div>
      ) : null}
    </div>
  );
}

export default function Home() {
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
  const [disks, setDisks] = useState<DiskInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    let mounted = true;

    const fetchData = async () => {
      try {
        const [metricsRes, disksRes] = await Promise.all([
          fetch("/api/public/metrics", { cache: "no-store" }),
          fetch("/api/public/disks", { cache: "no-store" }),
        ]);

        if (!metricsRes.ok || !disksRes.ok) {
          throw new Error("Failed to load server stats");
        }

        const metricsData = (await metricsRes.json()) as MetricsResponse;
        const disksData = (await disksRes.json()) as DisksResponse;

        if (!mounted) return;

        setMetrics(metricsData);
        setDisks(disksData.disks ?? []);
        setLastUpdated(new Date());
        setError(null);
      } catch {
        if (!mounted) return;
        setError("Unable to reach the ops agent. Retrying every 5s.");
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    fetchData();
    const interval = setInterval(fetchData, POLL_INTERVAL_MS);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const storageDisks = useMemo(() => {
    const filtered = disks.filter(
      (disk) => disk.mount === "/" || disk.mount.startsWith(STORAGE_MOUNT_PREFIX)
    );

    return [...filtered].sort((a, b) => {
      const aIsRoot = a.mount === "/";
      const bIsRoot = b.mount === "/";

      if (aIsRoot && !bIsRoot) return -1;
      if (!aIsRoot && bIsRoot) return 1;

      const aUsed = Number.isFinite(a.usedPercent) ? a.usedPercent : 0;
      const bUsed = Number.isFinite(b.usedPercent) ? b.usedPercent : 0;

      return bUsed - aUsed;
    });
  }, [disks]);

  const storageSummary = useMemo(() => {
    if (storageDisks.length === 0) {
      return null;
    }

    const totalBytes = storageDisks.reduce(
      (sum, disk) => sum + disk.sizeBytes,
      0
    );
    const usedBytes = storageDisks.reduce(
      (sum, disk) => sum + disk.usedBytes,
      0
    );
    const usedPercent =
      totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0;

    return { totalBytes, usedBytes, usedPercent };
  }, [storageDisks]);

  const health = useMemo(() => {
    if (!metrics) return "Unknown";
    const cpuWarn = metrics.cpu.usagePercent >= WARNING_THRESHOLDS.cpu;
    const memoryWarn = metrics.memory.usedPercent >= WARNING_THRESHOLDS.memory;
    const diskWarn = storageDisks.some(
      (disk) => disk.usedPercent >= WARNING_THRESHOLDS.disk
    );

    return cpuWarn || memoryWarn || diskWarn ? "Warning" : "OK";
  }, [metrics, storageDisks]);

  const lastUpdatedLabel = lastUpdated
    ? lastUpdated.toLocaleTimeString()
    : "--";

  return (
    <div className="min-h-screen bg-[#050607] text-slate-100">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.25),_transparent_45%),_radial-gradient(circle_at_bottom_right,_rgba(16,185,129,0.25),_transparent_45%)]" />
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-10">
        <header className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.35em] text-slate-500">
              ajmsd-ops
            </p>
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
              Server Dashboard
            </h1>
            <p className="max-w-xl text-sm text-slate-400">
              Public metrics refresh every 5 seconds.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-5 py-4">
            <div className="text-xs uppercase tracking-[0.3em] text-slate-500">
              Health
            </div>
            <div
              className={`mt-2 text-2xl font-semibold ${
                health === "OK" ? "text-emerald-300" : "text-amber-300"
              }`}
            >
              {health}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              Last update {lastUpdatedLabel}
            </div>
          </div>
        </header>

        {error ? (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-5 py-4 text-sm text-rose-100">
            {error}
          </div>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <StatCard
            label="Hostname"
            value={metrics?.hostname ?? (isLoading ? "Loading..." : "--")}
          />
          <StatCard
            label="CPU Usage"
            value={
              metrics
                ? `${metrics.cpu.usagePercent.toFixed(1)}%`
                : isLoading
                ? "Loading..."
                : "--"
            }
            detail={
              metrics
                ? `Load ${metrics.cpu.loadAverages
                    .map((value) => value.toFixed(2))
                    .join(" / ")}`
                : undefined
            }
          />
          <StatCard
            label="Memory"
            value={
              metrics
                ? `${metrics.memory.usedPercent.toFixed(1)}%`
                : isLoading
                ? "Loading..."
                : "--"
            }
            detail={
              metrics
                ? `${formatBytes(metrics.memory.usedBytes)} / ${formatBytes(
                    metrics.memory.totalBytes
                  )}`
                : undefined
            }
          />
          <StatCard
            label="Uptime"
            value={
              metrics
                ? formatUptime(metrics.uptimeSeconds)
                : isLoading
                ? "Loading..."
                : "--"
            }
          />
          <StatCard
            label="Total Storage"
            value={
              storageSummary
                ? formatBytes(storageSummary.totalBytes)
                : isLoading
                ? "Loading..."
                : "--"
            }
            detail={
              storageSummary
                ? `${formatBytes(storageSummary.usedBytes)} used (${storageSummary.usedPercent.toFixed(1)}%)`
                : undefined
            }
          />
        </section>

        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl font-semibold">Disk Usage</h2>
            <span className="text-xs uppercase tracking-[0.3em] text-slate-500">
              Updated {lastUpdatedLabel}
            </span>
          </div>

          {storageDisks.length === 0 ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-6 text-sm text-slate-400">
              {isLoading ? "Loading disks..." : "No disks reported."}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {storageDisks.map((disk) => (
                <div
                  key={`${disk.filesystem}-${disk.mount}`}
                  className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4"
                >
                  <div className="mb-4 flex justify-center">
                    <UsageRing percent={disk.usedPercent} />
                  </div>
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="truncate text-base font-semibold text-slate-100">
                        {getDiskLabel(disk.mount)}
                      </div>
                      <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                        {(disk.driveType ?? "unknown") === "unknown"
                          ? "Unknown"
                          : disk.driveType.toUpperCase()}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-semibold text-slate-100">
                        {disk.usedPercent.toFixed(1)}%
                      </div>
                      <div className="text-xs text-slate-500">
                        {formatBytes(disk.usedBytes)} /{" "}
                        {formatBytes(disk.sizeBytes)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
