# Web Terminal (Private Dashboard)

This document describes the terminal feature available at `/app/terminal` and the private API/agent behavior behind it.

## Scope

- Interactive shell access from the private dashboard
- Session-based terminal lifecycle (create, input, resize, output, close)
- Quick command reuse through Recent and Favorites side panels

## Architecture

The implementation is split into three layers:

1. UI page: `app/app/terminal/page.tsx`
2. Next.js private API proxy: `app/api/private/terminal/*`
3. Local agent terminal runtime: `agent/src/server.ts`

### Request path

1. Authenticated user opens `/app/terminal`.
2. UI creates a session via `POST /api/private/terminal/session`.
3. UI sends keystrokes and commands to `POST /api/private/terminal/input`.
4. UI polls output through `GET /api/private/terminal/output`.
5. UI updates size through `POST /api/private/terminal/resize`.
6. UI closes session via `POST /api/private/terminal/close`.

All private terminal routes require a valid app session and are proxied to private agent routes with existing private-agent headers.

## Endpoints

### Next.js private routes

- `POST /api/private/terminal/session`
  - Body: `{ cols, rows }`
  - Result: session id and initial metadata
- `POST /api/private/terminal/input`
  - Body: `{ sessionId, input }`
- `POST /api/private/terminal/resize`
  - Body: `{ sessionId, cols, rows }`
- `GET /api/private/terminal/output?sessionId=<id>&cursor=<n>`
  - Returns incremental output chunks and session close status
- `POST /api/private/terminal/close`
  - Body: `{ sessionId }`

### Agent private routes

- `POST /terminal/session`
- `POST /terminal/input`
- `POST /terminal/resize`
- `GET /terminal/output`
- `POST /terminal/close`

These run inside the local agent process and are not exposed as public endpoints.

## Session Behavior

- Session state is held in-memory in the agent.
- Output is stored in an indexed chunk buffer for cursor-based polling.
- Closed sessions remain briefly available before cleanup for safe final polling.
- Each interaction refreshes session activity to prevent idle expiry during active use.

## Limits and Guardrails

Values below are current defaults from `agent/src/server.ts` (override via env vars):

- Idle timeout: `TERMINAL_SESSION_IDLE_TIMEOUT_MS` (default: 900000 ms)
- Closed-session retention: `TERMINAL_CLOSED_TTL_MS` (default: 30000 ms)
- Output chunk cap: `TERMINAL_MAX_CHUNKS` (default: 1500)
- Input cap per request: `TERMINAL_MAX_INPUT_BYTES` (default: 16384)
- Max concurrent sessions: `TERMINAL_MAX_SESSIONS` (default: 3)
- Terminal size bounds:
  - cols: 40 to 240
  - rows: 12 to 80

## PTY Fallback Behavior

Primary mode uses `node-pty`. If PTY spawn fails in the host environment, agent session creation falls back to a non-PTY shell process so command execution still works.

Effect of fallback mode:

- Basic command execution remains available.
- Full interactive terminal semantics may be reduced.
- Behavior can vary by host shell and process capabilities.

## Constraints for Long-Running Interactive Programs

- The UI uses polling (`350 ms`) for output updates, not a websocket stream.
- Very noisy or long-running commands can rotate older output once the chunk cap is reached.
- Interactive TUI programs may not behave exactly like a native terminal in browser polling mode.
- Idle sessions are closed automatically when timeout is reached.

## Persistence Scope

- Recent commands are stored in browser `localStorage` under `terminal.recent`.
- Favorite commands are stored in browser `localStorage` under `terminal.favorites`.
- Command history/favorites are not persisted on the server.
- Session state and output are in-memory only in the agent process.

## Operational Notes

- This feature is private-dashboard only.
- Existing auth and private-agent token model is reused; no separate terminal auth path was added.
- If agent restarts, active terminal sessions are lost (expected for in-memory session model).
