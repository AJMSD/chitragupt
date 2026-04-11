export type PollContext = {
  mounted: boolean;
  currentSessionId: string | null;
  polledSessionId: string;
};

export function canStartLifecycleAction(inFlight: boolean): boolean {
  return !inFlight;
}

export function shouldProcessPollResult(context: PollContext): boolean {
  return context.mounted && context.currentSessionId === context.polledSessionId;
}

const FALLBACK_CD_FAILURE_PATTERN =
  /no such file or directory|not a directory|permission denied/i;

export function didFallbackCdCommandFail(outputChunk: string): boolean {
  return FALLBACK_CD_FAILURE_PATTERN.test(outputChunk);
}