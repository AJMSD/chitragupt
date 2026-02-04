# Work Checklist (Node/TS)

## 0) Decisions & Inputs
- [x] Document auth decision: single-user password for private area.
- [ ] Provide allowlisted file roots with IDs and absolute paths.
- [x] Document log sources mapping: Immich (Docker logs), Jellyfin (systemd journal), Minecraft (tmux), Terraria (tmux).
- [x] Set public metrics refresh interval to 5s with no additional caching.
- [x] Document Cloudflare Access timeline: domain created after everything is working.
- [x] Document host environment: Ubuntu 24.04.3.
- [x] Document Docker runtime: Docker Engine.
- [x] Confirm hostname display policy: show hostname publicly, never show IP.

## 1) Repo & Environment Setup
- [ ] Add or confirm Node/TS version pin (`.nvmrc` or `engines` in `package.json`).
- [x] Add `.env.example` with all required variables and short descriptions.
- [ ] Define `AGENT_TOKEN` generation expectations and rotation guidance.
- [ ] Define environment variables for allowlists and log sources.
- [x] Add a `docs/` section or README section for local dev and server deploy.
- [ ] Ensure lint and TypeScript settings cover the new agent codebase.
- [x] Ensure Tailwind build dependencies are installed for production builds.
- [x] Use PostCSS config compatible with server builds.
- [x] Set Turbopack root to app directory and provide webpack dev fallback.

## 2) Ops Agent (Node/TS) Foundation
- [x] Choose agent HTTP framework (Node `http`, Express, Fastify) and document why.
- [x] Create `agent/` directory with `tsconfig.json` and build output path.
- [x] Add build pipeline for agent (TypeScript compile to `dist/`).
- [x] Add minimal runtime script to start agent in production mode.
- [x] Implement structured logging (request method, path, status, duration).
- [x] Add centralized error handler with sanitized error output.
- [x] Add request timeout and size limits.
- [x] Add health endpoint (`GET /health`) with version, uptime, and OK status.

## 3) Agent Security & Auth
- [x] Enforce bind to `127.0.0.1` only.
- [x] Require `AGENT_TOKEN` header on all private endpoints.
- [x] Require an additional private claim/header from the web app for private endpoints.
- [x] Reject missing or invalid tokens with uniform 401 responses.
- [x] Ensure public endpoints never call private handlers.
- [ ] Add unit tests for auth middleware and token parsing.

## 4) Agent Metrics Endpoints
- [x] Implement CPU usage and load average retrieval.
- [x] Implement memory usage retrieval (total, used, free).
- [x] Implement uptime retrieval.
- [x] Add CPU model name to metrics payload.
- [x] Add GPU info (name, usage, temperature) to metrics payload.
- [x] Define response schema for `GET /metrics` and document it.
- [ ] Add lightweight caching for metrics (optional, TTL-based).

## 5) Agent Disk Endpoints
- [x] Decide disk usage collection method (`df -k` parsing vs library).
- [x] Implement mount listing with total/used/free/percent.
- [ ] Normalize mount paths and filesystem types.
- [x] Define response schema for `GET /disks` and document it.
- [x] Implement drive type detection (rotational + discard + dm slaves).
- [x] Add `.env` override support for disk type classification.
- [ ] Validate accuracy on external drives (Extreme500 + PortableSSD).

## 6) Agent Docker Endpoints (Private)
- [x] Choose Docker query approach (CLI `docker ps` vs Docker API).
- [x] Implement container list with name, status, health, ports, and image.
- [x] Normalize status strings (running, exited, unhealthy, etc.).
- [x] Define response schema for `GET /docker/containers` and document it.
- [x] Add error mapping for Docker daemon not running.

## 7) Agent systemd Endpoints (Private)
- [x] Choose systemd query approach (`systemctl` parsing vs dbus).
- [x] Implement list of running + failed units.
- [x] Capture unit name, load state, active state, and sub-state.
- [x] Define response schema for `GET /systemd/units` and document it.
- [x] Add error mapping for missing permissions or systemd errors.

