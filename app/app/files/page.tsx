"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  FileEntry,
  FileListResponse,
  FileRootInfo,
  FileRootsResponse,
} from "@/lib/types";
import { fetchJson, formatApiError } from "@/lib/client";

function formatBytes(bytes: number | null): string {
  if (!bytes && bytes !== 0) return "--";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatModified(ms: number | null): string {
  if (!ms && ms !== 0) return "--";
  return new Date(ms).toLocaleString();
}

function joinPath(base: string, name: string): string {
  if (!base) return name;
  return `${base.replace(/\/$/, "")}/${name}`;
}

export default function FilesPage() {
  const [roots, setRoots] = useState<FileRootInfo[]>([]);
  const [currentRoot, setCurrentRoot] = useState<string>("");
  const [currentPath, setCurrentPath] = useState<string>("");
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [rootsError, setRootsError] = useState<string | null>(null);
  const [entriesError, setEntriesError] = useState<string | null>(null);
  const [loadingRoots, setLoadingRoots] = useState(true);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadRoots = useCallback(async () => {
    setLoadingRoots(true);
    const result = await fetchJson<FileRootsResponse>(
      "/api/private/files/roots"
    );
    if (result.ok) {
      const nextRoots = result.data.roots ?? [];
      setRoots(nextRoots);
      setRootsError(null);
      if (nextRoots.length > 0) {
        setCurrentRoot((prev) => (prev ? prev : nextRoots[0].id));
      }
    } else {
      setRootsError(formatApiError(result.error));
    }
    setLoadingRoots(false);
  }, []);

  const loadEntries = useCallback(async (rootId: string, path: string) => {
    setLoadingEntries(true);
    const params = new URLSearchParams({ root: rootId });
    if (path) {
      params.set("path", path);
    }
    const result = await fetchJson<FileListResponse>(
      `/api/private/files/list?${params.toString()}`
    );
    if (result.ok) {
      setEntries(result.data.entries ?? []);
      setEntriesError(null);
      setLastUpdated(new Date());
    } else {
      setEntriesError(formatApiError(result.error));
      setEntries([]);
    }
    setLoadingEntries(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    void loadRoots();
  }, [loadRoots]);

  useEffect(() => {
    if (!currentRoot) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync entries on navigation
    void loadEntries(currentRoot, currentPath);
  }, [currentRoot, currentPath, loadEntries]);

  const activeRoot = useMemo(
    () => roots.find((root) => root.id === currentRoot) ?? null,
    [roots, currentRoot]
  );

  const breadcrumbs = useMemo(() => {
    const segments = currentPath.split("/").filter(Boolean);
    const items = [{ label: "Root", path: "" }];
    segments.forEach((segment, index) => {
      const nextPath = segments.slice(0, index + 1).join("/");
      items.push({ label: segment, path: nextPath });
    });
    return items;
  }, [currentPath]);

  const updatedLabel = lastUpdated
    ? lastUpdated.toLocaleTimeString()
    : "--";

  return (
    <section className="space-y-6">
      <div className="rounded-3xl border border-amber-200/10 bg-slate-900/70 p-6">
        <h2 className="text-xl font-semibold">Files</h2>
        <p className="mt-2 text-sm text-slate-400">
          Browse allowlisted roots and download files securely.
        </p>
        <p className="mt-2 text-xs uppercase tracking-[0.3em] text-slate-500">
          Updated {updatedLabel}
        </p>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
        <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
          Root Selector
        </div>
        {rootsError ? (
          <div className="mt-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            {rootsError}
          </div>
        ) : loadingRoots ? (
          <div className="mt-3 text-sm text-slate-400">Loading roots...</div>
        ) : roots.length === 0 ? (
          <div className="mt-3 text-sm text-slate-400">
            No allowlisted roots configured.
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <select
              className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-2 text-sm text-slate-100 focus:border-amber-300/70 focus:outline-none"
              value={currentRoot}
              onChange={(event) => {
                setCurrentRoot(event.target.value);
                setCurrentPath("");
              }}
            >
              {roots.map((root) => (
                <option key={root.id} value={root.id}>
                  {root.label}
                </option>
              ))}
            </select>
            {activeRoot ? (
              <div className="text-xs text-slate-500">
                {activeRoot.path}
              </div>
            ) : null}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
              Location
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-200">
              {breadcrumbs.map((crumb, index) => (
                <button
                  key={crumb.path}
                  type="button"
                  onClick={() => setCurrentPath(crumb.path)}
                  className="rounded-full border border-slate-800 px-3 py-1 text-xs uppercase tracking-[0.2em] text-slate-300 transition hover:border-amber-300/50 hover:text-amber-100"
                >
                  {index === 0 ? "Root" : crumb.label}
                </button>
              ))}
            </div>
          </div>
          <button
            className="rounded-full border border-amber-400/40 bg-amber-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-amber-100 transition hover:border-amber-300/70 hover:bg-amber-400/20"
            type="button"
            onClick={() => {
              if (currentRoot) {
                void loadEntries(currentRoot, currentPath);
              }
            }}
            disabled={!currentRoot || loadingEntries}
          >
            {loadingEntries ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {entriesError ? (
          <div className="mt-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            {entriesError}
          </div>
        ) : loadingEntries ? (
          <div className="mt-4 text-sm text-slate-400">Loading entries...</div>
        ) : entries.length === 0 ? (
          <div className="mt-4 text-sm text-slate-400">
            {currentRoot ? "No files found in this folder." : "Select a root to browse."}
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {entries.map((entry) => {
              const entryPath = joinPath(currentPath, entry.name);
              const downloadParams = new URLSearchParams({
                root: currentRoot,
                path: entryPath,
              });
              const downloadUrl = `/api/private/files/download?${downloadParams.toString()}`;

              return (
                <div
                  key={`${entry.type}-${entry.name}`}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-100">
                      {entry.name}
                    </div>
                    <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                      {entry.type}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400">
                    <div>{formatBytes(entry.sizeBytes)}</div>
                    <div>{formatModified(entry.modifiedMs)}</div>
                    {entry.type === "dir" ? (
                      <button
                        className="rounded-full border border-slate-800 px-3 py-1 text-xs uppercase tracking-[0.2em] text-slate-300 transition hover:border-amber-300/50 hover:text-amber-100"
                        type="button"
                        onClick={() => setCurrentPath(entryPath)}
                      >
                        Open
                      </button>
                    ) : entry.type === "file" ? (
                      <a
                        className="rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-amber-100 transition hover:border-amber-300/70 hover:bg-amber-400/20"
                        href={downloadUrl}
                      >
                        Download
                      </a>
                    ) : (
                      <span className="rounded-full border border-slate-800 px-3 py-1 text-xs uppercase tracking-[0.2em] text-slate-500">
                        Unavailable
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
