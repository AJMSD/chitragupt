"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  DockerContainerInfo,
  DockerContainersResponse,
  SystemdUnitInfo,
  SystemdUnitsResponse,
} from "@/lib/types";
import { fetchJson, formatApiError } from "@/lib/client";

type StatusTone = "emerald" | "amber" | "rose" | "slate";

function StatusBadge({ tone, label }: { tone: StatusTone; label: string }) {
  const toneClass =
    tone === "emerald"
      ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
      : tone === "amber"
      ? "border-amber-300/30 bg-amber-300/10 text-amber-100"
      : tone === "rose"
      ? "border-rose-400/30 bg-rose-400/10 text-rose-100"
      : "border-slate-700 bg-slate-900/70 text-slate-300";

  return (
    <span
      className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${toneClass}`}
    >
      {label}
    </span>
  );
}

function getContainerStateTone(state: DockerContainerInfo["state"]): StatusTone {
  if (state === "running") return "emerald";
  if (state === "exited" || state === "dead") return "rose";
  if (state === "restarting" || state === "paused") return "amber";
  return "slate";
}

function getContainerHealthTone(
  health: DockerContainerInfo["health"]
): StatusTone {
  if (health === "healthy") return "emerald";
  if (health === "unhealthy") return "rose";
  if (health === "starting") return "amber";
  return "slate";
}

function getUnitTone(unit: SystemdUnitInfo): StatusTone {
  if (unit.activeState === "active") return "emerald";
  if (unit.activeState === "failed") return "rose";
  return "amber";
}

export default function ServicesPage() {
  const [docker, setDocker] = useState<DockerContainersResponse | null>(null);
  const [systemd, setSystemd] = useState<SystemdUnitsResponse | null>(null);
  const [dockerError, setDockerError] = useState<string | null>(null);
  const [systemdError, setSystemdError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadData = useCallback(async (refresh = false) => {
    if (refresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    const [dockerResult, systemdResult] = await Promise.all([
      fetchJson<DockerContainersResponse>("/api/private/docker"),
      fetchJson<SystemdUnitsResponse>("/api/private/systemd"),
    ]);

    if (dockerResult.ok) {
      setDocker(dockerResult.data);
      setDockerError(null);
    } else {
      setDockerError(formatApiError(dockerResult.error));
    }

    if (systemdResult.ok) {
      setSystemd(systemdResult.data);
      setSystemdError(null);
    } else {
      setSystemdError(formatApiError(systemdResult.error));
    }

    setLastUpdated(new Date());
    setIsLoading(false);
    setIsRefreshing(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    void loadData();
  }, [loadData]);

  const containers = docker?.containers ?? [];
  const units = systemd?.units ?? [];

  const containerSummary = useMemo(() => {
    const list = docker?.containers ?? [];
    const running = list.filter((item) => item.state === "running").length;
    const unhealthy = list.filter((item) => item.health === "unhealthy").length;
    return {
      total: list.length,
      running,
      unhealthy,
    };
  }, [docker]);

  const unitSummary = useMemo(() => {
    const list = systemd?.units ?? [];
    const running = list.filter((item) => item.activeState === "active").length;
    const failed = list.filter((item) => item.activeState === "failed").length;
    return {
      total: list.length,
      running,
      failed,
    };
  }, [systemd]);

  const updatedLabel = lastUpdated
    ? lastUpdated.toLocaleTimeString()
    : "--";

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-3xl border border-amber-200/10 bg-slate-900/70 p-6">
        <div>
          <h2 className="text-xl font-semibold">Services</h2>
          <p className="mt-2 text-sm text-slate-400">
            Live status for Docker containers and systemd units.
          </p>
          <p className="mt-1 text-xs uppercase tracking-[0.3em] text-slate-500">
            Updated {updatedLabel}
          </p>
        </div>
        <button
          className="rounded-full border border-amber-400/40 bg-amber-400/10 px-4 py-2 text-sm font-semibold text-amber-100 transition hover:border-amber-300/70 hover:bg-amber-400/20"
          type="button"
          onClick={() => void loadData(true)}
          disabled={isRefreshing}
        >
          {isRefreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
            Docker
          </div>
          <div className="mt-3 text-2xl font-semibold text-slate-100">
            {isLoading ? "Loading..." : containerSummary.total}
          </div>
          <div className="mt-2 text-sm text-slate-400">
            {containerSummary.running} running · {containerSummary.unhealthy}{" "}
            unhealthy
          </div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
            systemd
          </div>
          <div className="mt-3 text-2xl font-semibold text-slate-100">
            {isLoading ? "Loading..." : unitSummary.total}
          </div>
          <div className="mt-2 text-sm text-slate-400">
            {unitSummary.running} active · {unitSummary.failed} failed
          </div>
        </div>
      </div>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Docker Containers</h3>
          {dockerError ? (
            <span className="text-xs uppercase tracking-[0.2em] text-rose-200">
              {dockerError}
            </span>
          ) : null}
        </div>
        {dockerError ? (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            {dockerError}
          </div>
        ) : containers.length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-6 text-sm text-slate-400">
            {isLoading ? "Loading containers..." : "No containers reported."}
          </div>
        ) : (
          <div className="grid gap-4">
            {containers.map((container) => (
              <div
                key={container.id}
                className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                      Container
                    </div>
                    <div className="truncate text-lg font-semibold text-slate-100">
                      {container.name}
                    </div>
                    <div className="text-xs text-slate-500">
                      {container.image}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge
                      tone={getContainerStateTone(container.state)}
                      label={container.state}
                    />
                    <StatusBadge
                      tone={getContainerHealthTone(container.health)}
                      label={container.health}
                    />
                  </div>
                </div>
                <div className="mt-3 text-xs text-slate-500">
                  {container.status}
                </div>
                <div className="mt-3 text-sm text-slate-300">
                  Ports:{" "}
                  {container.ports.length > 0
                    ? container.ports.join(", ")
                    : "—"}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">systemd Units</h3>
          {systemdError ? (
            <span className="text-xs uppercase tracking-[0.2em] text-rose-200">
              {systemdError}
            </span>
          ) : null}
        </div>
        {systemdError ? (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            {systemdError}
          </div>
        ) : units.length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-6 text-sm text-slate-400">
            {isLoading ? "Loading units..." : "No systemd units reported."}
          </div>
        ) : (
          <div className="space-y-3">
            {units.map((unit) => (
              <div
                key={unit.name}
                className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                      Unit
                    </div>
                    <div className="truncate text-lg font-semibold text-slate-100">
                      {unit.name}
                    </div>
                    <div className="text-xs text-slate-500">
                      {unit.description}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge tone={getUnitTone(unit)} label={unit.activeState} />
                    <StatusBadge tone="slate" label={unit.subState} />
                  </div>
                </div>
                <div className="mt-3 text-xs text-slate-500">
                  Load: {unit.loadState}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
