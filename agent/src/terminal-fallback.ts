export type TerminalFallbackAttempt = {
  shell: string;
  args: string[];
};

export function normalizeFallbackOutputChunk(chunk: string): string {
  // Pipe-mode shells usually emit LF-only output; convert to CRLF for terminal rendering.
  return chunk.replace(/\r?\n/g, "\r\n");
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
