"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  IconFolder,
  IconGrid,
  IconRefresh,
  IconServer,
  IconTerminal,
} from "@/app/components/icons";
import type {
  DockerContainersResponse,
  FileRootsResponse,
  LogSourcesResponse,
  SystemdUnitsResponse,
} from "@/lib/types";
import { fetchJson, formatApiError } from "@/lib/client";

type OverviewCardProps = {
  title: string;
  value: string;
  detail: string;
  href: string;
  error?: string | null;
  icon: React.ReactNode;
};

function OverviewCard({ title, value, detail, href, error, icon }: OverviewCardProps) {
  return (
    <Link
      href={href}
      className="group rounded-[24px] border border-orange-500/20 bg-[#120c08]/70 p-5 shadow-[0_10px_30px_rgba(10,6,4,0.6)] transition hover:border-orange-400/60 hover:bg-orange-400/10"
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-amber-200/70">
            {title}
          </div>
          <div className="mt-3 text-2xl font-semibold text-amber-100">
            {value}
          </div>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-full border border-orange-400/40 bg-orange-400/10 text-orange-100">
          {icon}
        </div>
      </div>
      <div className="mt-3 text-sm text-amber-100/70">
        {error ? error : detail}
      </div>
    </Link>
  );
}

export default function PrivateDashboardPage() {
  const [docker, setDocker] = useState<DockerContainersResponse | null>(null);
  const [systemd, setSystemd] = useState<SystemdUnitsResponse | null>(null);
  const [roots, setRoots] = useState<FileRootsResponse | null>(null);
  const [sources, setSources] = useState<LogSourcesResponse | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadOverview = useCallback(async () => {
    setIsLoading(true);
    const [dockerResult, systemdResult, rootsResult, sourcesResult] =
      await Promise.all([
        fetchJson<DockerContainersResponse>("/api/private/docker"),
        fetchJson<SystemdUnitsResponse>("/api/private/systemd"),
        fetchJson<FileRootsResponse>("/api/private/files/roots"),
        fetchJson<LogSourcesResponse>("/api/private/logs/sources"),
      ]);

    const nextErrors: Record<string, string> = {};

    if (dockerResult.ok) {
      setDocker(dockerResult.data);
    } else {
      nextErrors.docker = formatApiError(dockerResult.error);
    }

    if (systemdResult.ok) {
      setSystemd(systemdResult.data);
    } else {
      nextErrors.systemd = formatApiError(systemdResult.error);
    }

    if (rootsResult.ok) {
      setRoots(rootsResult.data);
    } else {
      nextErrors.files = formatApiError(rootsResult.error);
    }

    if (sourcesResult.ok) {
      setSources(sourcesResult.data);
    } else {
      nextErrors.logs = formatApiError(sourcesResult.error);
    }

    setErrors(nextErrors);
    setLastUpdated(new Date());
    setIsLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    void loadOverview();
  }, [loadOverview]);

  const containerSummary = useMemo(() => {
    const containers = docker?.containers ?? [];
    const running = containers.filter((item) => item.state === "running").length;
    const unhealthy = containers.filter((item) => item.health === "unhealthy").length;
    return { total: containers.length, running, unhealthy };
  }, [docker]);

  const unitSummary = useMemo(() => {
    const units = systemd?.units ?? [];
    const failed = units.filter((item) => item.activeState === "failed").length;
    return { total: units.length, failed };
  }, [systemd]);

  const updatedLabel = lastUpdated ? lastUpdated.toLocaleTimeString() : "--";

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-[28px] border border-orange-500/20 bg-[#120c08]/80 p-6">
        <div>
          <h2 className="font-[var(--font-display)] text-2xl text-amber-100">
            Private Overview
          </h2>
          <p className="mt-2 text-sm text-amber-100/70">
            Snapshot of services, files, and log sources.
          </p>
          <p className="mt-1 text-xs uppercase tracking-[0.3em] text-amber-200/60">
            Updated {updatedLabel}
          </p>
        </div>
        <button
          className="flex h-11 w-11 items-center justify-center rounded-full border border-orange-400/40 bg-orange-400/10 text-orange-100 transition hover:border-orange-300 hover:bg-orange-400/20"
          type="button"
          onClick={() => void loadOverview()}
          disabled={isLoading}
          aria-label="Refresh overview"
          title="Refresh overview"
        >
          <IconRefresh className="h-5 w-5" />
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <OverviewCard
          title="Docker"
          value={isLoading ? "Loading..." : String(containerSummary.total)}
          detail={`${containerSummary.running} running · ${containerSummary.unhealthy} unhealthy`}
          href="/app/services"
          error={errors.docker ?? null}
          icon={<IconServer className="h-5 w-5" />}
        />
        <OverviewCard
          title="systemd"
          value={isLoading ? "Loading..." : String(unitSummary.total)}
          detail={`${unitSummary.failed} failed`}
          href="/app/services"
          error={errors.systemd ?? null}
          icon={<IconGrid className="h-5 w-5" />}
        />
        <OverviewCard
          title="Files"
          value={isLoading ? "Loading..." : String(roots?.roots?.length ?? 0)}
          detail="Allowlisted roots available"
          href="/app/files"
          error={errors.files ?? null}
          icon={<IconFolder className="h-5 w-5" />}
        />
        <OverviewCard
          title="Logs"
          value={isLoading ? "Loading..." : String(sources?.sources?.length ?? 0)}
          detail="Configured log sources"
          href="/app/logs"
          error={errors.logs ?? null}
          icon={<IconTerminal className="h-5 w-5" />}
        />
      </div>
    </section>
  );
}
