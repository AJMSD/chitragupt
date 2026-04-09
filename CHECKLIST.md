# Web Terminal Feature Checklist

Branch: aj-web-terminal
Scope: Add a web terminal to private dashboard with Recent and Favorites side panel.
Implementation mode: additive only (no rewrites).

## Phase 0 - Safety and Planning (must complete first)

- [x] Create and switch to feature branch.
- [x] Create this local checklist in a gitignored file.
- [ ] Confirm baseline health before edits.

Acceptance Criteria:
- Branch is `aj-web-terminal`.
- Checklist exists locally and is not tracked by git.
- No feature code edited before this checklist is created.

## Phase 1 - Architecture and UI Fit Lock

- [x] Confirm integration points:
  - [x] Private dashboard route placement: `app/app/terminal/page.tsx`
  - [x] Private nav insertion: `app/app/layout.tsx`
  - [x] Private API route(s): `app/api/private/terminal/*`
  - [x] Agent execution boundary: `agent/src/server.ts`
  - [x] Shared contract updates: `lib/types.ts`
- [x] Confirm constraints:
  - [x] Single-user assumption preserved.
  - [x] Existing auth flow preserved (`requireSession` + private agent headers).
  - [x] Existing pages and APIs untouched unless needed for additive integration.
- [x] Confirm aesthetic alignment targets:
  - [x] Match card radius, spacing rhythm, amber/orange palette, scrollbar style.
  - [x] Match controls and hover/focus interactions from existing private pages.

Acceptance Criteria:
- All integration points are explicitly mapped.
- No architecture deviation from existing boundaries.
- UI style target is documented and actionable.

## Phase 2 - Backend Terminal Capability (Agent)

- [ ] Add PTY-backed session manager in agent:
  - [ ] Create terminal session.
  - [ ] Write input to session.
  - [ ] Resize terminal session.
  - [ ] Read output stream/poll snapshot.
  - [ ] Close session and cleanup.
- [ ] Add guardrails:
  - [ ] Inactivity timeout cleanup.
  - [ ] Output ring buffer cap.
  - [ ] Input size cap.
  - [ ] Session existence validation on each action.
- [ ] Add private terminal endpoints in agent server.
- [ ] Ensure endpoints follow existing private-access checks.

Acceptance Criteria:
- Authenticated path can execute commands interactively via PTY session.
- Session cleanup occurs on close and timeout.
- Invalid/expired session requests return safe error responses.

## Phase 3 - Private API Gateway (Next.js)

- [ ] Add private terminal route(s) under `app/api/private/terminal`:
  - [ ] Session create endpoint.
  - [ ] Input/write endpoint.
  - [ ] Resize endpoint.
  - [ ] Poll/read endpoint.
  - [ ] Close endpoint.
- [ ] Reuse existing auth and proxy helpers (`requireSession`, `agentFetchJson`).
- [ ] Add response/type contracts in `lib/types.ts`.

Acceptance Criteria:
- All terminal API operations are session-gated.
- API responses match typed contracts.
- Error handling mirrors existing private API behavior.

## Phase 4 - Dashboard Terminal UI

- [ ] Add terminal page at `app/app/terminal/page.tsx`:
  - [ ] Terminal output area.
  - [ ] Command input and execute behavior.
  - [ ] Basic status indicators (connecting/running/error).
- [ ] Add side panel with:
  - [ ] Recent commands (latest-first, capped length).
  - [ ] Favorite commands (star/unstar).
  - [ ] Click command to quickly reuse in terminal input.
- [ ] Add navigation icon/link to terminal page in private layout.
- [ ] Keep visual consistency:
  - [ ] Card geometry and border style.
  - [ ] Spacing and typography hierarchy.
  - [ ] Scrollbar and interaction patterns.

Acceptance Criteria:
- Terminal is usable from private dashboard.
- Recent and Favorites are functional and fast to reuse.
- UI looks native to current dashboard style on desktop/mobile.

## Phase 5 - Reliability and Safety Checks

- [ ] Verify no regressions in existing pages:
  - [ ] Dashboard (`/app`)
  - [ ] Services (`/app/services`)
  - [ ] Files (`/app/files`)
  - [ ] Logs (`/app/logs`)
- [ ] Verify existing private API routes still behave normally.
- [ ] Verify auth behavior:
  - [ ] Unauthorized requests rejected.
  - [ ] Authenticated requests succeed.

Acceptance Criteria:
- No existing private dashboard feature is broken.
- Terminal feature failures do not impact unrelated dashboard pages.

## Phase 6 - Verification

Functional Verification:
- [ ] Open terminal page successfully while authenticated.
- [ ] Execute simple success command (e.g. `pwd`).
- [ ] Execute command with stderr and confirm surfaced feedback.
- [ ] Execute command with larger output and verify output rendering remains stable.
- [ ] Confirm recent command updates after each execution.
- [ ] Confirm favorite add/remove/toggle behavior.
- [ ] Confirm click recent/favorite for reuse fills or runs expected command.
- [ ] Confirm session close behavior and reopen flow.

UI Consistency Verification:
- [ ] Compare spacing/radius/colors against existing private pages.
- [ ] Confirm controls match existing hover/focus behavior.
- [ ] Confirm mobile layout and desktop two-panel layout.
- [ ] Confirm terminal and side panel scroll behavior is visually consistent.

Safety Regression Verification:
- [ ] Run lint and type checks.
- [ ] Run available tests.
- [ ] Smoke-test existing private pages manually.

Acceptance Criteria:
- Verification checklist complete with pass/fail notes.
- Any failures documented with mitigation or follow-up tasks.

## Phase 7 - Definition of Done (overall feature)

Definition of Done:
- [ ] Feature is on branch `aj-web-terminal`.
- [ ] Web terminal is available in private dashboard via dedicated nav entry.
- [ ] Commands can be executed from web terminal UI.
- [ ] Recent and Favorites side panel works and supports quick reuse.
- [ ] Existing dashboard features remain functional.
- [ ] Functional and UI consistency checks completed.
- [ ] Known limitations documented.
- [ ] Final summary includes changed files, test evidence, and follow-up items.

## Notes / Risks / Follow-up

- [ ] Document any temporary mock/fallback behavior if PTY is limited in environment.
- [ ] Document any constraints around long-running interactive programs.
- [ ] Document persistence scope (local storage vs server persistence).
