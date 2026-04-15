"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  IconDownload,
  IconFile,
  IconFolder,
  IconRefresh,
} from "@/app/components/icons";
import type {
  FileEntry,
  FileListResponse,
  FileRootInfo,
  FileRootsResponse,
  FilesZipDownloadRequest,
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

function extractDownloadFileName(contentDisposition: string | null): string | null {
  if (!contentDisposition) return null;
  const fileNameStar = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (fileNameStar?.[1]) {
    try {
      return decodeURIComponent(fileNameStar[1]);
    } catch {
      return fileNameStar[1];
    }
  }

  const fileName = contentDisposition.match(/filename="?([^";]+)"?/i);
  return fileName?.[1] ?? null;
}

async function readDownloadError(response: Response): Promise<string> {
  const contentType = response.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      const payload = (await response.json()) as { error?: string };
      if (payload?.error) return payload.error;
    }
    const text = await response.text();
    return text || "Request failed";
  } catch {
    return "Request failed";
  }
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
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedFilePaths, setSelectedFilePaths] = useState<string[]>([]);
  const [downloadingSelection, setDownloadingSelection] = useState(false);

  const loadRoots = useCallback(async () => {
    setLoadingRoots(true);
    const result = await fetchJson<FileRootsResponse>(
      "/api/private/files/roots"
    );
    if (result.ok) {
      const nextRoots = result.data.roots ?? [];
      setRoots(nextRoots);
      setRootsError(null);
      setCurrentRoot((prev) =>
        prev && nextRoots.some((root) => root.id === prev) ? prev : ""
      );
      setCurrentPath("");
      setSelectedFilePaths([]);
      setMultiSelectMode(false);
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
    const items = [{ label: activeRoot?.label ?? "Root", path: "" }];
    segments.forEach((segment, index) => {
      const nextPath = segments.slice(0, index + 1).join("/");
      items.push({ label: segment, path: nextPath });
    });
    return items;
  }, [currentPath, activeRoot]);

  const folderZipUrl = useMemo(() => {
    if (!currentRoot) return null;
    const params = new URLSearchParams({ root: currentRoot });
    if (currentPath) {
      params.set("path", currentPath);
    }
    return `/api/private/files/zip?${params.toString()}`;
  }, [currentRoot, currentPath]);

  const selectedFileSet = useMemo(() => new Set(selectedFilePaths), [selectedFilePaths]);
  const selectedCount = selectedFilePaths.length;

  const toggleSelectedFile = useCallback((filePath: string) => {
    setSelectedFilePaths((prev) =>
      prev.includes(filePath)
        ? prev.filter((path) => path !== filePath)
        : [...prev, filePath]
    );
  }, []);

  const clearSelectedFiles = useCallback(() => {
    setSelectedFilePaths([]);
  }, []);

  const navigateToPath = useCallback((nextPath: string) => {
    setCurrentPath(nextPath);
    setSelectedFilePaths([]);
  }, []);

  const toggleMultiSelect = useCallback(() => {
    setMultiSelectMode((prev) => {
      if (prev) {
        setSelectedFilePaths([]);
      }
      return !prev;
    });
  }, []);

  const downloadSelectedFilesZip = useCallback(async () => {
    if (!currentRoot || selectedFilePaths.length === 0 || downloadingSelection) {
      return;
    }

    setDownloadingSelection(true);
    setEntriesError(null);

    let response: Response;
    try {
      const payload: FilesZipDownloadRequest = {
        root: currentRoot,
        paths: selectedFilePaths,
      };
      response = await fetch("/api/private/files/zip", {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
    } catch {
      setEntriesError("Ops agent unavailable or returned an error.");
      setDownloadingSelection(false);
      return;
    }

    if (!response.ok) {
      const message = await readDownloadError(response);
      setEntriesError(
        formatApiError({
          status: response.status,
          message,
        })
      );
      setDownloadingSelection(false);
      return;
    }

    const blob = await response.blob();
    const fileName =
      extractDownloadFileName(response.headers.get("content-disposition")) ??
      "selection.zip";

    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = fileName;
    anchor.style.display = "none";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);

    setDownloadingSelection(false);
    setSelectedFilePaths([]);
  }, [currentRoot, downloadingSelection, selectedFilePaths]);

  const showRoots = !currentRoot;

  return (
    <section className="w-full space-y-6">
      <div className="rounded-[28px] border border-orange-500/20 bg-[#120c08]/80 p-6">
        <h2 className="font-[var(--font-display)] text-2xl text-amber-100">
          File Explorer
        </h2>
        <p className="mt-2 text-xs text-amber-100/70">
          Browse allowlisted roots and download files securely.
        </p>
      </div>
      {showRoots ? (
        <div className="rounded-[24px] border border-orange-500/20 bg-[#120c08]/70 p-5">
          <div className="text-xs uppercase tracking-[0.3em] text-amber-200/70">
            Roots
          </div>
          <div className="mt-2 text-xs text-amber-100/70">
            Select a root to open the vault.
          </div>
          {rootsError ? (
            <div className="mt-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
              {rootsError}
            </div>
          ) : loadingRoots ? (
            <div className="mt-3 text-sm text-amber-100/70">Loading roots...</div>
          ) : roots.length === 0 ? (
            <div className="mt-3 text-sm text-amber-100/70">
              No allowlisted roots configured.
            </div>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {roots.map((root) => (
                <button
                  key={root.id}
                  type="button"
                  onClick={() => {
                    setCurrentRoot(root.id);
                    setCurrentPath("");
                    setSelectedFilePaths([]);
                    setMultiSelectMode(false);
                  }}
                  className="flex items-center gap-4 rounded-[20px] border border-orange-500/20 bg-black/40 px-4 py-4 text-left transition hover:border-orange-400/60 hover:bg-orange-400/10"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-orange-400/40 bg-orange-400/10 text-orange-100">
                    <IconFolder className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-amber-100">
                      {root.label}
                    </div>
                    <div className="text-[10px] uppercase tracking-[0.3em] text-amber-200/60">
                      Root folder
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-[24px] border border-orange-500/20 bg-[#120c08]/70 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.3em] text-amber-200/70">
                Location
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-amber-100/80">
                {breadcrumbs.map((crumb, index) => (
                  <button
                    key={crumb.path}
                    type="button"
                    onClick={() => navigateToPath(crumb.path)}
                    className="rounded-full border border-orange-500/20 px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-amber-100/70 transition hover:border-orange-400/60 hover:text-amber-100"
                  >
                    {index === 0 ? "Home" : crumb.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                className="flex items-center gap-2 rounded-full border border-orange-400/40 bg-orange-400/10 px-4 py-2 text-[10px] uppercase tracking-[0.3em] text-orange-100 transition hover:border-orange-300 hover:bg-orange-400/20"
                type="button"
                onClick={() => {
                  setCurrentRoot("");
                  setCurrentPath("");
                  setEntries([]);
                  setEntriesError(null);
                  setSelectedFilePaths([]);
                  setMultiSelectMode(false);
                }}
              >
                Back to roots
              </button>
              <a
                className="flex items-center gap-2 rounded-full border border-orange-400/40 bg-orange-400/10 px-4 py-2 text-[10px] uppercase tracking-[0.3em] text-orange-100 transition hover:border-orange-300 hover:bg-orange-400/20"
                href={folderZipUrl ?? "#"}
                aria-label="Download current folder as zip"
                title="Download current folder as zip"
                onClick={(event) => {
                  if (!folderZipUrl) {
                    event.preventDefault();
                  }
                }}
              >
                <IconDownload className="h-4 w-4" />
                Folder zip
              </a>
              <button
                className="flex items-center gap-2 rounded-full border border-orange-400/40 bg-orange-400/10 px-4 py-2 text-[10px] uppercase tracking-[0.3em] text-orange-100 transition hover:border-orange-300 hover:bg-orange-400/20"
                type="button"
                onClick={toggleMultiSelect}
                aria-pressed={multiSelectMode}
              >
                {multiSelectMode ? "Exit select" : "Select files"}
              </button>
              {multiSelectMode ? (
                <>
                  <button
                    className="flex items-center gap-2 rounded-full border border-orange-400/40 bg-orange-400/10 px-4 py-2 text-[10px] uppercase tracking-[0.3em] text-orange-100 transition hover:border-orange-300 hover:bg-orange-400/20 disabled:cursor-not-allowed disabled:opacity-60"
                    type="button"
                    onClick={() => {
                      void downloadSelectedFilesZip();
                    }}
                    disabled={selectedCount === 0 || downloadingSelection}
                  >
                    {downloadingSelection
                      ? "Preparing zip"
                      : `Download selected (${selectedCount})`}
                  </button>
                  <button
                    className="flex items-center gap-2 rounded-full border border-orange-400/40 bg-orange-400/10 px-4 py-2 text-[10px] uppercase tracking-[0.3em] text-orange-100 transition hover:border-orange-300 hover:bg-orange-400/20 disabled:cursor-not-allowed disabled:opacity-60"
                    type="button"
                    onClick={clearSelectedFiles}
                    disabled={selectedCount === 0 || downloadingSelection}
                  >
                    Clear
                  </button>
                </>
              ) : null}
              <button
                className="flex h-11 w-11 items-center justify-center rounded-full border border-orange-400/40 bg-orange-400/10 text-orange-100 transition hover:border-orange-300 hover:bg-orange-400/20"
                type="button"
                onClick={() => {
                  if (currentRoot) {
                    void loadEntries(currentRoot, currentPath);
                  }
                }}
                disabled={!currentRoot || loadingEntries}
                aria-label="Refresh file listing"
                title="Refresh file listing"
              >
                <IconRefresh className="h-5 w-5" />
              </button>
            </div>
          </div>

          {entriesError ? (
            <div className="mt-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
              {entriesError}
            </div>
          ) : loadingEntries ? (
            <div className="mt-4 text-sm text-amber-100/70">Loading entries...</div>
          ) : entries.length === 0 ? (
            <div className="mt-4 text-sm text-amber-100/70">
              {currentRoot ? "No files found in this folder." : "Select a root to browse."}
            </div>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {entries.map((entry) => {
                const entryPath = joinPath(currentPath, entry.name);
                const downloadParams = new URLSearchParams({
                  root: currentRoot,
                  path: entryPath,
                });
                const downloadUrl = `/api/private/files/download?${downloadParams.toString()}`;
                const isDir = entry.type === "dir";
                const isFile = entry.type === "file";
                const isSelected = selectedFileSet.has(entryPath);

                return (
                  <div
                    key={`${entry.type}-${entry.name}`}
                    className={`group relative rounded-[20px] border bg-black/40 p-4 transition hover:border-orange-400/60 ${
                      multiSelectMode && isFile && isSelected
                        ? "border-orange-300/80 bg-orange-400/10"
                        : "border-orange-500/20"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-4">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-orange-400/40 bg-orange-400/10 text-orange-100">
                          {isDir ? (
                            <IconFolder className="h-5 w-5" />
                          ) : (
                            <IconFile className="h-5 w-5" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-amber-100">
                            {entry.name}
                          </div>
                          <div className="text-[10px] uppercase tracking-[0.3em] text-amber-200/50">
                            {entry.type}
                          </div>
                        </div>
                      </div>

                      {multiSelectMode && isFile ? (
                        <button
                          className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.3em] transition ${
                            isSelected
                              ? "border-orange-300/80 bg-orange-400/20 text-orange-100"
                              : "border-orange-500/30 text-amber-100/80 hover:border-orange-300/60"
                          }`}
                          type="button"
                          onClick={() => toggleSelectedFile(entryPath)}
                          aria-pressed={isSelected}
                          title={isSelected ? "Deselect file" : "Select file"}
                        >
                          {isSelected ? "Selected" : "Select"}
                        </button>
                      ) : null}
                    </div>
                    <div className="mt-3 text-xs text-amber-100/60">
                      {formatBytes(entry.sizeBytes)} | {formatModified(entry.modifiedMs)}
                    </div>

                    <div className="absolute inset-0 flex items-center justify-center rounded-[20px] bg-black/70 opacity-0 transition group-hover:opacity-100">
                      {isDir ? (
                        <button
                          className="flex h-12 w-12 items-center justify-center rounded-full border border-orange-400/50 bg-orange-400/10 text-orange-100"
                          type="button"
                          onClick={() => navigateToPath(entryPath)}
                          aria-label="Open folder"
                          title="Open folder"
                        >
                          <IconFolder className="h-5 w-5" />
                        </button>
                      ) : isFile ? (
                        multiSelectMode ? (
                          <span className="text-xs uppercase tracking-[0.3em] text-amber-200/70">
                            Selection mode
                          </span>
                        ) : (
                          <a
                            className="flex h-12 w-12 items-center justify-center rounded-full border border-orange-400/50 bg-orange-400/10 text-orange-100"
                            href={downloadUrl}
                            aria-label="Download file"
                            title="Download file"
                          >
                            <IconDownload className="h-5 w-5" />
                          </a>
                        )
                      ) : (
                        <span className="text-xs uppercase tracking-[0.3em] text-amber-200/60">
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
      )}
    </section>
  );
}
