"use client";

import "hack-font/build/web/hack.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { IconTerminal } from "@/app/components/icons";
import { fetchJson } from "@/lib/client";
import {
  canResizeTerminalState,
  canStartLifecycleAction,
  didFallbackCdCommandFail,
  normalizeBackendFallbackCwd,
  resolveFallbackCdPromptContext,
  shouldApplyPendingFallbackPromptContext,
  shouldApplyShellDerivedFallbackPrompt,
  shouldRenderFallbackPromptOnClose,
  shouldRenderFallbackPromptOnShellBoundary,
  shouldRenderFallbackPrompt,
  shouldRenderFallbackPromptOnIdle,
  shouldProcessPollResult,
} from "./lifecycle";
import {
  formatTerminalApiError,
  isTerminalSessionUnavailable,
} from "./errors";
import { prepareRunCommand } from "./command-format";
import type {
  TerminalCloseResponse,
  TerminalInputResponse,
  TerminalOutputResponse,
  TerminalResizeResponse,
  TerminalSessionCreateResponse,
} from "@/lib/types";

const OUTPUT_POLL_MS = 350;
const RECENT_LIMIT = 3;
const RECENT_STORAGE_KEY = "terminal.recent";
const FAVORITES_STORAGE_KEY = "terminal.favorites";
const FALLBACK_PROMPT_DEFAULT_USER = "operator";
const FALLBACK_PROMPT_DEFAULT_HOST = "terminal";
const FALLBACK_PROMPT_DEFAULT_DIR = "chitragupt";
const FALLBACK_PROMPT_PATTERN = /(^|\r?\n)[^\r\n]*[#$%>]\s*$/;
const FALLBACK_PROMPT_ANSI_PATTERN =
  /(^|\r?\n)(?:\x1b\[[0-9;?]*[ -/]*[@-~])*[^\r\n]*[#$%>]\s*$/;
const FALLBACK_PROMPT_CONTROL_PATTERN =
  /(^|\r?\n)(?:\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\))*[^\r\n]*[#$%>]\s*$/;

type FallbackPromptContext = {
  user?: string;
  host?: string;
  cwd: string;
  previousCwd: string | null;
};

function readLocalList(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
      .filter((entry) => entry.length > 0);
  } catch {
    return [];
  }
}

function writeLocalList(key: string, values: string[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(values));
}

type TerminalState = "connecting" | "ready" | "running" | "closed" | "error";

function normalizeTerminalInput(data: string): string {
  // xterm emits Enter as carriage return; normalize for consistent shell execution.
  return data.replace(/\r/g, "\n");
}

function basenameFromPath(value: string): string {
  if (!value) return FALLBACK_PROMPT_DEFAULT_DIR;
  const parts = value.split(/[\\/]+/).filter(Boolean);
  return parts.at(-1) ?? FALLBACK_PROMPT_DEFAULT_DIR;
}

function buildFallbackPrompt(
  user: string | undefined,
  host: string | undefined,
  cwd: string | undefined
): string {
  const safeUser = user?.trim() || FALLBACK_PROMPT_DEFAULT_USER;
  const safeHost = host?.trim() || FALLBACK_PROMPT_DEFAULT_HOST;
  const safeDir = basenameFromPath(cwd?.trim() ?? "");
  return `${safeUser}@${safeHost} ${safeDir} $ `;
}

function stripTrailingShellPrompt(
  chunk: string,
  patterns: RegExp[] = [FALLBACK_PROMPT_PATTERN]
): {
  content: string;
  hadPrompt: boolean;
  prompt: string | null;
} {
  const normalized = chunk.replace(/\r\n/g, "\n");
  let match: RegExpMatchArray | null = null;
  for (const pattern of patterns) {
    match = normalized.match(pattern);
    if (match) break;
  }
  if (!match || match.index === undefined) {
    return { content: chunk, hadPrompt: false, prompt: null };
  }

  const stripped = normalized.slice(0, match.index);
  const promptRaw = normalized.slice(match.index).replace(/^\n+/, "");
  return {
    content: stripped.replace(/\n/g, "\r\n"),
    hadPrompt: true,
    prompt: promptRaw.replace(/\n/g, "\r\n") || null,
  };
}

function getStatusLabel(state: TerminalState): string {
  switch (state) {
    case "connecting":
      return "Connecting";
    case "ready":
      return "Ready";
    case "running":
      return "Running";
    case "closed":
      return "Closed";
    case "error":
      return "Error";
    default:
      return "Unknown";
  }
}

export default function TerminalPage() {
  const terminalContainerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const pollTimerRef = useRef<number | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const cursorRef = useRef<number>(0);
  const lineBufferRef = useRef<string>("");
  const escapeSequenceRef = useRef(false);
  const creatingSessionRef = useRef(false);
  const resizeInFlightRef = useRef(false);
  const resizePendingRef = useRef(false);
  const mountedRef = useRef(true);
  const missingSessionErrorShownRef = useRef(false);
  const terminalModeRef = useRef<"pty" | "fallback">("pty");
  const fallbackLineBufferRef = useRef("");
  const fallbackPromptRef = useRef<string>(
    buildFallbackPrompt(undefined, undefined, undefined)
  );
  const fallbackPromptContextRef = useRef<FallbackPromptContext>({
    cwd: "/",
    previousCwd: null,
  });
  const fallbackPromptVisibleRef = useRef(false);
  const fallbackAwaitingPromptRef = useRef(false);
  const fallbackPendingPromptContextRef = useRef<FallbackPromptContext | null>(null);
  const fallbackPendingPromptFailedRef = useRef(false);
  const fallbackSawOutputWhileAwaitingRef = useRef(false);
  const fallbackShouldClientEchoRef = useRef(true);
  const fallbackStartupAwaitingPromptRef = useRef(false);
  const fallbackStartupEmptyPollsRef = useRef(0);

  const [terminalState, setTerminalState] = useState<TerminalState>("connecting");
  const terminalStateRef = useRef<TerminalState>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [recentCommands, setRecentCommands] = useState<string[]>([]);
  const [favoriteCommands, setFavoriteCommands] = useState<string[]>([]);

  const setTerminalStateSafe = useCallback((nextState: TerminalState) => {
    terminalStateRef.current = nextState;
    setTerminalState(nextState);
  }, []);

  useEffect(() => {
    setRecentCommands(readLocalList(RECENT_STORAGE_KEY).slice(0, RECENT_LIMIT));
    setFavoriteCommands(readLocalList(FAVORITES_STORAGE_KEY));
  }, []);

  const addRecentCommand = useCallback((command: string) => {
    const trimmed = command.trim();
    if (!trimmed) return;
    setRecentCommands((prev) => {
      const next = [trimmed, ...prev.filter((entry) => entry !== trimmed)].slice(
        0,
        RECENT_LIMIT
      );
      writeLocalList(RECENT_STORAGE_KEY, next);
      return next;
    });
  }, []);

  const toggleFavoriteCommand = useCallback((command: string) => {
    const trimmed = command.trim();
    if (!trimmed) return;
    setFavoriteCommands((prev) => {
      const exists = prev.includes(trimmed);
      const next = exists
        ? prev.filter((entry) => entry !== trimmed)
        : [trimmed, ...prev];
      writeLocalList(FAVORITES_STORAGE_KEY, next);
      return next;
    });
  }, []);

  const writeTerminalError = useCallback((message: string) => {
    if (!mountedRef.current) return;
    setError(message);
    const term = terminalRef.current;
    if (!term) return;
    term.writeln("\r\n\x1b[31m[error]\x1b[0m " + message);
  }, []);

  const notifyMissingSession = useCallback((message?: string) => {
    if (missingSessionErrorShownRef.current) return;
    missingSessionErrorShownRef.current = true;
    writeTerminalError(message ?? "No active terminal session. Reconnect and try again.");
    setTerminalStateSafe("error");
  }, [setTerminalStateSafe, writeTerminalError]);

  const markSessionUnavailable = useCallback(() => {
    if (pollTimerRef.current !== null) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    sessionIdRef.current = null;
    cursorRef.current = 0;
    fallbackPromptContextRef.current = { cwd: "/", previousCwd: null };
    fallbackPromptRef.current = buildFallbackPrompt(undefined, undefined, undefined);
    fallbackPromptVisibleRef.current = false;
    fallbackAwaitingPromptRef.current = false;
    fallbackPendingPromptContextRef.current = null;
    fallbackPendingPromptFailedRef.current = false;
    fallbackSawOutputWhileAwaitingRef.current = false;
    fallbackStartupAwaitingPromptRef.current = false;
    fallbackStartupEmptyPollsRef.current = 0;
    if (!mountedRef.current) return;
  }, []);

  const finalizePendingFallbackPromptState = useCallback(() => {
    if (
      shouldApplyPendingFallbackPromptContext({
        isAwaitingPrompt: fallbackAwaitingPromptRef.current,
        hasPendingPromptContext: fallbackPendingPromptContextRef.current !== null,
        pendingPromptFailed: fallbackPendingPromptFailedRef.current,
      })
    ) {
      const nextContext = fallbackPendingPromptContextRef.current;
      if (nextContext) {
        fallbackPromptContextRef.current = {
          ...fallbackPromptContextRef.current,
          cwd: nextContext.cwd,
          previousCwd: nextContext.previousCwd,
        };
        fallbackPromptRef.current = buildFallbackPrompt(
          fallbackPromptContextRef.current.user,
          fallbackPromptContextRef.current.host,
          fallbackPromptContextRef.current.cwd
        );
      }
    }
    fallbackPendingPromptContextRef.current = null;
    fallbackPendingPromptFailedRef.current = false;
    fallbackSawOutputWhileAwaitingRef.current = false;
  }, []);

  const reconcileFallbackCwd = useCallback((cwd?: string): boolean => {
    if (terminalModeRef.current !== "fallback") return false;
    const candidate = normalizeBackendFallbackCwd(cwd);
    if (!candidate) return false;

    const current = fallbackPromptContextRef.current;
    if (current.cwd !== candidate) {
      fallbackPromptContextRef.current = {
        ...current,
        cwd: candidate,
        previousCwd: current.cwd,
      };
    }
    fallbackPromptRef.current = buildFallbackPrompt(
      fallbackPromptContextRef.current.user,
      fallbackPromptContextRef.current.host,
      fallbackPromptContextRef.current.cwd
    );

    return true;
  }, []);

  const showFallbackPrompt = useCallback((promptedByShellBoundary = false) => {
    if (
      !shouldRenderFallbackPrompt({
        isFallbackMode: terminalModeRef.current === "fallback",
        isPromptVisible: fallbackPromptVisibleRef.current,
        promptedByShellBoundary,
      })
    ) {
      return;
    }
    const term = terminalRef.current;
    if (!term) return;
    term.write(fallbackPromptRef.current);
    fallbackPromptVisibleRef.current = true;
    fallbackAwaitingPromptRef.current = false;
  }, []);

  const sendInput = useCallback(async (input: string) => {
    const activeSession = sessionIdRef.current;
    if (!activeSession) {
      notifyMissingSession();
      return false;
    }
    missingSessionErrorShownRef.current = false;
    const result = await fetchJson<TerminalInputResponse>(
      "/api/private/terminal/input",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: activeSession,
          input,
        }),
      }
    );

    if (!result.ok) {
      const message = formatTerminalApiError(result.error);
      if (isTerminalSessionUnavailable(result.error)) {
        markSessionUnavailable();
        notifyMissingSession(message);
        return false;
      }
      writeTerminalError(message);
      setTerminalStateSafe("error");
      return false;
    }
    return true;
  }, [
    markSessionUnavailable,
    notifyMissingSession,
    setTerminalStateSafe,
    writeTerminalError,
  ]);

  const sendResize = useCallback(async () => {
    const term = terminalRef.current;
    const activeSession = sessionIdRef.current;
    if (!term || !activeSession) return;
    if (!canResizeTerminalState(terminalStateRef.current)) return;
    if (resizeInFlightRef.current) {
      resizePendingRef.current = true;
      return;
    }

    resizeInFlightRef.current = true;

    try {
      const result = await fetchJson<TerminalResizeResponse>(
        "/api/private/terminal/resize",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: activeSession,
            cols: term.cols,
            rows: term.rows,
          }),
        }
      );

      if (!result.ok) {
        const message = formatTerminalApiError(result.error);
        if (isTerminalSessionUnavailable(result.error)) {
          markSessionUnavailable();
          notifyMissingSession(message);
          return;
        }
        writeTerminalError(message);
      }
    } finally {
      resizeInFlightRef.current = false;
      if (resizePendingRef.current) {
        resizePendingRef.current = false;
        void sendResize();
      }
    }
  }, [
    markSessionUnavailable,
    notifyMissingSession,
    writeTerminalError,
  ]);

  const closeSession = useCallback(async () => {
    const activeSession = sessionIdRef.current;
    if (pollTimerRef.current !== null) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }

    sessionIdRef.current = null;
    cursorRef.current = 0;
    lineBufferRef.current = "";
    fallbackLineBufferRef.current = "";
    fallbackPromptContextRef.current = { cwd: "/", previousCwd: null };
    fallbackPromptRef.current = buildFallbackPrompt(undefined, undefined, undefined);
    fallbackPromptVisibleRef.current = false;
    fallbackAwaitingPromptRef.current = false;
    fallbackPendingPromptContextRef.current = null;
    fallbackPendingPromptFailedRef.current = false;
    fallbackSawOutputWhileAwaitingRef.current = false;
    fallbackStartupAwaitingPromptRef.current = false;
    fallbackStartupEmptyPollsRef.current = 0;
    resizePendingRef.current = false;
    resizeInFlightRef.current = false;
    missingSessionErrorShownRef.current = false;

    if (!activeSession) return;
    await fetchJson<TerminalCloseResponse>("/api/private/terminal/close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: activeSession }),
    });
    if (!mountedRef.current) return;
  }, []);

  const handleDataForHistory = useCallback((data: string): string[] => {
    const completedCommands: string[] = [];
    for (const ch of data) {
      if (escapeSequenceRef.current) {
        const code = ch.charCodeAt(0);
        if (code >= 0x40 && code <= 0x7e) {
          escapeSequenceRef.current = false;
        }
        continue;
      }
      if (ch === "\u001b") {
        escapeSequenceRef.current = true;
        continue;
      }
      if (ch === "\r" || ch === "\n") {
        const command = lineBufferRef.current.trim();
        if (command.length > 0) {
          addRecentCommand(command);
          completedCommands.push(command);
        }
        lineBufferRef.current = "";
        continue;
      }
      if (ch === "\u007f") {
        lineBufferRef.current = lineBufferRef.current.slice(0, -1);
        continue;
      }
      if (ch < " ") {
        continue;
      }
      lineBufferRef.current += ch;
      if (lineBufferRef.current.length > 400) {
        lineBufferRef.current = lineBufferRef.current.slice(-400);
      }
    }
    return completedCommands;
  }, [addRecentCommand]);

  const startPolling = useCallback((activeSessionId: string) => {
    if (pollTimerRef.current !== null) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }

    let pollInFlight = false;

    const poll = async () => {
      if (pollInFlight) return;
      if (
        !shouldProcessPollResult({
          mounted: mountedRef.current,
          currentSessionId: sessionIdRef.current,
          polledSessionId: activeSessionId,
        })
      ) {
        return;
      }
      pollInFlight = true;
      try {
        const params = new URLSearchParams({
          sessionId: activeSessionId,
          cursor: String(cursorRef.current),
        });

        const result = await fetchJson<TerminalOutputResponse>(
          `/api/private/terminal/output?${params.toString()}`
        );

        if (
          !shouldProcessPollResult({
            mounted: mountedRef.current,
            currentSessionId: sessionIdRef.current,
            polledSessionId: activeSessionId,
          })
        ) {
          return;
        }

        if (!result.ok) {
          const message = formatTerminalApiError(result.error);
          if (isTerminalSessionUnavailable(result.error)) {
            markSessionUnavailable();
            notifyMissingSession(message);
            return;
          }
          writeTerminalError(message);
          setTerminalStateSafe("error");
          return;
        }

        setError(null);
        const backendFallbackCwd = normalizeBackendFallbackCwd(result.data.cwd);
        reconcileFallbackCwd(backendFallbackCwd ?? undefined);
        if (terminalModeRef.current === "fallback") {
          if (result.data.chunks.length > 0) {
            fallbackStartupAwaitingPromptRef.current = false;
            fallbackStartupEmptyPollsRef.current = 0;
          } else if (fallbackStartupAwaitingPromptRef.current) {
            fallbackStartupEmptyPollsRef.current += 1;
          }
        }
        const term = terminalRef.current;
        if (term) {
          if (
            result.data.chunks.length === 0 &&
            shouldRenderFallbackPromptOnIdle({
              isFallbackMode: terminalModeRef.current === "fallback",
              isPromptVisible: fallbackPromptVisibleRef.current,
              isAwaitingPrompt: fallbackAwaitingPromptRef.current,
              sawOutputWhileAwaiting: fallbackSawOutputWhileAwaitingRef.current,
              hasPendingPromptContext:
                fallbackPendingPromptContextRef.current !== null,
              isAwaitingStartupPrompt: fallbackStartupAwaitingPromptRef.current,
              startupEmptyPolls: fallbackStartupEmptyPollsRef.current,
            })
          ) {
            if (
              !shouldProcessPollResult({
                mounted: mountedRef.current,
                currentSessionId: sessionIdRef.current,
                polledSessionId: activeSessionId,
              })
            ) {
              return;
            }
            finalizePendingFallbackPromptState();
            fallbackStartupAwaitingPromptRef.current = false;
            showFallbackPrompt();
          }

          for (const chunk of result.data.chunks) {
            if (
              !shouldProcessPollResult({
                mounted: mountedRef.current,
                currentSessionId: sessionIdRef.current,
                polledSessionId: activeSessionId,
              })
            ) {
              return;
            }
            if (terminalModeRef.current === "fallback") {
              if (fallbackAwaitingPromptRef.current && chunk.data.length > 0) {
                fallbackSawOutputWhileAwaitingRef.current = true;
              }
              const stripped = stripTrailingShellPrompt(chunk.data, [
                FALLBACK_PROMPT_PATTERN,
                FALLBACK_PROMPT_ANSI_PATTERN,
                FALLBACK_PROMPT_CONTROL_PATTERN,
              ]);
              if (stripped.content.length > 0) {
                term.write(stripped.content);
                if (
                  fallbackAwaitingPromptRef.current &&
                  fallbackPendingPromptContextRef.current &&
                  didFallbackCdCommandFail(stripped.content)
                ) {
                  fallbackPendingPromptFailedRef.current = true;
                }
              }
              if (stripped.hadPrompt) {
                fallbackPromptVisibleRef.current = false;
                const awaitingPromptBeforeRender = fallbackAwaitingPromptRef.current;
                finalizePendingFallbackPromptState();
                if (
                  stripped.prompt &&
                  shouldApplyShellDerivedFallbackPrompt(
                    backendFallbackCwd,
                    stripped.prompt,
                    awaitingPromptBeforeRender
                  )
                ) {
                  fallbackPromptRef.current = stripped.prompt;
                }
                if (
                  shouldRenderFallbackPromptOnShellBoundary({
                    isFallbackMode: terminalModeRef.current === "fallback",
                    isPromptVisible: fallbackPromptVisibleRef.current,
                    isAwaitingPrompt: fallbackAwaitingPromptRef.current,
                    hasOutputContent: stripped.content.length > 0,
                  })
                ) {
                  showFallbackPrompt(true);
                }
                fallbackStartupAwaitingPromptRef.current = false;
                fallbackStartupEmptyPollsRef.current = 0;
              }
              continue;
            }
            term.write(chunk.data);
          }
        }
        cursorRef.current = result.data.cursor;

        if (
          result.data.closed &&
          shouldRenderFallbackPromptOnClose({
            isFallbackMode: terminalModeRef.current === "fallback",
            isPromptVisible: fallbackPromptVisibleRef.current,
          })
        ) {
          finalizePendingFallbackPromptState();
          showFallbackPrompt();
        }

        if (result.data.closed) {
          setTerminalStateSafe("closed");
          if (result.data.closeReason) {
            const note = `\r\n\x1b[33m[session closed]\x1b[0m ${result.data.closeReason}`;
            term?.writeln(note);
          }
          if (pollTimerRef.current !== null) {
            window.clearInterval(pollTimerRef.current);
            pollTimerRef.current = null;
          }
        } else {
          setTerminalStateSafe("ready");
        }
      } finally {
        pollInFlight = false;
      }
    };

    void poll();
    pollTimerRef.current = window.setInterval(() => {
      void poll();
    }, OUTPUT_POLL_MS);
  }, [
    finalizePendingFallbackPromptState,
    markSessionUnavailable,
    notifyMissingSession,
    reconcileFallbackCwd,
    setTerminalStateSafe,
    showFallbackPrompt,
    writeTerminalError,
  ]);

  const createSession = useCallback(async () => {
    if (!canStartLifecycleAction(creatingSessionRef.current)) {
      return;
    }
    const term = terminalRef.current;
    const fitAddon = fitAddonRef.current;
    if (!term || !fitAddon) return;
    creatingSessionRef.current = true;

    try {
      setTerminalStateSafe("connecting");
      setError(null);
      term.clear();
      fitAddon.fit();

      const result = await fetchJson<TerminalSessionCreateResponse>(
        "/api/private/terminal/session",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cols: term.cols,
            rows: term.rows,
          }),
        }
      );

      if (!result.ok) {
        const message = formatTerminalApiError(result.error);
        if (isTerminalSessionUnavailable(result.error)) {
          markSessionUnavailable();
          notifyMissingSession(message);
          return;
        }
        setTerminalStateSafe("error");
        writeTerminalError(message);
        return;
      }

      if (!mountedRef.current) {
        return;
      }

      cursorRef.current = 0;
      lineBufferRef.current = "";
      fallbackLineBufferRef.current = "";
      fallbackPromptVisibleRef.current = false;
      fallbackAwaitingPromptRef.current = false;
      fallbackPendingPromptContextRef.current = null;
      fallbackPendingPromptFailedRef.current = false;
      fallbackSawOutputWhileAwaitingRef.current = false;
      fallbackShouldClientEchoRef.current = result.data.fallbackClientEcho ?? true;
      fallbackStartupAwaitingPromptRef.current = result.data.mode === "fallback";
      fallbackStartupEmptyPollsRef.current = 0;
      missingSessionErrorShownRef.current = false;
      sessionIdRef.current = result.data.sessionId;
      terminalModeRef.current = result.data.mode;
      fallbackPromptContextRef.current = {
        user: result.data.user,
        host: result.data.host,
        cwd: result.data.cwd || "/",
        previousCwd: null,
      };
      fallbackPromptRef.current = buildFallbackPrompt(
        fallbackPromptContextRef.current.user,
        fallbackPromptContextRef.current.host,
        fallbackPromptContextRef.current.cwd
      );
      setTerminalStateSafe("ready");
      startPolling(result.data.sessionId);
    } finally {
      creatingSessionRef.current = false;
    }
  }, [markSessionUnavailable, notifyMissingSession, setTerminalStateSafe, startPolling, writeTerminalError]);

  const runCommand = useCallback(async (command: string) => {
    const prepared = prepareRunCommand(command);
    if (!prepared.executable) return;
    if (!sessionIdRef.current) {
      notifyMissingSession();
      return;
    }
    setTerminalStateSafe("running");

    const sent = await sendInput(`${prepared.executable}\n`);
    if (!sent) {
      return;
    }
    addRecentCommand(prepared.display);
    if (sessionIdRef.current) {
      setTerminalStateSafe("ready");
    }
  }, [addRecentCommand, notifyMissingSession, sendInput, setTerminalStateSafe]);

  const localEchoFallbackInput = useCallback((input: string) => {
    if (!fallbackShouldClientEchoRef.current) {
      return;
    }
    const term = terminalRef.current;
    if (!term) return;

    for (const ch of input) {
      if (ch === "\n") {
        term.write("\r\n");
        continue;
      }
      if (ch === "\u007f") {
        term.write("\b \b");
        continue;
      }
      if (ch < " " || ch === "\u001b") {
        continue;
      }
      term.write(ch);
    }
  }, []);

  const processFallbackInput = useCallback(async (input: string) => {
    if (
      terminalStateRef.current === "closed" ||
      terminalStateRef.current === "error"
    ) {
      return;
    }

    for (const ch of input) {
      if (ch === "\n") {
        const buffered = fallbackLineBufferRef.current;
        const trimmed = buffered.trim();
        if (trimmed) {
          addRecentCommand(trimmed);
        }
        localEchoFallbackInput("\n");
        fallbackLineBufferRef.current = "";
        const inferredContext = resolveFallbackCdPromptContext(
          {
            cwd: fallbackPromptContextRef.current.cwd,
            previousCwd: fallbackPromptContextRef.current.previousCwd,
          },
          buffered
        );
        fallbackPendingPromptContextRef.current = inferredContext
          ? {
              ...fallbackPromptContextRef.current,
              cwd: inferredContext.cwd,
              previousCwd: inferredContext.previousCwd,
            }
          : null;
        fallbackPendingPromptFailedRef.current = false;
        fallbackSawOutputWhileAwaitingRef.current = false;
        fallbackPromptVisibleRef.current = false;
        fallbackAwaitingPromptRef.current = true;
        const sent = await sendInput(`${buffered}\n`);
        if (!sent) return;
        continue;
      }

      if (ch === "\u007f") {
        if (fallbackLineBufferRef.current.length > 0) {
          fallbackLineBufferRef.current = fallbackLineBufferRef.current.slice(0, -1);
          localEchoFallbackInput("\u007f");
        }
        continue;
      }

      if (ch < " " || ch === "\u001b") {
        continue;
      }

      fallbackLineBufferRef.current += ch;
      localEchoFallbackInput(ch);
    }
  }, [addRecentCommand, localEchoFallbackInput, sendInput]);

  useEffect(() => {
    const container = terminalContainerRef.current;
    if (!container) return;

    const term = new Terminal({
      convertEol: true,
      cursorBlink: true,
      fontFamily: "Hack, 'Hack Nerd Font', 'Hack NF', var(--font-mono), monospace",
      fontSize: 13,
      lineHeight: 1.2,
      theme: {
        background: "#050302",
        foreground: "#f8ede5",
        cursor: "#f59e0b",
        black: "#050302",
        brightBlack: "#514638",
        red: "#fb7185",
        green: "#86efac",
        yellow: "#fb923c",
        brightYellow: "#fb923c",
        blue: "#f59e0b",
        brightBlue: "#f59e0b",
        magenta: "#f0abfc",
        cyan: "#67e8f9",
        white: "#f8ede5",
        brightWhite: "#fff7ed",
      },
      scrollback: 8000,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(container);
    fitAddon.fit();
    term.focus();

    terminalRef.current = term;
    fitAddonRef.current = fitAddon;
    mountedRef.current = true;

    const dataDisposable = term.onData((data) => {
      const normalizedInput = normalizeTerminalInput(data);

      if (terminalModeRef.current === "fallback") {
        void processFallbackInput(normalizedInput);
        return;
      }

      handleDataForHistory(normalizedInput);
      void sendInput(normalizedInput);
    });

    const requestResize = () => {
      fitAddonRef.current?.fit();
      void sendResize();
    };

    const resizeHandler = () => {
      requestResize();
    };

    const resizeObserver = new ResizeObserver(() => {
      requestResize();
    });
    resizeObserver.observe(container);

    window.addEventListener("resize", resizeHandler);

    // Ensure session is closed even during page unload using sendBeacon (guaranteed delivery)
    const handleBeforeUnload = () => {
      const activeSession = sessionIdRef.current;
      if (activeSession) {
        navigator.sendBeacon(
          "/api/private/terminal/close",
          new Blob([JSON.stringify({ sessionId: activeSession })], {
            type: "application/json",
          })
        );
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    const createSessionTimer = window.setTimeout(() => {
      void createSession();
    }, 0);

    return () => {
      mountedRef.current = false;
      window.clearTimeout(createSessionTimer);
      dataDisposable.dispose();
      resizeObserver.disconnect();
      window.removeEventListener("resize", resizeHandler);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      if (pollTimerRef.current !== null) {
        window.clearInterval(pollTimerRef.current);
      }
      void closeSession();
      term.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      terminalModeRef.current = "pty";
      fallbackShouldClientEchoRef.current = true;
      fallbackLineBufferRef.current = "";
      fallbackPromptContextRef.current = { cwd: "/", previousCwd: null };
      fallbackPromptRef.current = buildFallbackPrompt(undefined, undefined, undefined);
      fallbackPromptVisibleRef.current = false;
      fallbackAwaitingPromptRef.current = false;
      fallbackPendingPromptContextRef.current = null;
      fallbackPendingPromptFailedRef.current = false;
      fallbackSawOutputWhileAwaitingRef.current = false;
      fallbackStartupAwaitingPromptRef.current = false;
      fallbackStartupEmptyPollsRef.current = 0;
      pollTimerRef.current = null;
    };
  }, [
    closeSession,
    createSession,
    handleDataForHistory,
    processFallbackInput,
    sendInput,
    sendResize,
  ]);

  const favoritesSet = useMemo(() => new Set(favoriteCommands), [favoriteCommands]);
  const favoriteListMaxHeightClass =
    favoriteCommands.length >= 4 ? "max-h-[300px]" : "max-h-96";

  return (
    <section className="flex flex-col gap-6 lg:flex-1 lg:min-h-0 lg:overflow-hidden">
      <div className="rounded-[28px] border border-orange-500/30 bg-[linear-gradient(155deg,rgba(18,12,8,0.92),rgba(8,5,4,0.9))] p-6 shadow-[0_0_35px_rgba(251,146,60,0.08)]">
        <h2 className="font-[var(--font-display)] text-2xl text-amber-100">
          Operator Terminal
        </h2>
        <p className="mt-2 text-xs text-amber-100/70">
          Interactive shell session with reusable command history and favorites.
        </p>
      </div>

      <div className="grid gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-stretch">
        <div className="flex min-h-[380px] flex-col rounded-[24px] border border-orange-500/25 bg-[linear-gradient(180deg,rgba(18,12,8,0.78),rgba(10,6,4,0.74))] p-5 lg:h-full lg:min-h-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.3em] text-amber-200/70">
                Terminal Session
              </div>
              <div className="mt-2 flex items-center gap-2 text-sm text-amber-100/80">
                <IconTerminal className="h-4 w-4" />
                <span>Status: {getStatusLabel(terminalState)}</span>
              </div>
            </div>
          </div>

          {error ? (
            <div className="mt-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
              {error}
            </div>
          ) : null}

          <div className="mt-4 min-h-[300px] flex-1 overflow-hidden rounded-2xl border border-orange-500/30 bg-black/70 lg:min-h-0 flex flex-col">
            <div
              ref={terminalContainerRef}
              className="themed-scrollbar flex-1 w-full overflow-hidden rounded-xl px-2"
            />
          </div>

        </div>

        <aside className="space-y-4 lg:h-full lg:overflow-hidden">
          <div className="rounded-[24px] border border-orange-500/20 bg-[#120c08]/70 p-4">
            <div className="text-xs uppercase tracking-[0.3em] text-amber-200/70">
              Favorite Commands
            </div>
            <div
              className={`themed-scrollbar mt-3 ${favoriteListMaxHeightClass} min-h-[160px] space-y-2 overflow-y-auto pr-1`}
            >
              {favoriteCommands.length === 0 ? (
                <div className="text-sm text-amber-100/60">
                  Star a command from Recent to pin it here.
                </div>
              ) : (
                favoriteCommands.map((command) => (
                  <div
                    key={`favorite-${command}`}
                    className="rounded-2xl border border-orange-500/20 bg-black/40 p-3"
                  >
                    <div className="font-mono text-xs text-amber-100/90 break-words">
                      {command}
                    </div>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        className="rounded-full border border-orange-400/40 px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-orange-100 transition hover:border-orange-300 hover:bg-orange-400/20"
                        onClick={() => void runCommand(command)}
                      >
                        Run
                      </button>
                      <button
                        type="button"
                        className="rounded-full border border-orange-400/40 px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-orange-100 transition hover:border-orange-300 hover:bg-orange-400/20"
                        onClick={() => toggleFavoriteCommand(command)}
                      >
                        Unstar
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-[24px] border border-orange-500/20 bg-[#120c08]/70 p-4">
            <div className="text-xs uppercase tracking-[0.3em] text-amber-200/70">
              Recent Commands
            </div>
            <div className="themed-scrollbar mt-3 max-h-96 min-h-[160px] space-y-2 overflow-y-auto pr-1">
              {recentCommands.length === 0 ? (
                <div className="text-sm text-amber-100/60">No commands yet.</div>
              ) : (
                recentCommands.map((command) => (
                  <div
                    key={`recent-${command}`}
                    className="rounded-2xl border border-orange-500/20 bg-black/40 p-3"
                  >
                    <div className="font-mono text-xs text-amber-100/90 break-words">
                      {command}
                    </div>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        className="rounded-full border border-orange-400/40 px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-orange-100 transition hover:border-orange-300 hover:bg-orange-400/20"
                        onClick={() => void runCommand(command)}
                      >
                        Run
                      </button>
                      <button
                        type="button"
                        className="rounded-full border border-orange-400/40 px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-orange-100 transition hover:border-orange-300 hover:bg-orange-400/20"
                        onClick={() => toggleFavoriteCommand(command)}
                      >
                        {favoritesSet.has(command) ? "Unstar" : "Star"}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
