"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IconArrowRight, IconClock, IconRefresh } from "@/app/components/icons";
import type {
  LogSourceInfo,
  LogSourcesResponse,
  LogTailResponse,
} from "@/lib/types";
import { fetchJson, formatApiError } from "@/lib/client";

const DEFAULT_LINES = 200;
const POLL_INTERVAL_MS = 1000;

export default function LogsPage() {
  const [sources, setSources] = useState<LogSourceInfo[]>([]);
  const [currentSource, setCurrentSource] = useState<string>("");
  const [lines, setLines] = useState<number>(DEFAULT_LINES);
  const [content, setContent] = useState<string>("");
  const [sourcesError, setSourcesError] = useState<string | null>(null);
  const [tailError, setTailError] = useState<string | null>(null);
  const [loadingSources, setLoadingSources] = useState(true);
  const [loadingTail, setLoadingTail] = useState(false);
  const logRef = useRef<HTMLPreElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const clampLines = useCallback((value: number) => {
    if (!Number.isFinite(value)) return DEFAULT_LINES;
    return Math.min(500, Math.max(50, value));
  }, []);

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
    let mounted = true;

    const poll = async () => {
      if (!mounted) return;
      await loadTail(currentSource, lines);
    };

    void poll();
    const interval = setInterval(() => {
      void poll();
    }, POLL_INTERVAL_MS);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [currentSource, lines, loadTail]);

  useEffect(() => {
    if (!logRef.current) return;
    logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [content]);

  useEffect(() => {
    if (!isMenuOpen) return;
    const handleClick = (event: MouseEvent) => {
      if (!dropdownRef.current) return;
      if (!dropdownRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", handleClick);
    return () => window.removeEventListener("mousedown", handleClick);
  }, [isMenuOpen]);

  const activeSource = useMemo(
    () => sources.find((source) => source.id === currentSource) ?? null,
    [sources, currentSource]
  );

  return (
    <section className="space-y-6">
      <div className="rounded-[28px] border border-orange-500/20 bg-[#120c08]/80 p-6">
        <h2 className="font-[var(--font-display)] text-2xl text-amber-100">
          Log Stream
        </h2>
        <p className="mt-2 text-xs text-amber-100/70">
          Tail logs for allowlisted services and containers.
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
            <div ref={dropdownRef} className="relative">
              <button
                className="flex min-w-[220px] items-center justify-between gap-3 rounded-2xl border border-orange-500/30 bg-black/40 px-4 py-2 text-sm text-amber-50 transition hover:border-orange-300/70"
                type="button"
                onClick={() => setIsMenuOpen((prev) => !prev)}
                aria-haspopup="listbox"
                aria-expanded={isMenuOpen}
              >
                <span className="truncate">
                  {activeSource?.label ?? "Select source"}
                </span>
                <IconArrowRight
                  className={`h-4 w-4 text-amber-200/70 transition ${
                    isMenuOpen ? "-rotate-90" : "rotate-90"
                  }`}
                />
              </button>
              {isMenuOpen ? (
                <div className="absolute z-20 mt-2 w-full rounded-2xl border border-orange-500/40 bg-[#120c08] p-2 shadow-[0_16px_40px_rgba(6,4,2,0.7)]">
                  <div className="max-h-64 overflow-y-auto themed-scrollbar">
                    {sources.map((source) => {
                      const isActive = source.id === currentSource;
                      return (
                        <button
                          key={source.id}
                          type="button"
                          className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition ${
                            isActive
                              ? "bg-orange-400/15 text-amber-100"
                              : "text-amber-100/80 hover:bg-orange-400/10 hover:text-amber-100"
                          }`}
                          onClick={() => {
                            setCurrentSource(source.id);
                            setIsMenuOpen(false);
                          }}
                          role="option"
                          aria-selected={isActive}
                        >
                          <span className="truncate">{source.label}</span>
                          {isActive ? (
                            <span className="text-[10px] uppercase tracking-[0.3em] text-amber-200/70">
                              Active
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
            {activeSource ? (
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-amber-200/60">
                <IconClock className="h-4 w-4" />
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
          <div className="flex items-center gap-2 rounded-2xl border border-orange-500/30 bg-black/40 px-3 py-2">
            <input
              className="no-number-spin w-20 appearance-none bg-transparent text-sm text-amber-50 focus:outline-none"
              type="number"
              min={50}
              max={500}
              step={10}
              value={lines}
              onChange={(event) => {
                const value = Number(event.target.value);
                setLines(clampLines(value));
              }}
            />
            <div className="flex flex-col">
              <button
                type="button"
                className="flex h-5 w-6 items-center justify-center rounded-md border border-orange-400/40 bg-orange-400/10 text-orange-100 transition hover:border-orange-300 hover:bg-orange-400/20"
                onClick={() => setLines((prev) => clampLines(prev + 10))}
                aria-label="Increase lines"
                title="Increase lines"
              >
                <IconArrowRight className="h-3 w-3 -rotate-90" />
              </button>
              <button
                type="button"
                className="mt-1 flex h-5 w-6 items-center justify-center rounded-md border border-orange-400/40 bg-orange-400/10 text-orange-100 transition hover:border-orange-300 hover:bg-orange-400/20"
                onClick={() => setLines((prev) => clampLines(prev - 10))}
                aria-label="Decrease lines"
                title="Decrease lines"
              >
                <IconArrowRight className="h-3 w-3 rotate-90" />
              </button>
            </div>
          </div>
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
