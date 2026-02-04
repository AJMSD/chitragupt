# ajmsd-ops
A self-hosted operations dashboard for Aman's Ubuntu server.

## Current MVP (Public)
- Local ops agent (Node/TS) bound to 127.0.0.1
- Public API proxy routes in Next.js (`/api/public/metrics`, `/api/public/disks`)
- Public dashboard with CPU, memory, disks, uptime, hostname, and total storage

## Local Development
1. Install dependencies: `npm install`
2. Copy env template if needed: `copy .env.example .env`
3. Start agent + web together: `npm run dev`
4. Open `http://localhost:3000`

## Private Access
- Set `AUTH_PASSWORD` and `AUTH_SECRET` in `.env`.
- Visit `/login` to authenticate; `/app/*` routes require a valid session.
- Session duration defaults to 7 days (`AUTH_SESSION_MAX_AGE_SECONDS`).

## Agent Endpoints
- `GET /health`
- `GET /metrics`
- `GET /disks`
- `GET /docker/containers` (private)
  - Response: `{ timestamp, containers: [{ id, name, image, status, state, health, ports }] }`
- `GET /systemd/units` (private)
  - Response: `{ timestamp, units: [{ name, loadState, activeState, subState, description }] }`

## Notes
- The public dashboard polls every 5 seconds.
- The agent uses Node's built-in `http` server to avoid extra dependencies.
- The agent and web both load environment variables from `.env`.
- If the agent runs on a different port, set `AGENT_URL` accordingly.
- You can override disk types with `DISK_TYPE_OVERRIDE` in `.env` (mount or device path).
