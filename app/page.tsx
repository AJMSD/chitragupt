"use client";

import { useEffect, useMemo, useState, useId } from "react";
import Link from "next/link";
import { IconLock, IconShield } from "@/app/components/icons";
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

type RingGaugeProps = {
  value: number | null | undefined;
  label: string;
  size?: number;
};

function RingGauge({ value, label, size = 120 }: RingGaugeProps) {
  const id = useId();
  const clamped = Number.isFinite(value)
    ? Math.min(Math.max(value ?? 0, 0), 100)
    : 0;
  const isValid = Number.isFinite(value);
  const radius = size / 2 - 12;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;
  const gradientId = `ring-${id}`;
  const glowId = `glow-${id}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={label}
      className="drop-shadow-[0_0_18px_rgba(251,146,60,0.25)]"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fdba74" />
          <stop offset="100%" stopColor="#f97316" />
        </linearGradient>
        <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke="rgba(250, 204, 21, 0.15)"
        strokeWidth="10"
        fill="none"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={isValid ? `url(#${gradientId})` : "rgba(148,163,184,0.3)"}
        strokeWidth="12"
        fill="none"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        filter={`url(#${glowId})`}
      />
      <text
        x="50%"
        y="48%"
        textAnchor="middle"
        className="fill-slate-100 text-sm font-semibold"
      >
        {isValid ? `${clamped.toFixed(0)}%` : "N/A"}
      </text>
      <text
        x="50%"
        y="64%"
        textAnchor="middle"
        className="fill-slate-400 text-[10px] uppercase tracking-[0.3em]"
      >
        {label}
      </text>
    </svg>
  );
}

function SparkBars({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  return (
    <div className="flex items-end gap-1">
      {values.map((value, index) => {
        const height = Math.max(6, Math.round((value / max) * 34));
        return (
          <span
            key={`spark-${index}`}
            className="w-2 rounded-full bg-gradient-to-t from-orange-500 to-amber-200"
            style={{ height }}
          />
        );
      })}
    </div>
  );
}

function MeterBar({ value, label }: { value: number | null | undefined; label: string }) {
  const percent = Number.isFinite(value)
    ? Math.min(Math.max(value ?? 0, 0), 100)
    : null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs uppercase tracking-[0.25em] text-slate-500">
        <span>{label}</span>
        <span>{percent !== null ? `${percent.toFixed(0)}%` : "N/A"}</span>
      </div>
      <div className="h-2 w-full rounded-full bg-black/40">
        <div
          className="h-2 rounded-full bg-gradient-to-r from-amber-300 via-orange-400 to-orange-600"
          style={{ width: percent !== null ? `${percent}%` : "12%", opacity: percent !== null ? 1 : 0.4 }}
        />
      </div>
    </div>
  );
}

