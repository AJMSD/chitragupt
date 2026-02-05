# ajmsd-ops
A self-hosted operations dashboard for Aman's Ubuntu server.

## Prerequisites
- Node.js 20.x (see `.nvmrc`).
- npm (bundled with Node).

## Current MVP (Public)
- Local ops agent (Node/TS) bound to 127.0.0.1
- Public API proxy routes in Next.js (`/api/public/metrics`, `/api/public/disks`)
- Public dashboard with CPU, memory, disks, uptime, hostname, and total storage

## Local Development
1. Install dependencies: `npm install`
2. Copy env template if needed: `copy .env.example .env`
3. Start agent + web together: `npm run dev`
4. Open `http://localhost:3000`

## Server Deploy (Manual)
1. Install dependencies: `npm install`
2. Create `.env` from template and fill required values:
   - `AUTH_PASSWORD`, `AUTH_SECRET`, `AGENT_TOKEN`
   - `ALLOWLIST_ROOTS`, `LOG_SOURCES`
3. Build: `npm run build` and `npm run agent:build`
4. Start:
   - Agent: `npm run agent:start`
   - Web: `npm start`
5. (Optional) Move to systemd units for auto-start on reboot.

## Private Access
- Set `AUTH_PASSWORD` and `AUTH_SECRET` in `.env`.
- Visit `/login` to authenticate; `/app/*` routes require a valid session.
- Session duration defaults to 7 days (`AUTH_SESSION_MAX_AGE_SECONDS`).

## Agent Token (AGENT_TOKEN)
- Generate a long random token:
  - `openssl rand -hex 32`
  - `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- Set the same token in `.env` for both the agent and the web app.
- Rotation: generate a new token, update `.env`, and restart both services.

## Agent Endpoints
- `GET /health`
- `GET /metrics`
- `GET /disks`
- `GET /docker/containers` (private)
  - Response: `{ timestamp, containers: [{ id, name, image, status, state, health, ports }] }`
- `GET /systemd/units` (private)
  - Response: `{ timestamp, units: [{ name, loadState, activeState, subState, description }] }`
- `GET /files/list?root=<id>&path=<relative>` (private)
  - Response: `{ timestamp, root, path, entries: [{ name, type, sizeBytes, modifiedMs }] }`
- `GET /files/roots` (private)
  - Response: `{ timestamp, roots: [{ id, label, path }] }`
- `GET /files/download?root=<id>&path=<relative>` (private)
- `GET /logs/tail?source=<id>&lines=200` (private)
  - Response: `{ timestamp, source, lines, content }`

## File Browser & Logs Config
- `ALLOWLIST_ROOTS` defines which folders are browsable/downloadable (JSON array).
- `LOG_SOURCES` defines log sources (docker, systemd, or file).
- See `.env.example` for sample values.

## Notes
- The public dashboard polls every 5 seconds.
- The agent uses Node's built-in `http` server to avoid extra dependencies.
- The agent and web both load environment variables from `.env`.
- If the agent runs on a different port, set `AGENT_URL` accordingly.
- You can override disk types with `DISK_TYPE_OVERRIDE` in `.env` (mount or device path).
