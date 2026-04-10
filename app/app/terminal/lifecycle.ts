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