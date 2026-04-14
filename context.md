# Chitragupt Server Project Handoff Context

## Project purpose
Chitragupt is a self-hosted operations dashboard for a single Ubuntu server, split into:
- A local ops agent process (Node.js/TypeScript, custom HTTP server).
- A Next.js website that provides a public monitoring view and an authenticated private control/inspection area.

The website is not a generic frontend demo; it is the main operator-facing surface for this server setup.

## Current stage/status

### Already working (implemented in repo)
- Public monitoring website page at `/` with live polling every 1 second.
- Public API proxy routes:
  - `/api/public/metrics`
  - `/api/public/disks`
- Local ops agent endpoints for health, metrics, disks, docker, systemd, files, and logs.
- Private website area under `/app/*` with server-side session check in `app/app/layout.tsx`.
- Password login/logout/session endpoints:
  - `/api/auth/login`
  - `/api/auth/logout`
  - `/api/auth/session`
- Private API proxy routes protected by session checks:
  - Docker: `/api/private/docker`
  - systemd: `/api/private/systemd`
  - Files: `/api/private/files/roots`, `/api/private/files/list`, `/api/private/files/download`
  - Logs: `/api/private/logs/sources`, `/api/private/logs/tail`
- File browsing and download from allowlisted roots only.
- Log tailing for configured log sources (`docker`, `systemd`, `file`) with line limits and redaction of sensitive env values.

### Partially implemented / conditional behavior
- Docker and systemd features are implemented in code, but runtime success depends on host binaries and permissions:
  - Docker CLI availability and daemon access.
  - `systemctl` and `journalctl` availability and permission.
- GPU reporting is implemented with fallback behavior:
  - Uses `nvidia-smi` when available.
  - Falls back to `lspci` detection (limited telemetry).
  - Intel GPU utilization/temperature are often unknown unless host tools provide data.
- External drive validation is implemented but depends on env config and detected mount points.
- Middleware file exists (`middleware.ts`) but currently has empty matcher and no active enforcement logic.

### Planned / not yet built (explicitly listed in repo docs)
From README “More Ideas (Maybe for later)” section:
- Alerting (email/webhook/chat) for disk/service health.
- Safe actions (restart container/service) with audit log.
- Persisted metrics history and long-term trend charts.
- Multi-user roles/access controls.

These are ideas, not current capabilities.

## Architecture (as implemented)

### Components
1. Next.js app (`app/*` + API routes)
- Serves public monitoring UI and private authenticated UI.
- Acts as proxy layer between browser and local agent.
- Performs private-route authorization via cookie session.

2. Local ops agent (`agent/src/server.ts`)
- Runs a Node HTTP server bound to `127.0.0.1` only.
- Exposes JSON endpoints and file download stream endpoint.
- Performs host-level command execution (`df`, `docker`, `systemctl`, `journalctl`, etc.).

### Trust boundaries
- Browser never directly calls the agent.
- Browser calls Next.js routes.
- Next.js server calls agent via `AGENT_URL`.
- Agent private endpoints require token headers.

### Network binding
- Agent host is hardcoded to `127.0.0.1`.
- If `AGENT_HOST` is set to anything else, code logs warning and ignores override.

## Running services and runtime expectations

### Service 1: Next.js web app
- Dev: `next dev` (through `npm run dev` or `npm run dev:web`).
- Prod: `next build` then `next start`.
- Purpose: public monitoring UI + private authenticated operator UI + API proxy layer.

### Service 2: Ops agent
- Dev: `tsx watch -r dotenv/config agent/src/server.ts`.
- Prod build: `tsc -p agent/tsconfig.json`.
- Prod run: `node -r dotenv/config agent/dist/server.js`.
- Purpose: gather host telemetry and expose controlled server introspection APIs.

### Combined local dev
- `npm run dev` launches both web and agent concurrently.

## Monitoring website details (key existing component)

### Public site (`/`)
- Polls `/api/public/metrics` and `/api/public/disks` every second.
- Displays:
  - CPU model, usage, load averages, uptime.
  - Memory usage.
  - Disk usage for `/` and mounts under `/mnt/*`.
  - GPU cards (NVIDIA + Intel/fallback fields).
  - Status hearts (ok/warn/error/idle).
- Shows private-access entry icon based on `/api/auth/session`.

### Private site (`/app` and subpages)
- Requires valid session cookie (checked in server layout before page render).
- Shared private header includes:
  - Current status derived from public metrics/disks.
  - Link back to public dashboard.
  - Logout form posting to `/api/auth/logout`.

Private pages:
- `/app` (overview): summarizes docker/systemd/files/log sources.
- `/app/services`: docker container and systemd unit health-style cards.
- `/app/files`: root picker + directory listing + file download.
- `/app/logs`: source selector + live tail with configurable line count (50-500 client clamp).

### Website role in larger server setup
The website is the operational front-end for this server environment, while the agent is the local data/control plane. The web app centralizes all operator access paths and enforces browser-facing auth before reaching private server introspection endpoints.

## Data flow
1. Browser requests public/private page.
2. Page calls Next.js API routes.
3. Public routes proxy to agent public endpoints.
4. Private routes first verify cookie session, then proxy to agent private endpoints with token headers.
5. Agent executes host inspections/commands and returns results.
6. Next.js returns normalized JSON (or streamed file in download path) to browser.

### Private request chain example (logs tail)
- Browser -> `/api/private/logs/tail?...`
- Next.js `requireSession()`
- Next.js -> agent `/logs/tail?...` with:
  - token header (default `x-agent-token`)
  - private marker header (default `x-chitragupt-private: 1`)
- Agent validates headers, runs tail source adapter, redacts configured secret values, returns content.

