"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IconRefresh, IconTerminal } from "@/app/components/icons";
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
  const logRef = useRef<HTMLPreElement | null>(null);

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

  useEffect(() => {
    if (!logRef.current) return;
    logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [content]);

  const activeSource = useMemo(
    () => sources.find((source) => source.id === currentSource) ?? null,
    [sources, currentSource]
  );

  const updatedLabel = lastUpdated ? lastUpdated.toLocaleTimeString() : "--";

  return (
    <section className="space-y-6">
      <div className="rounded-[28px] border border-orange-500/20 bg-[#120c08]/80 p-6">
        <h2 className="font-[var(--font-display)] text-2xl text-amber-100">
          Log Stream
        </h2>
        <p className="mt-2 text-xs text-amber-100/70">
          Tail logs for allowlisted services and containers.
        </p>
        <p className="mt-2 text-xs uppercase tracking-[0.3em] text-amber-200/60">
          Updated {updatedLabel}
        </p>
      </div>

      <div className="rounded-[24px] border border-orange-500/20 bg-[#120c08]/70 p-5">
        <div className="text-xs uppercase tracking-[0.3em] text-amber-200/70">
          Log Source
        </div>
        {sourcesError ? (
          <div className="mt-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            {sourcesError}
          </div>
        ) : loadingSources ? (
          <div className="mt-3 text-sm text-amber-100/70">Loading sources...</div>
        ) : sources.length === 0 ? (
          <div className="mt-3 text-sm text-amber-100/70">
            No log sources configured.
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <select
              className="rounded-2xl border border-orange-500/30 bg-black/40 px-4 py-2 text-sm text-amber-50 focus:border-orange-300/70 focus:outline-none"
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
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-amber-200/60">
                <IconTerminal className="h-4 w-4" />
                {activeSource.type}
              </div>
            ) : null}
          </div>
        )}
      </div>

      <div className="rounded-[24px] border border-orange-500/20 bg-[#120c08]/70 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs uppercase tracking-[0.3em] text-amber-200/70">
            Tail Controls
          </div>
          <button
            className="flex h-11 w-11 items-center justify-center rounded-full border border-orange-400/40 bg-orange-400/10 text-orange-100 transition hover:border-orange-300 hover:bg-orange-400/20"
            type="button"
            onClick={() => void loadTail(currentSource, lines)}
            disabled={!currentSource || loadingTail}
            aria-label="Refresh log tail"
            title="Refresh log tail"
          >
            <IconRefresh className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-amber-100/70">
          <label className="text-xs uppercase tracking-[0.3em] text-amber-200/70">
            Lines
          </label>
          <input
            className="w-24 rounded-2xl border border-orange-500/30 bg-black/40 px-3 py-2 text-sm text-amber-50 focus:border-orange-300/70 focus:outline-none"
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
          <div className="mt-4 text-sm text-amber-100/70">
            {loadingTail ? "Loading logs..." : "No log output returned for this source."}
          </div>
        ) : (
          <pre
            ref={logRef}
            className="themed-scrollbar mt-4 max-h-[480px] overflow-y-auto rounded-2xl border border-orange-500/20 bg-black/50 p-4 text-xs text-amber-100/90 whitespace-pre-wrap break-words"
          >
            {content}
          </pre>
        )}
      </div>
    </section>
  );
}
