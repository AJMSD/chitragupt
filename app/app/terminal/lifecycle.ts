export type PollContext = {
  mounted: boolean;
  currentSessionId: string | null;
  polledSessionId: string;
};

export type FallbackPromptRenderContext = {
  isFallbackMode: boolean;
  isPromptVisible: boolean;
  promptedByShellBoundary: boolean;
};

export type FallbackIdlePromptContext = {
  isFallbackMode: boolean;
  isPromptVisible: boolean;
  isAwaitingPrompt: boolean;
  sawOutputWhileAwaiting: boolean;
  hasPendingPromptContext: boolean;
  isAwaitingStartupPrompt?: boolean;
  startupEmptyPolls?: number;
};

export type FallbackClosePromptContext = {
  isFallbackMode: boolean;
  isPromptVisible: boolean;
};

export type FallbackShellBoundaryPromptContext = {
  isFallbackMode: boolean;
  isPromptVisible: boolean;
  isAwaitingPrompt: boolean;
  hasOutputContent: boolean;
};

export type FallbackPendingPromptContext = {
  isAwaitingPrompt: boolean;
  hasPendingPromptContext: boolean;
  pendingPromptFailed: boolean;
};

export type FallbackCwdContext = {
  cwd: string;
  previousCwd: string | null;
};

type TerminalState = "connecting" | "ready" | "running" | "closed" | "error";

const FALLBACK_STARTUP_PROMPT_GRACE_POLLS = 2;
const ANSI_CONTROL_SEQUENCE_PATTERN =
  /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;
const SENSITIVE_INPUT_PROMPT_LINE_PATTERN =
  /(?:^|\s)(?:\[sudo\]\s*)?(?:password|passphrase|enter\s+password|enter\s+passphrase|verification\s+code|otp)\b[^\r\n]*:\s*$/i;
