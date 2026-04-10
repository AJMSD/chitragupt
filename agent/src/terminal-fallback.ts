export type TerminalFallbackAttempt = {
  shell: string;
  args: string[];
};

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

function fallbackPriority(shell: string): number {
  const base = shellBaseName(shell);
  if (base === "bash" || base === "sh") return 0;
  if (base === "fish") return 1;
  if (base === "zsh") return 2;
  return 3;
}

export function buildTerminalFallbackAttempts(
  shells: string[]
): TerminalFallbackAttempt[] {
  const attempts: TerminalFallbackAttempt[] = [];
  const prioritized = [...shells]
    .map((shell, index) => ({ shell, index }))
    .sort((a, b) => {
      const scoreDiff = fallbackPriority(a.shell) - fallbackPriority(b.shell);
      if (scoreDiff !== 0) return scoreDiff;
      return a.index - b.index;
    })
    .map(({ shell }) => shell);

  for (const shell of prioritized) {
    const argsList = resolveFallbackShellArgs(shell);
    for (const args of argsList) {
      attempts.push({ shell, args });
    }
  }
  return attempts;
}
