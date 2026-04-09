"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { IconRefresh, IconTerminal } from "@/app/components/icons";
import { fetchJson, formatApiError } from "@/lib/client";
import type {
  TerminalCloseResponse,
  TerminalInputResponse,
  TerminalOutputResponse,
  TerminalResizeResponse,
  TerminalSessionCreateResponse,
} from "@/lib/types";

const OUTPUT_POLL_MS = 350;
const RECENT_LIMIT = 25;
const RECENT_STORAGE_KEY = "terminal.recent";
const FAVORITES_STORAGE_KEY = "terminal.favorites";

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

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [terminalState, setTerminalState] = useState<TerminalState>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [commandDraft, setCommandDraft] = useState("");
  const [recentCommands, setRecentCommands] = useState<string[]>(() =>
    readLocalList(RECENT_STORAGE_KEY)
  );
  const [favoriteCommands, setFavoriteCommands] = useState<string[]>(() =>
    readLocalList(FAVORITES_STORAGE_KEY)
  );
  const [isSendingCommand, setIsSendingCommand] = useState(false);

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
    setError(message);
    const term = terminalRef.current;
    if (!term) return;
    term.writeln("\r\n\x1b[31m[error]\x1b[0m " + message);
  }, []);

  const sendInput = useCallback(async (input: string) => {
    const activeSession = sessionIdRef.current;
    if (!activeSession) return;
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
      writeTerminalError(formatApiError(result.error));
      setTerminalState("error");
    }
  }, [writeTerminalError]);

  const sendResize = useCallback(async () => {
    const term = terminalRef.current;
    const fitAddon = fitAddonRef.current;
    const activeSession = sessionIdRef.current;
    if (!term || !fitAddon || !activeSession) return;

    fitAddon.fit();
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
      writeTerminalError(formatApiError(result.error));
    }
  }, [writeTerminalError]);

  const closeSession = useCallback(async () => {
    const activeSession = sessionIdRef.current;
    if (!activeSession) return;
    await fetchJson<TerminalCloseResponse>("/api/private/terminal/close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: activeSession }),
    });
    sessionIdRef.current = null;
    setSessionId(null);
  }, []);

  const handleDataForHistory = useCallback((data: string) => {
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
  }, [addRecentCommand]);

  const startPolling = useCallback((activeSessionId: string) => {
    if (pollTimerRef.current !== null) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }

    const poll = async () => {
      const params = new URLSearchParams({
        sessionId: activeSessionId,
        cursor: String(cursorRef.current),
      });

      const result = await fetchJson<TerminalOutputResponse>(
        `/api/private/terminal/output?${params.toString()}`
      );

      if (!result.ok) {
        writeTerminalError(formatApiError(result.error));
        setTerminalState("error");
        return;
      }

      setError(null);
      const term = terminalRef.current;
      if (term) {
        for (const chunk of result.data.chunks) {
          term.write(chunk.data);
        }
      }
      cursorRef.current = result.data.cursor;

      if (result.data.closed) {
        setTerminalState("closed");
        if (result.data.closeReason) {
          const note = `\r\n\x1b[33m[session closed]\x1b[0m ${result.data.closeReason}`;
          term?.writeln(note);
        }
        if (pollTimerRef.current !== null) {
          window.clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
        }
      } else {
        setTerminalState("ready");
      }
    };

    void poll();
    pollTimerRef.current = window.setInterval(() => {
      void poll();
    }, OUTPUT_POLL_MS);
  }, [writeTerminalError]);

  const createSession = useCallback(async () => {
    const term = terminalRef.current;
    const fitAddon = fitAddonRef.current;
    if (!term || !fitAddon) return;

    setTerminalState("connecting");
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
      const message = formatApiError(result.error);
      setTerminalState("error");
      writeTerminalError(message);
      return;
    }

    cursorRef.current = 0;
    lineBufferRef.current = "";
    sessionIdRef.current = result.data.sessionId;
    setSessionId(result.data.sessionId);
    setTerminalState("ready");
    startPolling(result.data.sessionId);
  }, [startPolling, writeTerminalError]);

  const runCommand = useCallback(async (command: string) => {
    const trimmed = command.trim();
    if (!trimmed || !sessionIdRef.current) return;
    setIsSendingCommand(true);
    setTerminalState("running");
    await sendInput(`${trimmed}\n`);
    addRecentCommand(trimmed);
    setCommandDraft("");
    setIsSendingCommand(false);
    if (sessionIdRef.current) {
      setTerminalState("ready");
    }
  }, [addRecentCommand, sendInput]);

  const reconnectSession = useCallback(async () => {
    await closeSession();
    await createSession();
  }, [closeSession, createSession]);

  useEffect(() => {
    const container = terminalContainerRef.current;
    if (!container) return;

    const term = new Terminal({
      convertEol: false,
      cursorBlink: true,
      fontFamily: "var(--font-mono)",
      fontSize: 13,
      theme: {
        background: "#050302",
        foreground: "#f8ede5",
        cursor: "#f59e0b",
        black: "#050302",
        brightBlack: "#514638",
        red: "#fb7185",
        green: "#86efac",
        yellow: "#fcd34d",
        blue: "#93c5fd",
        magenta: "#f0abfc",
        cyan: "#67e8f9",
        white: "#f8ede5",
        brightWhite: "#fff7ed",
      },
      scrollback: 8000,
      rows: 32,
      cols: 120,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(container);
    fitAddon.fit();
    term.focus();

    terminalRef.current = term;
    fitAddonRef.current = fitAddon;

    const dataDisposable = term.onData((data) => {
      handleDataForHistory(data);
      void sendInput(data);
    });

    const resizeHandler = () => {
      void sendResize();
    };
    window.addEventListener("resize", resizeHandler);

    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial terminal session setup
    void createSession();

    return () => {
      dataDisposable.dispose();
      window.removeEventListener("resize", resizeHandler);
      if (pollTimerRef.current !== null) {
        window.clearInterval(pollTimerRef.current);
      }
      void closeSession();
      term.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      pollTimerRef.current = null;
    };
  }, [closeSession, createSession, handleDataForHistory, sendInput, sendResize]);

  const favoritesSet = useMemo(() => new Set(favoriteCommands), [favoriteCommands]);

  return (
    <section className="space-y-6">
      <div className="rounded-[28px] border border-orange-500/20 bg-[#120c08]/80 p-6">
        <h2 className="font-[var(--font-display)] text-2xl text-amber-100">
          Operator Terminal
        </h2>
        <p className="mt-2 text-xs text-amber-100/70">
          Interactive shell session with reusable command history and favorites.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-[24px] border border-orange-500/20 bg-[#120c08]/70 p-5">
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
            <button
              className="flex h-11 w-11 items-center justify-center rounded-full border border-orange-400/40 bg-orange-400/10 text-orange-100 transition hover:border-orange-300 hover:bg-orange-400/20"
              type="button"
              onClick={() => void reconnectSession()}
              aria-label="Reconnect terminal session"
              title="Reconnect terminal session"
            >
              <IconRefresh className="h-5 w-5" />
            </button>
          </div>

          {error ? (
            <div className="mt-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
              {error}
            </div>
          ) : null}

          <div
            ref={terminalContainerRef}
            className="themed-scrollbar mt-4 h-[460px] overflow-hidden rounded-2xl border border-orange-500/20 bg-black/60 p-2"
          />

          <div className="mt-4 rounded-2xl border border-orange-500/20 bg-black/40 p-3">
            <label className="text-xs uppercase tracking-[0.3em] text-amber-200/70">
              Run Command
            </label>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input
                className="flex-1 rounded-2xl border border-orange-500/30 bg-black/50 px-4 py-2 text-sm text-amber-50 outline-none transition placeholder:text-amber-100/40 focus:border-orange-300/70"
                value={commandDraft}
                onChange={(event) => setCommandDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void runCommand(commandDraft);
                  }
                }}
                placeholder="Type command and press Enter"
              />
              <button
                type="button"
                onClick={() => void runCommand(commandDraft)}
                disabled={isSendingCommand || !commandDraft.trim() || !sessionId}
                className="rounded-2xl border border-orange-400/50 bg-orange-400/10 px-4 py-2 text-sm text-orange-100 transition hover:border-orange-300 hover:bg-orange-400/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Run
              </button>
            </div>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-[24px] border border-orange-500/20 bg-[#120c08]/70 p-4">
            <div className="text-xs uppercase tracking-[0.3em] text-amber-200/70">
              Favorite Commands
            </div>
            <div className="mt-3 space-y-2">
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
                        onClick={() => setCommandDraft(command)}
                      >
                        Insert
                      </button>
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
            <div className="themed-scrollbar mt-3 max-h-[460px] space-y-2 overflow-y-auto pr-1">
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
                        onClick={() => setCommandDraft(command)}
                      >
                        Insert
                      </button>
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