export default function Home() {
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
  const [disks, setDisks] = useState<DiskInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authLoaded, setAuthLoaded] = useState(false);

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

  useEffect(() => {
    let mounted = true;

    const fetchSession = async () => {
      try {
        const response = await fetch("/api/auth/session", {
          cache: "no-store",
        });
        if (!response.ok) {
          if (mounted) {
            setIsAuthenticated(false);
            setAuthLoaded(true);
          }
          return;
        }
        const payload = (await response.json()) as { authenticated?: boolean };
        if (mounted) {
          setIsAuthenticated(Boolean(payload.authenticated));
          setAuthLoaded(true);
        }
      } catch {
        if (mounted) {
          setIsAuthenticated(false);
          setAuthLoaded(true);
        }
      }
    };

    fetchSession();

    return () => {
      mounted = false;
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
    const usedPercent = totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0;

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

  const lastUpdatedLabel = lastUpdated ? lastUpdated.toLocaleTimeString() : "--";

  return (
    <div className="min-h-screen bg-[#090605] text-slate-100">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 left-1/4 h-72 w-72 rounded-full bg-orange-500/30 blur-[120px]" />
        <div className="absolute bottom-0 right-0 h-96 w-96 rounded-full bg-amber-300/25 blur-[140px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(251,146,60,0.25),_transparent_55%),radial-gradient(circle_at_bottom,_rgba(249,115,22,0.2),_transparent_60%)]" />
      </div>

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-10">
        <header className="flex flex-col gap-6 rounded-[32px] border border-orange-500/20 bg-[#120c08]/80 p-8 shadow-[0_20px_60px_rgba(14,8,4,0.65)] md:flex-row md:items-center md:justify-between motion-safe:animate-[fade-up_0.6s_ease-out]">
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.4em] text-amber-200/70">
              ajmsd-ops
            </p>
            <h1 className="font-[var(--font-display)] text-3xl font-semibold text-amber-100 md:text-4xl">
              Emberline Monitor
            </h1>
            <p className="max-w-xl text-sm text-amber-100/70">
              Public telemetry with a warm signal glow. Updates every 5 seconds.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <Link
              className="group relative flex h-12 w-12 items-center justify-center rounded-full border border-orange-400/50 bg-orange-400/10 text-orange-100 transition hover:border-orange-300 hover:bg-orange-400/20"
              href={isAuthenticated ? "/app" : "/login?next=/app"}
              aria-label={isAuthenticated ? "Open private dashboard" : "Login"}
              title={isAuthenticated ? "Private" : "Login"}
            >
              {authLoaded ? (
                isAuthenticated ? (
                  <IconShield className="h-5 w-5" />
                ) : (
                  <IconLock className="h-5 w-5" />
                )
              ) : (
                <div className="h-2 w-2 rounded-full bg-amber-200/70" />
              )}
            </Link>
            <div className="rounded-3xl border border-orange-400/20 bg-black/40 px-5 py-4">
              <div className="text-xs uppercase tracking-[0.3em] text-amber-200/70">
                Status
              </div>
              <div
                className={`mt-2 text-2xl font-semibold ${
                  health === "OK" ? "text-emerald-300" : "text-orange-300"
                }`}
              >
                {health}
              </div>
              <div className="mt-1 text-xs text-amber-100/60">
                Updated {lastUpdatedLabel}
              </div>
            </div>
          </div>
        </header>

        {error ? (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-5 py-4 text-sm text-rose-100">
            {error}
          </div>
        ) : null}

        <section className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-[28px] border border-orange-500/20 bg-[#120c08]/75 p-6 shadow-[0_16px_40px_rgba(8,5,3,0.6)]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-amber-200/70">
                  CPU
                </p>
                <h2 className="mt-2 font-[var(--font-display)] text-2xl text-amber-100">
                  {metrics?.cpu?.name ?? (isLoading ? "Loading..." : "Unknown")}
                </h2>
              </div>
              <RingGauge
                value={metrics?.cpu?.usagePercent ?? null}
                label="Usage"
              />
            </div>
            <div className="mt-6 flex items-center justify-between text-sm text-amber-100/70">
              <div>
                <div className="text-xs uppercase tracking-[0.3em] text-amber-200/50">
                  Load 1/5/15
                </div>
                <div className="mt-1">
                  {metrics
                    ? metrics.cpu.loadAverages
                        .map((value) => value.toFixed(2))
                        .join(" / ")
                    : "--"}
                </div>
              </div>
              <SparkBars values={metrics?.cpu?.loadAverages ?? [0.4, 0.2, 0.1]} />
            </div>
          </div>

          <div className="rounded-[28px] border border-orange-500/20 bg-[#120c08]/75 p-6 shadow-[0_16px_40px_rgba(8,5,3,0.6)]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-amber-200/70">
                  Memory
                </p>
                <h2 className="mt-2 font-[var(--font-display)] text-2xl text-amber-100">
                  {metrics ? formatBytes(metrics.memory.usedBytes) : "--"}
                </h2>
                <p className="text-xs text-amber-100/60">
                  of {metrics ? formatBytes(metrics.memory.totalBytes) : "--"}
                </p>
              </div>
              <RingGauge
                value={metrics?.memory?.usedPercent ?? null}
                label="Used"
              />
            </div>
            <div className="mt-6 text-sm text-amber-100/70">
              <div className="text-xs uppercase tracking-[0.3em] text-amber-200/50">
                Free Memory
              </div>
              <div className="mt-1">
                {metrics ? formatBytes(metrics.memory.freeBytes) : "--"}
              </div>
            </div>
          </div>

          <div className="rounded-[28px] border border-orange-500/20 bg-[#120c08]/75 p-6 shadow-[0_16px_40px_rgba(8,5,3,0.6)]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-amber-200/70">
                  Storage
                </p>
                <h2 className="mt-2 font-[var(--font-display)] text-2xl text-amber-100">
                  {storageSummary
                    ? formatBytes(storageSummary.usedBytes)
                    : "--"}
                </h2>
                <p className="text-xs text-amber-100/60">
                  of {storageSummary
                    ? formatBytes(storageSummary.totalBytes)
                    : "--"}
                </p>
              </div>
              <RingGauge
                value={storageSummary?.usedPercent ?? null}
                label="Used"
              />
            </div>
            <div className="mt-6 text-sm text-amber-100/70">
              <div className="text-xs uppercase tracking-[0.3em] text-amber-200/50">
                Uptime
              </div>
              <div className="mt-1">
                {metrics ? formatUptime(metrics.uptimeSeconds) : "--"}
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-[28px] border border-orange-500/20 bg-[#120c08]/75 p-6 shadow-[0_16px_40px_rgba(8,5,3,0.6)]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-amber-200/70">
                  NVIDIA GPU
                </p>
                <h3 className="mt-2 text-lg font-semibold text-amber-100">
                  {metrics?.gpu?.name ?? (isLoading ? "Loading..." : "Not detected")}
                </h3>
              </div>
              <RingGauge
                value={metrics?.gpu?.utilizationPercent ?? null}
                label="Usage"
                size={96}
              />
            </div>
            <div className="mt-4">
              <MeterBar
                value={metrics?.gpu?.temperatureC ?? null}
                label="Temperature"
              />
            </div>
          </div>

          <div className="rounded-[28px] border border-orange-500/20 bg-[#120c08]/75 p-6 shadow-[0_16px_40px_rgba(8,5,3,0.6)]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-amber-200/70">
                  Intel GPU
                </p>
                <h3 className="mt-2 text-lg font-semibold text-amber-100">
                  {metrics?.gpuIntel?.name ?? (isLoading ? "Loading..." : "Not detected")}
                </h3>
              </div>
              <RingGauge
                value={metrics?.gpuIntel?.utilizationPercent ?? null}
                label="Usage"
                size={96}
              />
            </div>
            <div className="mt-4">
              <MeterBar
                value={metrics?.gpuIntel?.temperatureC ?? null}
                label="Temperature"
              />
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-[var(--font-display)] text-2xl text-amber-100">
              Disk Terrain
            </h2>
            <span className="text-xs uppercase tracking-[0.3em] text-amber-200/60">
              Updated {lastUpdatedLabel}
            </span>
          </div>

          {storageDisks.length === 0 ? (
            <div className="rounded-2xl border border-orange-500/20 bg-[#120c08]/60 px-4 py-6 text-sm text-amber-100/70">
              {isLoading ? "Loading disks..." : "No disks reported."}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {storageDisks.map((disk) => (
                <div
                  key={`${disk.filesystem}-${disk.mount}`}
                  className="rounded-[24px] border border-orange-500/20 bg-[#120c08]/70 p-5"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-amber-100">
                        {getDiskLabel(disk.mount)}
                      </div>
                      <div className="text-xs uppercase tracking-[0.3em] text-amber-200/50">
                        {(disk.driveType ?? "unknown") === "unknown"
                          ? "Unknown"
                          : disk.driveType.toUpperCase()}
                      </div>
                    </div>
                    <RingGauge value={disk.usedPercent} label="Used" size={80} />
                  </div>
                  <div className="mt-4 text-xs text-amber-100/70">
                    {formatBytes(disk.usedBytes)} / {formatBytes(disk.sizeBytes)}
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
