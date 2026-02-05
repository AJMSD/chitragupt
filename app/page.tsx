"use client";

import { useCallback, useEffect, useMemo, useState, useId } from "react";
import Link from "next/link";
import { IconHeart, IconLock, IconRefresh, IconShield } from "@/app/components/icons";
import type { DiskInfo, DisksResponse, MetricsResponse } from "@/lib/types";

const POLL_INTERVAL_MS = 1000;
const MAX_HISTORY = 30;
const CHART_SEGMENTS = 250;
const SMOOTH_FACTOR = 0.35;
const CHART_WIDTH = 430;
const CHART_PADDING = 6;
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

function getStorageDisks(disks: DiskInfo[]): DiskInfo[] {
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
}

function getStorageSummary(disks: DiskInfo[]) {
  if (disks.length === 0) return null;
  const totalBytes = disks.reduce((sum, disk) => sum + disk.sizeBytes, 0);
  const usedBytes = disks.reduce((sum, disk) => sum + disk.usedBytes, 0);
  const usedPercent = totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0;
  return { totalBytes, usedBytes, usedPercent };
}

function smoothPush(values: number[], nextValue: number, max: number) {
  if (values.length === 0) {
    return [nextValue];
  }
  const last = values[values.length - 1];
  const smoothed = last + (nextValue - last) * SMOOTH_FACTOR;
  return [...values, smoothed].slice(-max);
}

function interpolateSeries(values: number[], segments: number): number[] {
  if (segments <= 1) return values;
  if (values.length === 0) return Array.from({ length: segments }, () => 0);
  if (values.length === 1) {
    return Array.from({ length: segments }, () => values[0]);
  }

  const lastIndex = values.length - 1;
  const result: number[] = [];

  for (let i = 0; i < segments; i += 1) {
    const t = (i / (segments - 1)) * lastIndex;
    const index = Math.floor(t);
    const next = Math.min(index + 1, lastIndex);
    const fraction = t - index;
    const value = values[index] + (values[next] - values[index]) * fraction;
    result.push(value);
  }

  return result;
}

type LineChartProps = {
  data: number[];
  height?: number;
  stroke?: string;
  fill?: string;
  segments?: number;
  padding?: number;
};

