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

## Agent Endpoints
- `GET /health`
- `GET /metrics`
- `GET /disks`

## Notes
- The public dashboard polls every 5 seconds.
- The agent uses Node's built-in `http` server to avoid extra dependencies.
- The agent and web both load environment variables from `.env`.
- If the agent runs on a different port, set `AGENT_URL` accordingly.
- You can override disk types with `DISK_TYPE_OVERRIDE` in `.env` (mount or device path).
