"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { IconHeart, IconRefresh } from "@/app/components/icons";
import type {
  DockerContainerInfo,
  DockerContainersResponse,
  SystemdUnitInfo,
  SystemdUnitsResponse,
} from "@/lib/types";
import { fetchJson, formatApiError } from "@/lib/client";

type StatusTone = "emerald" | "amber" | "rose" | "slate";

type StatusLevel = "ok" | "warn" | "error" | "idle";

function toneClass(tone: StatusTone) {
  if (tone === "emerald") return "text-emerald-300";
  if (tone === "amber") return "text-amber-300";
  if (tone === "rose") return "text-rose-400";
  return "text-slate-500/40";
}

function levelToTone(level: StatusLevel): StatusTone {
  if (level === "ok") return "emerald";
  if (level === "warn") return "amber";
  if (level === "error") return "rose";
  return "slate";
}

function StatusHearts({ level, sizeClass = "h-6 w-6" }: { level: StatusLevel; sizeClass?: string }) {
  const tone = levelToTone(level);
  const count = level === "ok" ? 3 : level === "warn" ? 2 : level === "error" ? 1 : 3;
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: count }, (_, index) => (
        <IconHeart key={`${level}-${index}`} className={`${sizeClass} ${toneClass(tone)}`} />
      ))}
    </div>
  );
}

function getContainerStateLevel(state: DockerContainerInfo["state"]): StatusLevel {
  if (state === "running") return "ok";
  if (state === "restarting" || state === "paused") return "warn";
  if (state === "exited" || state === "dead") return "error";
  return "idle";
}

function getContainerHealthLevel(health: DockerContainerInfo["health"]): StatusLevel {
  if (health === "healthy") return "ok";
  if (health === "starting") return "warn";
  if (health === "unhealthy") return "error";
  return "idle";
}

function getUnitLevel(unit: SystemdUnitInfo): StatusLevel {
  if (unit.activeState === "active") return "ok";
  if (unit.activeState === "failed") return "error";
  return "warn";
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

  const dockerLevel: StatusLevel = containerSummary.total === 0
    ? "idle"
    : containerSummary.unhealthy > 0
    ? "error"
    : "ok";

  const systemdLevel: StatusLevel = unitSummary.total === 0
    ? "idle"
    : unitSummary.failed > 0
    ? "error"
    : "ok";

  const updatedLabel = lastUpdated ? lastUpdated.toLocaleTimeString() : "--";

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-[28px] border border-orange-500/20 bg-[#120c08]/80 p-6">
        <div>
          <h2 className="font-[var(--font-display)] text-2xl text-amber-100">
            Services Pulse
          </h2>
          <p className="mt-2 text-sm text-amber-100/70">
            Live status for Docker containers and systemd units.
          </p>
          <p className="mt-1 text-xs uppercase tracking-[0.3em] text-amber-200/60">
            Updated {updatedLabel}
          </p>
        </div>
        <button
          className="flex h-11 w-11 items-center justify-center rounded-full border border-orange-400/40 bg-orange-400/10 text-orange-100 transition hover:border-orange-300 hover:bg-orange-400/20"
          type="button"
          onClick={() => void loadData(true)}
          disabled={isRefreshing}
          aria-label="Refresh services"
          title="Refresh services"
        >
          <IconRefresh className="h-5 w-5" />
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-[24px] border border-orange-500/20 bg-[#120c08]/70 p-5">
          <div className="text-xs uppercase tracking-[0.3em] text-amber-200/70">
            Docker
          </div>
          <div className="mt-3 text-2xl font-semibold text-amber-100">
            {isLoading ? "Loading..." : containerSummary.total}
          </div>
          <div className="mt-4 flex items-center gap-3">
            <StatusHearts level={dockerLevel} sizeClass="h-5 w-5" />
            <span className="text-xs uppercase tracking-[0.3em] text-amber-200/60">
              {containerSummary.unhealthy > 0 ? "Warning" : "OK"}
            </span>
          </div>
        </div>
        <div className="rounded-[24px] border border-orange-500/20 bg-[#120c08]/70 p-5">
          <div className="text-xs uppercase tracking-[0.3em] text-amber-200/70">
            systemd
          </div>
          <div className="mt-3 text-2xl font-semibold text-amber-100">
            {isLoading ? "Loading..." : unitSummary.total}
          </div>
          <div className="mt-4 flex items-center gap-3">
            <StatusHearts level={systemdLevel} sizeClass="h-5 w-5" />
            <span className="text-xs uppercase tracking-[0.3em] text-amber-200/60">
              {unitSummary.failed > 0 ? "Warning" : "OK"}
            </span>
          </div>
        </div>
      </div>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-[var(--font-display)] text-xl text-amber-100">
            Docker Containers
          </h3>
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
          <div className="rounded-2xl border border-orange-500/20 bg-[#120c08]/70 px-4 py-6 text-sm text-amber-100/70">
            {isLoading ? "Loading containers..." : "No containers reported."}
          </div>
        ) : (
          <div className="grid gap-4">
            {containers.map((container) => {
              const stateLevel = getContainerStateLevel(container.state);
              const healthLevel = getContainerHealthLevel(container.health);
              return (
                <div
                  key={container.id}
                  className="rounded-[24px] border border-orange-500/20 bg-[#120c08]/70 p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs uppercase tracking-[0.3em] text-amber-200/60">
                        Container
                      </div>
                      <div className="truncate text-lg font-semibold text-amber-100">
                        {container.name}
                      </div>
                      <div className="text-xs text-amber-100/60">
                        {container.image}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusHearts level={stateLevel} sizeClass="h-4 w-4" />
                      <StatusHearts level={healthLevel} sizeClass="h-4 w-4" />
                    </div>
                  </div>
                  <div className="mt-3 text-xs text-amber-100/60">
                    {container.status}
                  </div>
                  <div className="mt-3 text-sm text-amber-100/70">
                    Ports: {container.ports.length > 0 ? container.ports.join(", ") : "--"}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-[var(--font-display)] text-xl text-amber-100">
            systemd Units
          </h3>
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
          <div className="rounded-2xl border border-orange-500/20 bg-[#120c08]/70 px-4 py-6 text-sm text-amber-100/70">
            {isLoading ? "Loading units..." : "No systemd units reported."}
          </div>
        ) : (
          <div className="space-y-3">
            {units.map((unit) => {
              const unitLevel = getUnitLevel(unit);
              return (
                <div
                  key={unit.name}
                  className="rounded-[24px] border border-orange-500/20 bg-[#120c08]/70 p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs uppercase tracking-[0.3em] text-amber-200/60">
                        Unit
                      </div>
                      <div className="truncate text-lg font-semibold text-amber-100">
                        {unit.name}
                      </div>
                      <div className="text-xs text-amber-100/60">
                        {unit.description}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusHearts level={unitLevel} sizeClass="h-4 w-4" />
                      <span className="text-xs uppercase tracking-[0.3em] text-amber-200/60">
                        {unit.subState}
                      </span>
                    </div>
                  </div>
                  <div className="mt-3 text-xs text-amber-100/60">
                    Load: {unit.loadState}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </section>
  );
}
