export type SessionLike = {
  closedAt: number | null;
};

export function countActiveSessions(sessions: Iterable<SessionLike>): number {
  let count = 0;
  for (const session of sessions) {
    if (session.closedAt === null) {
      count += 1;
    }
  }
  return count;
}

export function hasReachedSessionLimit(
  sessions: Iterable<SessionLike>,
  maxSessions: number
): boolean {
  return countActiveSessions(sessions) >= maxSessions;
}