const SHELL_PROMPT_BOUNDARY_LINE_PATTERN = /[#$%>]\s*$/;

function normalizeOutputLineForPromptMatching(line: string): string {
  return line.replace(ANSI_CONTROL_SEQUENCE_PATTERN, "").trimEnd();
}

function splitOutputLines(outputChunk: string): string[] {
  if (!outputChunk) return [];
  return outputChunk.replace(/\r\n/g, "\n").split("\n");
}

function isLikelyShellPromptLine(line: string): boolean {
  if (!line) return false;
  if (!SHELL_PROMPT_BOUNDARY_LINE_PATTERN.test(line)) return false;
  if (SENSITIVE_INPUT_PROMPT_LINE_PATTERN.test(line)) return false;
  return true;
}

export function containsSensitiveInputPrompt(outputChunk: string): boolean {
  for (const rawLine of splitOutputLines(outputChunk)) {
    const line = normalizeOutputLineForPromptMatching(rawLine);
    if (!line) continue;
    if (SENSITIVE_INPUT_PROMPT_LINE_PATTERN.test(line)) {
      return true;
    }
  }
  return false;
}

export function deriveSensitiveInputExpectedFromOutput(
  current: boolean,
  outputChunk: string
): boolean {
  let next = current;
  for (const rawLine of splitOutputLines(outputChunk)) {
    const line = normalizeOutputLineForPromptMatching(rawLine);
    if (!line) continue;

    if (SENSITIVE_INPUT_PROMPT_LINE_PATTERN.test(line)) {
      next = true;
      continue;
    }

    if (isLikelyShellPromptLine(line)) {
      next = false;
    }
  }
  return next;
}

export function canStartLifecycleAction(inFlight: boolean): boolean {
  return !inFlight;
}

export function canResizeTerminalState(state: TerminalState): boolean {
  return state === "ready" || state === "running";
}

export function getReconnectCooldownRemainingMs(
  now: number,
  cooldownUntil: number
): number {
  return Math.max(0, cooldownUntil - now);
}

export function shouldProcessPollResult(context: PollContext): boolean {
  return context.mounted && context.currentSessionId === context.polledSessionId;
}

export function shouldRenderFallbackPrompt(
  context: FallbackPromptRenderContext
): boolean {
  if (!context.isFallbackMode) return false;
  if (context.promptedByShellBoundary) return true;
  return !context.isPromptVisible;
}

export function shouldRenderFallbackPromptOnIdle(
  context: FallbackIdlePromptContext
): boolean {
  const startupAwaitingPrompt = context.isAwaitingStartupPrompt ?? false;
  const startupEmptyPolls = context.startupEmptyPolls ?? 0;

  if (!context.isFallbackMode) return false;
  if (context.isPromptVisible) return false;
  if (
    startupAwaitingPrompt &&
    startupEmptyPolls < FALLBACK_STARTUP_PROMPT_GRACE_POLLS
  ) {
    return false;
  }
  if (!context.isAwaitingPrompt) return true;
  if (context.hasPendingPromptContext) return true;
  return context.sawOutputWhileAwaiting;
}

export function shouldRenderFallbackPromptOnClose(
  context: FallbackClosePromptContext
): boolean {
  if (!context.isFallbackMode) return false;
  return !context.isPromptVisible;
}

export function shouldRenderFallbackPromptOnShellBoundary(
  context: FallbackShellBoundaryPromptContext
): boolean {
  if (!context.isFallbackMode) return false;
  if (!context.isPromptVisible) return true;
  if (context.isAwaitingPrompt) return true;
  return context.hasOutputContent;
}

export function normalizeBackendFallbackCwd(
  cwd?: string
): string | null {
  const candidate = cwd?.trim();
  if (!candidate) return null;
  if (!candidate.startsWith("/")) return null;
  return candidate;
}

export function shouldApplyShellDerivedFallbackPrompt(
  backendFallbackCwd: string | null,
  shellPrompt: string | null,
  isAwaitingPrompt = false
): boolean {
  if (!shellPrompt) return false;
  if (isAwaitingPrompt) return true;
  return backendFallbackCwd === null;
}

export function shouldApplyPendingFallbackPromptContext(
  context: FallbackPendingPromptContext
): boolean {
  if (!context.isAwaitingPrompt) return false;
  if (!context.hasPendingPromptContext) return false;
  return !context.pendingPromptFailed;
}

function normalizePosixPath(value: string): string {
  const segments = value.split("/").filter(Boolean);
  const stack: string[] = [];
  for (const segment of segments) {
    if (segment === ".") continue;
    if (segment === "..") {
      stack.pop();
      continue;
    }
    stack.push(segment);
  }
  return `/${stack.join("/")}`;
}

function unquote(value: string): string {
  if (value.length < 2) return value;
  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

export function resolveFallbackCdPromptContext(
  context: FallbackCwdContext,
  command: string
): FallbackCwdContext | null {
  const trimmed = command.trim();
  if (!trimmed) return null;

  // Keep parser conservative: only handle standalone cd commands.
  if (/&&|\|\||;|\||\n/.test(trimmed)) {
    return null;
  }

  const match = trimmed.match(/^cd(?:\s+(.*))?$/);
  if (!match) return null;

  const current = context.cwd || "/";
  const argRaw = (match[1] ?? "~").trim();
  const arg = unquote(argRaw);

  if (!arg || arg === "~" || arg.startsWith("~")) {
    return null;
  }

  if (arg === "-") {
    if (!context.previousCwd) return null;
    return {
      cwd: context.previousCwd,
      previousCwd: current,
    };
  }

  const nextPath = arg.startsWith("/")
    ? normalizePosixPath(arg)
    : normalizePosixPath(`${current}/${arg}`);

  return {
    cwd: nextPath,
    previousCwd: current,
  };
}

const FALLBACK_CD_FAILURE_PATTERN =
  /no such file or directory|not a directory|permission denied/i;

export function didFallbackCdCommandFail(outputChunk: string): boolean {
  return FALLBACK_CD_FAILURE_PATTERN.test(outputChunk);
}