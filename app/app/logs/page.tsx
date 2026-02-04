"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  LogSourceInfo,
  LogSourcesResponse,
  LogTailResponse,
} from "@/lib/types";
import { fetchJson, formatApiError } from "@/lib/client";

const DEFAULT_LINES = 200;

export default function LogsPage() {
  const [sources, setSources] = useState<LogSourceInfo[]>([]);
  const [currentSource, setCurrentSource] = useState<string>("");
  const [lines, setLines] = useState<number>(DEFAULT_LINES);
  const [content, setContent] = useState<string>("");
  const [sourcesError, setSourcesError] = useState<string | null>(null);
  const [tailError, setTailError] = useState<string | null>(null);
  const [loadingSources, setLoadingSources] = useState(true);
  const [loadingTail, setLoadingTail] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadSources = useCallback(async () => {
    setLoadingSources(true);
    const result = await fetchJson<LogSourcesResponse>(
      "/api/private/logs/sources"
    );
    if (result.ok) {
      const nextSources = result.data.sources ?? [];
      setSources(nextSources);
      setSourcesError(null);
      if (nextSources.length > 0) {
        setCurrentSource((prev) => (prev ? prev : nextSources[0].id));
      }
    } else {
      setSourcesError(formatApiError(result.error));
    }
    setLoadingSources(false);
  }, []);

  const loadTail = useCallback(async (sourceId: string, lineCount: number) => {
    if (!sourceId) return;
    setLoadingTail(true);
    const params = new URLSearchParams({
      source: sourceId,
      lines: String(lineCount),
    });
    const result = await fetchJson<LogTailResponse>(
      `/api/private/logs/tail?${params.toString()}`
    );
    if (result.ok) {
      setContent(result.data.content ?? "");
      setTailError(null);
      setLastUpdated(new Date());
    } else {
      setTailError(formatApiError(result.error));
      setContent("");
    }
    setLoadingTail(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    void loadSources();
  }, [loadSources]);

  useEffect(() => {
    if (!currentSource) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync tail with selection
    void loadTail(currentSource, lines);
  }, [currentSource, lines, loadTail]);

  const activeSource = useMemo(
    () => sources.find((source) => source.id === currentSource) ?? null,
    [sources, currentSource]
  );

  const updatedLabel = lastUpdated
    ? lastUpdated.toLocaleTimeString()
    : "--";

  return (
    <section className="space-y-6">
      <div className="rounded-3xl border border-amber-200/10 bg-slate-900/70 p-6">
        <h2 className="text-xl font-semibold">Logs</h2>
        <p className="mt-2 text-sm text-slate-400">
          Tail logs for allowlisted services and containers.
        </p>
        <p className="mt-2 text-xs uppercase tracking-[0.3em] text-slate-500">
          Updated {updatedLabel}
        </p>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
        <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
          Log Source
        </div>
        {sourcesError ? (
          <div className="mt-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            {sourcesError}
          </div>
        ) : loadingSources ? (
          <div className="mt-3 text-sm text-slate-400">Loading sources...</div>
        ) : sources.length === 0 ? (
          <div className="mt-3 text-sm text-slate-400">
            No log sources configured.
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <select
              className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-2 text-sm text-slate-100 focus:border-amber-300/70 focus:outline-none"
              value={currentSource}
              onChange={(event) => setCurrentSource(event.target.value)}
            >
              {sources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.label}
                </option>
              ))}
            </select>
            {activeSource ? (
              <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                {activeSource.type}
              </div>
            ) : null}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
            Tail Controls
          </div>
          <button
            className="rounded-full border border-amber-400/40 bg-amber-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-amber-100 transition hover:border-amber-300/70 hover:bg-amber-400/20"
            type="button"
            onClick={() => void loadTail(currentSource, lines)}
            disabled={!currentSource || loadingTail}
          >
            {loadingTail ? "Loading..." : "Refresh"}
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-slate-300">
          <label className="text-xs uppercase tracking-[0.2em] text-slate-500">
            Lines
          </label>
          <input
            className="w-24 rounded-2xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-amber-300/70 focus:outline-none"
            type="number"
            min={50}
            max={500}
            value={lines}
            onChange={(event) => setLines(Number(event.target.value))}
          />
        </div>

        {tailError ? (
          <div className="mt-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            {tailError}
          </div>
        ) : content.length === 0 ? (
          <div className="mt-4 text-sm text-slate-400">
            {loadingTail
              ? "Loading logs..."
              : "No log output returned for this source."}
          </div>
        ) : (
          <pre className="mt-4 max-h-[480px] overflow-auto rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-xs text-slate-200">
            {content}
          </pre>
        )}
      </div>
    </section>
  );
}