## 8) Agent File Browser (Private)
- [x] Define allowlist format (ID -> absolute path map).
- [x] Implement safe path resolver to prevent traversal.
- [x] Implement directory listing with name, type, size, modified time.
- [x] Implement file download with streaming and correct headers.
- [x] Add endpoint to list allowlisted roots.
- [ ] Enforce max file size or stream chunking if needed.
- [ ] Add unit tests for traversal attempts and invalid roots.

## 9) Agent Logs (Private)
- [x] Define log sources with IDs mapped to commands or files.
- [x] Implement log tailing with line cap and safe defaults.
- [x] Support systemd journal tail for services where applicable.
- [x] Implement Docker logs tail for container-based services.
- [x] Add error handling for missing logs or permissions.

## 10) Agent Contract & Types
- [x] Create shared TypeScript types for all agent responses.
- [ ] Add simple JSON schema validation for responses if needed.
- [ ] Add version field for agent responses to assist future migration.

## 11) Next.js API Proxy (Public)
- [x] Implement `/api/public/metrics` proxy route.
- [x] Implement `/api/public/disks` proxy route.
- [x] Add timeout and retry policy for agent calls.
- [x] Sanitize agent errors into user-safe responses.
- [ ] Add tests for public routes that ensure no private fields leak.

## 12) Next.js API Proxy (Private)
- [x] Implement `/api/private/docker` proxy route.
- [x] Implement `/api/private/systemd` proxy route.
- [x] Implement `/api/private/files/list` proxy route.
- [x] Implement `/api/private/files/download` proxy route.
- [x] Implement `/api/private/logs/tail` proxy route.
- [x] Enforce session checks on every private route.
- [ ] Add tests for unauthenticated access returning 401/redirect.

## 13) App Auth & Session
- [x] Choose auth approach and document the flow.
- [x] Implement login page and session handling.
- [x] Store session in secure cookies with appropriate flags.
- [x] Add Next.js middleware to protect `/app/*` routes.
- [x] Respect forwarded host/proto for login redirects.
- [x] Add server-side session checks in API routes.
- [x] Add logout action and session invalidation.

## 14) Public UI
- [x] Build landing page layout for public metrics.
- [x] Implement data fetching with polling.
- [x] Add health indicator logic (OK / Warning thresholds).
- [x] Add loading and error states.
- [x] Ensure no private UI elements render on public pages.
- [x] Add CPU/GPU summary cards with usage and load/temp.
- [x] Add total storage summary card.
- [x] Add disk usage cards grid with usage rings.
- [ ] Refresh the public theme to an orange palette.
- [ ] Add visual indicators (graphs, progress rings, gauges) for CPU, memory, and storage.

## 15) Private UI
- [ ] Build `/app` dashboard overview page.
- [ ] Build `/app/services` with Docker + systemd views.
- [ ] Build `/app/files` with allowlist root selector and navigation.
- [ ] Build `/app/logs` with source selector and tail display.
- [x] Add consistent navigation between private sections.
- [ ] Add empty states, error states, and permission errors.

## 16) Security Validation
- [ ] Confirm all public pages hit only public API routes.
- [ ] Confirm private API routes reject missing sessions.
- [ ] Confirm private agent routes reject missing tokens.
- [ ] Confirm file path resolver blocks traversal attempts.
- [ ] Confirm logs do not leak secrets or environment variables.

## 17) Systemd Services
- [ ] Create `ajmsd-ops-agent.service` with restart policy.
- [ ] Create `ajmsd-ops-web.service` with restart policy.
- [ ] Document environment file placement for both services.
- [ ] Validate auto-start on reboot.
- [ ] Validate agent and web logs via `journalctl`.

## 18) Cloudflare Tunnel & Access
- [ ] Document dev tunnel command and expected URL flow.
- [ ] Create named tunnel plan for production.
- [ ] Define Access policies for public vs private paths.
- [ ] Validate path-based protection on `/app/*`.

## 19) Documentation & Runbook
- [x] Update README with local dev instructions.
- [ ] Add deployment steps for server.
- [ ] Add troubleshooting section for agent and web service.
- [ ] Add checklist for safe updates and rollbacks.

## 20) Post-MVP (Deferred)
- [ ] Add alerts for disk usage and service health.
- [ ] Add safe actions (restart container/service) with audit log.
- [ ] Add optional metrics history and charts.
- [ ] Add multi-user support if needed.