function LineChart({
  data,
  height = 180,
  stroke = "#fb923c",
  fill = "rgba(251,146,60,0.18)",
  segments = CHART_SEGMENTS,
  padding = CHART_PADDING,
}: LineChartProps) {
  const id = useId();
  const width = CHART_WIDTH;
  const series = interpolateSeries(data, segments);
  const safeData = series.length >= 2 ? series : [0, 0];
  const min = Math.min(...safeData);
  const max = Math.max(...safeData);
  const range = max - min || 1;
  const points = safeData.map((value, index) => {
    const x = padding + (index / (safeData.length - 1)) * (width - padding * 2);
    const y = padding + (1 - (value - min) / range) * (height - padding * 2);
    return { x, y };
  });

  const linePath = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");

  const areaPath = `${linePath} L ${points[points.length - 1].x} ${height - padding} L ${points[0].x} ${height - padding} Z`;
  const gradientId = `line-${id}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="w-full"
      role="img"
      aria-label="Line chart"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.6" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0.05" />
        </linearGradient>
      </defs>
      <g>
        {[0.25, 0.5, 0.75].map((fraction) => (
          <line
            key={fraction}
            x1={padding}
            x2={width - padding}
            y1={padding + fraction * (height - padding * 2)}
            y2={padding + fraction * (height - padding * 2)}
            stroke="rgba(251,146,60,0.18)"
            strokeWidth="1"
          />
        ))}
      </g>
      <path d={areaPath} fill={fill} />
      <path d={linePath} fill="none" stroke={stroke} strokeWidth="2" />
      <circle
        cx={points[points.length - 1].x}
        cy={points[points.length - 1].y}
        r="4"
        fill={stroke}
      />
    </svg>
  );
}

type MultiLineSeries = {
  data: number[];
  stroke: string;
  strokeWidth?: number;
  fill?: string;
  showDot?: boolean;
};

type MultiLineChartProps = {
  series: MultiLineSeries[];
  height?: number;
  segments?: number;
};

function MultiLineChart({
  series,
  height = 220,
  segments = CHART_SEGMENTS,
}: MultiLineChartProps) {
  const id = useId();
  const width = CHART_WIDTH;
  const padding = CHART_PADDING;

  const interpolated = series.map((item) => ({
    ...item,
    values: interpolateSeries(item.data, segments),
  }));

  const allValues = interpolated.flatMap((item) => item.values);
  const safeValues = allValues.length > 0 ? allValues : [0];
  const min = Math.min(...safeValues);
  const max = Math.max(...safeValues);
  const range = max - min || 1;

  const buildPath = (values: number[]) => {
    const points = values.map((value, index) => {
      const x = padding + (index / (values.length - 1)) * (width - padding * 2);
      const y = padding + (1 - (value - min) / range) * (height - padding * 2);
      return { x, y };
    });

    const linePath = points
      .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
      .join(" ");

    return { points, linePath };
  };

  const gradientIds = interpolated.map((item, index) => {
    const key = item.stroke.replace(/[^a-z0-9]/gi, "");
    return `multi-${id}-${key}-${index}`;
  });

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="w-full"
      role="img"
      aria-label="Load average chart"
    >
      <defs>
        {interpolated.map((item, index) =>
          item.fill ? (
            <linearGradient
              key={gradientIds[index]}
              id={gradientIds[index]}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="0%" stopColor={item.stroke} stopOpacity="0.45" />
              <stop offset="100%" stopColor={item.stroke} stopOpacity="0.06" />
            </linearGradient>
          ) : null
        )}
      </defs>
      <g>
        {[0.25, 0.5, 0.75].map((fraction) => (
          <line
            key={fraction}
            x1={padding}
            x2={width - padding}
            y1={padding + fraction * (height - padding * 2)}
            y2={padding + fraction * (height - padding * 2)}
            stroke="rgba(251,146,60,0.18)"
            strokeWidth="1"
          />
        ))}
      </g>
      {interpolated.map((item, index) => {
        const { linePath, points } = buildPath(item.values);
        const areaPath = `${linePath} L ${points[points.length - 1].x} ${
          height - padding
        } L ${points[0].x} ${height - padding} Z`;
        return (
          <g key={`${item.stroke}-${index}`}>
            {item.fill ? (
              <path d={areaPath} fill={`url(#${gradientIds[index]})`} />
            ) : null}
            <path
              d={linePath}
              fill="none"
              stroke={item.stroke}
              strokeWidth={item.strokeWidth ?? 2}
            />
            {item.showDot ? (
              <circle
                cx={points[points.length - 1].x}
                cy={points[points.length - 1].y}
                r="4"
                fill={item.stroke}
              />
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

type StatusLevel = "ok" | "warn" | "error" | "idle";

type StatusHeartsProps = {
  level: StatusLevel;
  sizeClass?: string;
};

function StatusHearts({ level, sizeClass = "h-10 w-10" }: StatusHeartsProps) {
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

type GpuCardProps = {
  title: string;
  name?: string | null;
  utilization?: number | null;
  temperature?: number | null;
  accent?: "orange" | "amber";
};

function GpuCard({
  title,
  name,
  utilization,
  temperature,
  accent = "orange",
}: GpuCardProps) {
  const percent = typeof utilization === "number" ? utilization : null;
  const tempValue = typeof temperature === "number" ? temperature : null;
  const stroke = accent === "amber" ? "#f59e0b" : "#fb923c";
  const fill =
    accent === "amber" ? "rgba(245,158,11,0.2)" : "rgba(251,146,60,0.18)";
  const tempPercent =
    tempValue !== null ? Math.min(Math.max((tempValue / 100) * 100, 0), 100) : null;

  return (
    <div className="rounded-[24px] border border-orange-500/20 bg-[#120c08]/70 p-5">
      <p className="text-xs uppercase tracking-[0.3em] text-amber-200/70">
        {title}
      </p>
      <div className="mt-2 text-sm font-semibold text-amber-100">
        {name ?? "Not detected"}
      </div>
      <div className="mt-3 text-2xl font-semibold text-amber-100">
        {percent !== null ? `${percent.toFixed(0)}%` : "N/A"}
      </div>
      <div className="mt-3">
        <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.3em] text-amber-200/60">
          <span>Temp</span>
          <span>{tempValue !== null ? `${tempValue.toFixed(0)}°C` : "N/A"}</span>
        </div>
        <div className="mt-2 h-2 w-full rounded-full bg-black/40">
          <div
            className="h-2 rounded-full bg-gradient-to-r from-amber-300 via-orange-400 to-rose-400"
            style={{ width: tempPercent !== null ? `${tempPercent}%` : "12%", opacity: tempPercent !== null ? 1 : 0.4 }}
          />
        </div>
      </div>
      <div className="mt-4">
        <LineChart
          data={percent !== null ? [percent] : [0, 0]}
          height={120}
          stroke={stroke}
          fill={fill}
          segments={CHART_SEGMENTS}
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
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authLoaded, setAuthLoaded] = useState(false);
  const [loadHistory, setLoadHistory] = useState<number[]>([]);
  const [loadHistory5m, setLoadHistory5m] = useState<number[]>([]);
  const [loadHistory15m, setLoadHistory15m] = useState<number[]>([]);
  const [cpuHistory, setCpuHistory] = useState<number[]>([]);
  const [memoryHistory, setMemoryHistory] = useState<number[]>([]);
  const [storageHistory, setStorageHistory] = useState<number[]>([]);

  const fetchData = useCallback(async (manual = false) => {
    if (manual) {
      setIsRefreshing(true);
    }

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

      setMetrics(metricsData);
      setDisks(disksData.disks ?? []);
      setLastUpdated(new Date());
      setError(null);

      setLoadHistory((prev) =>
        smoothPush(prev, metricsData.cpu.loadAverages[0] ?? 0, MAX_HISTORY)
      );
      setLoadHistory5m((prev) =>
        smoothPush(prev, metricsData.cpu.loadAverages[1] ?? 0, MAX_HISTORY)
      );
      setLoadHistory15m((prev) =>
        smoothPush(prev, metricsData.cpu.loadAverages[2] ?? 0, MAX_HISTORY)
      );
      setCpuHistory((prev) =>
        smoothPush(prev, metricsData.cpu.usagePercent ?? 0, MAX_HISTORY)
      );
      setMemoryHistory((prev) =>
        smoothPush(prev, metricsData.memory.usedPercent ?? 0, MAX_HISTORY)
      );
      const storageSummary = getStorageSummary(getStorageDisks(disksData.disks ?? []));
      setStorageHistory((prev) =>
        smoothPush(prev, storageSummary?.usedPercent ?? 0, MAX_HISTORY)
      );
    } catch {
      setError("Unable to reach the ops agent. Retrying every 1s.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const startPolling = async () => {
      if (!mounted) return;
      await fetchData();
      const interval = setInterval(() => {
        if (!mounted) return;
        void fetchData();
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
  }, [fetchData]);

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

  const storageDisks = useMemo(() => getStorageDisks(disks), [disks]);
  const storageSummary = useMemo(() => getStorageSummary(storageDisks), [storageDisks]);

  const statusLevel = useMemo<StatusLevel>(() => {
    if (error) return "error";
    if (!metrics) return "idle";
    const hasWarning =
      metrics.cpu.usagePercent >= WARNING_THRESHOLDS.cpu ||
      metrics.memory.usedPercent >= WARNING_THRESHOLDS.memory ||
      storageDisks.some((disk) => disk.usedPercent >= WARNING_THRESHOLDS.disk);
    return hasWarning ? "warn" : "ok";
  }, [error, metrics, storageDisks]);

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
          <div className="space-y-2">
            <h1 className="font-[var(--font-display)] text-3xl font-semibold text-amber-100 md:text-4xl">
              AJMSD OPS
            </h1>
            <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.3em] text-amber-200/70">
              <span>Updated {lastUpdatedLabel}</span>
              <button
                className="flex h-9 w-9 items-center justify-center rounded-full border border-orange-400/40 bg-orange-400/10 text-orange-100 transition hover:border-orange-300 hover:bg-orange-400/20"
                type="button"
                onClick={() => void fetchData(true)}
                disabled={isRefreshing}
                aria-label="Refresh telemetry"
                title="Refresh telemetry"
              >
                <IconRefresh className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <StatusHearts level={statusLevel} sizeClass="h-11 w-11" />
            <Link
              className="flex h-11 w-11 items-center justify-center rounded-full border border-orange-400/50 bg-orange-400/10 text-orange-100 transition hover:border-orange-300 hover:bg-orange-400/20"
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
          </div>
        </header>

        {error ? (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-5 py-4 text-sm text-rose-100">
            {error}
          </div>
        ) : null}

        <section className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <div className="rounded-[28px] border border-orange-500/20 bg-[#120c08]/75 p-4 shadow-[0_16px_40px_rgba(8,5,3,0.6)]">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-amber-200/70">
                  Load Timeline
                </p>
                <h2 className="mt-2 font-[var(--font-display)] text-xl text-amber-100 md:text-2xl">
                  {metrics ? metrics.cpu.name : isLoading ? "Loading..." : "Unknown"}
                </h2>
              </div>
              <div className="text-[11px] uppercase tracking-[0.3em] text-amber-200/60">
                Uptime {metrics ? formatUptime(metrics.uptimeSeconds) : "--"}
              </div>
            </div>
            <div className="mt-3">
              <MultiLineChart
                height={380}
                series={[
                  {
                    data: loadHistory.length ? loadHistory : [0, 0],
                    stroke: "#fb923c",
                    strokeWidth: 2.2,
                    fill: "rgba(251,146,60,0.2)",
                    showDot: true,
                  },
                  {
                    data: loadHistory5m.length ? loadHistory5m : [0, 0],
                    stroke: "#f59e0b",
                    strokeWidth: 1.6,
                    fill: "rgba(245,158,11,0.15)",
                  },
                  {
                    data: loadHistory15m.length ? loadHistory15m : [0, 0],
                    stroke: "#fdba74",
                    strokeWidth: 1.6,
                    fill: "rgba(253,186,116,0.12)",
                  },
                ]}
              />
            </div>
            <div className="mt-2 grid gap-4 text-sm text-amber-100/70 sm:grid-cols-3">
              <div className="text-center">
                <div className="flex items-center justify-center gap-2 text-[11px] uppercase tracking-[0.3em] text-amber-200/60">
                  <span className="h-2 w-5 rounded-full bg-[#fb923c]" />
                  <span>Load 1m</span>
                </div>
                <div>{metrics ? metrics.cpu.loadAverages[0].toFixed(2) : "--"}</div>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-2 text-[11px] uppercase tracking-[0.3em] text-amber-200/60">
                  <span className="h-2 w-5 rounded-full bg-[#f59e0b]" />
                  <span>Load 5m</span>
                </div>
                <div>{metrics ? metrics.cpu.loadAverages[1].toFixed(2) : "--"}</div>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-2 text-[11px] uppercase tracking-[0.3em] text-amber-200/60">
                  <span className="h-2 w-5 rounded-full bg-[#fdba74]" />
                  <span>Load 15m</span>
                </div>
                <div>{metrics ? metrics.cpu.loadAverages[2].toFixed(2) : "--"}</div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-[24px] border border-orange-500/20 bg-[#120c08]/70 p-5">
              <p className="text-xs uppercase tracking-[0.3em] text-amber-200/70">CPU Usage</p>
              <div className="mt-2 text-2xl font-semibold text-amber-100">
                {metrics ? `${metrics.cpu.usagePercent.toFixed(1)}%` : isLoading ? "Loading..." : "--"}
              </div>
              <div className="mt-4">
                <LineChart data={cpuHistory.length ? cpuHistory : [0, 0]} height={150} />
              </div>
            </div>

            <div className="rounded-[24px] border border-orange-500/20 bg-[#120c08]/70 p-5">
              <p className="text-xs uppercase tracking-[0.3em] text-amber-200/70">Memory</p>
              <div className="mt-2 text-2xl font-semibold text-amber-100">
                {metrics ? `${metrics.memory.usedPercent.toFixed(1)}%` : isLoading ? "Loading..." : "--"}
              </div>
              <div className="mt-4">
                <LineChart data={memoryHistory.length ? memoryHistory : [0, 0]} height={150} stroke="#f59e0b" fill="rgba(245,158,11,0.2)" />
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <GpuCard
            title="NVIDIA GPU"
            name={metrics?.gpu?.name}
            utilization={metrics?.gpu?.utilizationPercent ?? null}
            temperature={metrics?.gpu?.temperatureC ?? null}
            accent="orange"
          />
          <GpuCard
            title="Intel GPU"
            name={metrics?.gpuIntel?.name}
            utilization={metrics?.gpuIntel?.utilizationPercent ?? null}
            temperature={metrics?.gpuIntel?.temperatureC ?? null}
            accent="amber"
          />
        </section>

        <section className="grid gap-4 lg:grid-cols-[1fr_2fr]">
          <div className="rounded-[24px] border border-orange-500/20 bg-[#120c08]/70 p-4">
            <p className="text-xs uppercase tracking-[0.3em] text-amber-200/70">Storage</p>
            <div className="mt-2 flex items-center justify-between gap-4">
              <div>
                <div className="text-2xl font-semibold text-amber-100">
                  {storageSummary ? `${storageSummary.usedPercent.toFixed(1)}%` : isLoading ? "Loading..." : "--"}
                </div>
                <div className="mt-1 text-xs text-amber-100/60">
                  {storageSummary
                    ? `${formatBytes(storageSummary.usedBytes)} / ${formatBytes(storageSummary.totalBytes)}`
                    : "--"}
                </div>
              </div>
              <div className="relative h-14 w-14">
                <svg
                  viewBox="0 0 36 36"
                  className="h-14 w-14 rotate-[-90deg]"
                  role="img"
                  aria-label="Storage capacity"
                >
                  <circle
                    cx="18"
                    cy="18"
                    r="15"
                    fill="none"
                    stroke="rgba(251,146,60,0.2)"
                    strokeWidth="3"
                  />
                  <circle
                    cx="18"
                    cy="18"
                    r="15"
                    fill="none"
                    stroke="#fb923c"
                    strokeWidth="3"
                    strokeDasharray="94.2"
                    strokeDashoffset={
                      storageSummary
                        ? 94.2 - (storageSummary.usedPercent / 100) * 94.2
                        : 94.2
                    }
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-amber-100">
                  {storageSummary ? `${Math.round(storageSummary.usedPercent)}%` : "--"}
                </div>
              </div>
            </div>
            <div className="mt-2">
              <LineChart
                data={storageHistory.length ? storageHistory : [0, 0]}
                height={210}
                stroke="#f97316"
                fill="rgba(249,115,22,0.22)"
                padding={1}
              />
            </div>
          </div>

          <div className="rounded-[28px] border border-orange-500/20 bg-[#120c08]/75 p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-[var(--font-display)] text-2xl text-amber-100">Disk Terrain</h2>
            </div>

            {storageDisks.length === 0 ? (
              <div className="mt-6 rounded-2xl border border-orange-500/20 bg-black/40 px-4 py-6 text-sm text-amber-100/70">
                {isLoading ? "Loading disks..." : "No disks reported."}
              </div>
            ) : (
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                {storageDisks.map((disk) => (
                  <div
                    key={`${disk.filesystem}-${disk.mount}`}
                    className="rounded-[20px] border border-orange-500/20 bg-black/40 p-4"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-semibold text-amber-100">
                          {getDiskLabel(disk.mount)}
                        </div>
                        <div className="text-[10px] uppercase tracking-[0.3em] text-amber-200/60">
                          {(disk.driveType ?? "unknown") === "unknown"
                            ? "Unknown"
                            : disk.driveType.toUpperCase()}
                        </div>
                      </div>
                      <div className="text-sm font-semibold text-amber-100">
                        {disk.usedPercent.toFixed(1)}%
                      </div>
                    </div>
                    <div className="mt-3 h-2 w-full rounded-full bg-black/40">
                      <div
                        className="h-2 rounded-full bg-gradient-to-r from-amber-300 via-orange-400 to-orange-600"
                        style={{ width: `${disk.usedPercent}%` }}
                      />
                    </div>
                    <div className="mt-3 text-xs text-amber-100/60">
                      {formatBytes(disk.usedBytes)} / {formatBytes(disk.sizeBytes)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
