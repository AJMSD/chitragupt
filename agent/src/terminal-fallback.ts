import path from "node:path";

export type TerminalFallbackAttempt = {
  shell: string;
  args: string[];
};

export type TerminalFallbackTransport = "script" | "pipe";

const FALLBACK_PROMPT_BOUNDARY_PATTERN =
  /(?:^|\r?\n)(?:\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\))*[^\r\n]*[#$%>]\s*(?:\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\))*$/;
const ANSI_CONTROL_SEQUENCE_PATTERN =
  /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;

export function normalizeFallbackOutputChunk(chunk: string): string {
  // Pipe-mode shells usually emit LF-only output; convert to CRLF for terminal rendering.
  return chunk.replace(/\r?\n/g, "\r\n");
}

export function normalizeFallbackCwdCandidate(value: string): string | null {
  const trimmed = value.replace(ANSI_CONTROL_SEQUENCE_PATTERN, "").trim();
  if (!trimmed.startsWith("/")) return null;
  const normalized = path.posix.normalize(trimmed);
  if (!normalized.startsWith("/")) return null;
  return normalized;
}

export function inferFallbackCwdFromChunk(chunk: string): string | null {
  const normalized = chunk.replace(/\r\n/g, "\n");
  const match = normalized.match(FALLBACK_PROMPT_BOUNDARY_PATTERN);
  if (!match || match.index === undefined) return null;

  const outputBeforePrompt = normalized.slice(0, match.index);
  const lines = outputBeforePrompt.split("\n");
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const candidate = normalizeFallbackCwdCandidate(lines[index] ?? "");
    if (candidate) {
      return candidate;
    }
  }

  return null;
}

function shellBaseName(shell: string): string {
  const normalized = shell.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  return (parts[parts.length - 1] ?? shell).toLowerCase();
}

export function resolveFallbackShellArgs(shell: string): string[][] {
  const base = shellBaseName(shell);
  if (base === "zsh") {
    return [[], ["-i"]];
  }
  if (base === "bash" || base === "sh" || base === "fish") {
    return [["-i"], []];
  }
  return [[]];
}

export function buildTerminalFallbackAttempts(
  shells: string[]
): TerminalFallbackAttempt[] {
  const attempts: TerminalFallbackAttempt[] = [];
  const prioritized = [...shells];

  for (const shell of prioritized) {
    const argsList = resolveFallbackShellArgs(shell);
    for (const args of argsList) {
      attempts.push({ shell, args });
    }
  }
  return attempts;
}

export function shouldUseFallbackClientEcho(
  transport: TerminalFallbackTransport
): boolean {
  // Script-backed fallback has pseudo-TTY echo; pipe fallback needs client echo.
  return transport === "pipe";
}