## Auth and access model

### Website auth (cookie session)
- Single-user password model (`AUTH_PASSWORD`).
- Signed session token using HMAC-SHA256 with `AUTH_SECRET`.
- Cookie name: `chitragupt_session`.
- Default session age: 7 days (override with `AUTH_SESSION_MAX_AGE_SECONDS`).
- Private UI routes guarded in `app/app/layout.tsx`.
- Private API routes guarded by `requireSession()` helper.

### Agent auth (header token)
- Private agent endpoints require:
  - Token header (default `x-agent-token`) equal to `AGENT_TOKEN`.
  - Private marker header (default `x-chitragupt-private`) equal to `AGENT_PRIVATE_VALUE` (default `1`).
- If token is missing/wrong, agent returns 401.

## Storage and mounts

### Disk monitoring scope in UI
- Public UI storage cards include only:
  - `/`
  - mounts starting with `/mnt/`
- Other mounts may exist in agent response but are not surfaced by that page’s storage summary cards.

### File browser scope
- Strict allowlist from `ALLOWLIST_ROOTS` env JSON.
- Path traversal protections:
  - rejects absolute paths and `..` traversal.
  - resolves and enforces in-root checks.
  - uses realpath verification before listing/downloading.

### External drive validation
- Agent computes validation result for configured targets from `EXTERNAL_DRIVE_VALIDATION`.
- If not configured, defaults include `/mnt/Extreme500` and `/mnt/PortableSSD` expected as SSD.

## Networking and remote access
- Agent is localhost-only (`127.0.0.1`) by design.
- Web app reaches agent through `AGENT_URL` (default points to localhost agent).
- Public internet exposure model for Next.js app is not defined in repo (unknown whether reverse proxy/TLS is used).
- No firewall or reverse proxy configs are present in repository.

## Deployment/runtime model

### Verified from repo
- Node version baseline: `.nvmrc` -> `20`.
- App is manually deployable per README steps.
- Recommended process supervision is external (systemd/pm2), but unit files are not included in repo.
- Build/run separation exists for web and agent.

### Not found in repo (explicit)
- No Dockerfile.
- No docker-compose file.
- No systemd unit/service files.
- No CI pipeline config in repository root.

## Environment/config surface
From `.env.example` and code usage:
- Agent connectivity/auth:
  - `AGENT_PORT`, `AGENT_URL`, `AGENT_TOKEN`
  - `AGENT_TOKEN_HEADER`, `AGENT_PRIVATE_HEADER`, `AGENT_PRIVATE_VALUE`
- Disk and validation:
  - `DISK_TYPE_OVERRIDE`
  - `EXTERNAL_DRIVE_VALIDATION`
- File and logs:
  - `ALLOWLIST_ROOTS`
  - `LOG_SOURCES`
  - `LOG_DEFAULT_LINES`, `LOG_MAX_LINES`
- Web auth:
  - `AUTH_PASSWORD`, `AUTH_SECRET`, `AUTH_SESSION_MAX_AGE_SECONDS`

## Known gaps and operational risks
- Middleware currently does nothing; all access control relies on layout/route-level checks.
- Private features are highly environment-dependent (docker/systemd/journal tools and permissions).
- No built-in persistence for time-series metrics history.
- No test suite/config discovered in this repo.
- No infra-as-code/deployment automation found.
- No packaged service definitions in repo for reproducible host bootstrap.

## Next priorities (practical, based on current state)
1. Add reproducible service management artifacts (at minimum documented systemd unit files for web and agent).
2. Add health-check and smoke-test scripts for critical routes (`/api/public/*`, auth routes, and private route auth behavior).
3. Define production ingress model explicitly (reverse proxy, TLS termination, and trusted headers assumptions).
4. Add persistence for metrics if long-term trend visibility is required.
5. If multi-operator use is expected, replace single-password model with user accounts/roles.

## Important commands and paths

### Commands
- Install deps: `npm install`
- Dev (web + agent): `npm run dev`
- Dev (web only): `npm run dev:web`
- Build web: `npm run build`
- Start web (prod): `npm start`
- Build agent: `npm run agent:build`
- Start agent (prod): `npm run agent:start`

### High-value paths
- Agent server: `agent/src/server.ts`
- Agent client/proxy helpers: `lib/agent.ts`
- Auth primitives: `lib/auth.ts`
- Auth gate helper: `lib/auth-server.ts`
- Public dashboard: `app/page.tsx`
- Private layout/auth gate: `app/app/layout.tsx`
- Private pages:
  - `app/app/page.tsx`
  - `app/app/services/page.tsx`
  - `app/app/files/page.tsx`
  - `app/app/logs/page.tsx`
- API routes:
  - `app/api/public/*`
  - `app/api/private/*`
  - `app/api/auth/*`

## Assumption warnings for future assistants
- Do not assume Docker deployment exists; no Docker artifacts are in repo.
- Do not assume service units are versioned here; they are not present.
- Do not assume middleware enforces auth; it currently does not match any paths.
- Do not assume private page auth implies agent auth; both are separate layers and both must be configured.
- Do not assume non-`/mnt/*` disks appear in public storage cards; UI filters storage view.
- Do not assume internet-facing hardening is configured; ingress/TLS/proxy details are unknown from repo.

## Unknowns (explicit)
- Actual production host topology (reverse proxy, domain, TLS cert strategy).
- Actual process manager used in production (systemd vs pm2 vs other).
- Exact `ALLOWLIST_ROOTS` and `LOG_SOURCES` values in deployed environment.
- Whether agent and web run under same UNIX user in production.
- Any external monitoring/alerting integrations outside this repository.
