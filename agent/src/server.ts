import "dotenv/config";
import http from "node:http";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const HOST = "127.0.0.1";
const PORT = Number.parseInt(process.env.AGENT_PORT ?? "7777", 10);
const VERSION = "0.1.0";

if (process.env.AGENT_HOST && process.env.AGENT_HOST !== HOST) {
  console.warn("AGENT_HOST override ignored. Agent is bound to 127.0.0.1 only.");
}

type CpuSnapshot = {
  idle: number;
  total: number;
  cores: number;
};

type DiskInfo = {
  filesystem: string;
  type: string;
  sizeBytes: number;
  usedBytes: number;
  availableBytes: number;
  usedPercent: number;
  mount: string;
  driveType: "ssd" | "hdd" | "unknown";
};

let lastCpuSnapshot: CpuSnapshot | null = null;

function roundTo(value: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function getCpuSnapshot(): CpuSnapshot {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;

  for (const cpu of cpus) {
    idle += cpu.times.idle;
    total +=
      cpu.times.user +
      cpu.times.nice +
      cpu.times.sys +
      cpu.times.irq +
      cpu.times.idle;
  }

  return { idle, total, cores: cpus.length };
}

function calculateCpuUsagePercent(): { usagePercent: number; cores: number } {
  const current = getCpuSnapshot();

  if (!lastCpuSnapshot) {
    lastCpuSnapshot = current;
    return { usagePercent: 0, cores: current.cores };
  }

  const idleDiff = current.idle - lastCpuSnapshot.idle;
  const totalDiff = current.total - lastCpuSnapshot.total;
  lastCpuSnapshot = current;

  if (totalDiff <= 0) {
    return { usagePercent: 0, cores: current.cores };
  }

  const usage = (1 - idleDiff / totalDiff) * 100;
  return { usagePercent: roundTo(usage), cores: current.cores };
}

function toBytes(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed * 1024 : 0;
}

async function getDisks(): Promise<DiskInfo[]> {
  let stdout = "";

  try {
    ({ stdout } = await execFileAsync("df", [
      "-kP",
      "--output=source,fstype,size,used,avail,pcent,target",
    ]));
  } catch {
    ({ stdout } = await execFileAsync("df", ["-kPT"]));
  }

  const lines = stdout.trim().split("\n");
  lines.shift();

  const disks: DiskInfo[] = [];
  const driveTypeCache = new Map<string, "ssd" | "hdd" | "unknown">();

  const getDriveType = async (
    source: string
  ): Promise<"ssd" | "hdd" | "unknown"> => {
    if (!source.startsWith("/dev/")) {
      return "unknown";
    }

    const cached = driveTypeCache.get(source);
    if (cached) {
      return cached;
    }

    try {
      const { stdout: rotaRaw } = await execFileAsync("lsblk", [
        "-no",
        "ROTA",
        source,
      ]);
      const rota = Number.parseInt(rotaRaw.trim(), 10);
      const driveType =
        rota === 0 ? "ssd" : rota === 1 ? "hdd" : "unknown";
      driveTypeCache.set(source, driveType);
      return driveType;
    } catch {
      driveTypeCache.set(source, "unknown");
      return "unknown";
    }
  };

  for (const line of lines) {
    if (!line.trim()) continue;

    const parts = line.trim().split(/\s+/);
    if (parts.length < 7) {
      continue;
    }

    const [filesystem, type, blocks, used, available, capacity, ...mountParts] =
      parts;
    const mountRaw = mountParts.join(" ");
    const mount = mountRaw.replace(/\\040/g, " ");
    const usedPercent = Number.parseFloat(capacity.replace("%", ""));
    const driveType = await getDriveType(filesystem);

    disks.push({
      filesystem,
      type,
      sizeBytes: toBytes(blocks),
      usedBytes: toBytes(used),
      availableBytes: toBytes(available),
      usedPercent: Number.isFinite(usedPercent) ? usedPercent : 0,
      mount,
      driveType,
    });
  }

  return disks;
}

function sendJson(
  res: http.ServerResponse,
  status: number,
  payload: unknown
) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function sendError(res: http.ServerResponse, status: number, message: string) {
  sendJson(res, status, { error: message });
}

function logRequest(
  method: string | undefined,
  path: string,
  status: number,
  startTime: number
) {
  const durationMs = Date.now() - startTime;
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${method ?? "-"} ${path} ${status} ${durationMs}ms`);
}

const server = http.createServer(async (req, res) => {
  const startTime = Date.now();
  const method = req.method;
  const url = new URL(req.url ?? "/", "http://localhost");

  try {
    if (method !== "GET") {
      sendError(res, 405, "Method not allowed");
      logRequest(method, url.pathname, 405, startTime);
      return;
    }

    if (url.pathname === "/health") {
      sendJson(res, 200, {
        status: "ok",
        version: VERSION,
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
      });
      logRequest(method, url.pathname, 200, startTime);
      return;
    }

    if (url.pathname === "/metrics") {
      const cpu = calculateCpuUsagePercent();
      const memoryTotal = os.totalmem();
      const memoryFree = os.freemem();
      const memoryUsed = Math.max(0, memoryTotal - memoryFree);
      const memoryPercent =
        memoryTotal > 0 ? roundTo((memoryUsed / memoryTotal) * 100) : 0;

      sendJson(res, 200, {
        timestamp: new Date().toISOString(),
        hostname: os.hostname(),
        uptimeSeconds: Math.floor(os.uptime()),
        cpu: {
          usagePercent: cpu.usagePercent,
          loadAverages: os.loadavg(),
          cores: cpu.cores,
        },
        memory: {
          totalBytes: memoryTotal,
          usedBytes: memoryUsed,
          freeBytes: memoryFree,
          usedPercent: memoryPercent,
        },
      });
      logRequest(method, url.pathname, 200, startTime);
      return;
    }

    if (url.pathname === "/disks") {
      const disks = await getDisks();
      sendJson(res, 200, {
        timestamp: new Date().toISOString(),
        disks,
      });
      logRequest(method, url.pathname, 200, startTime);
      return;
    }

    sendError(res, 404, "Not found");
    logRequest(method, url.pathname, 404, startTime);
  } catch (error) {
    console.error("Agent error", error);
    sendError(res, 500, "Internal server error");
    logRequest(method, url.pathname, 500, startTime);
  }
});

server.requestTimeout = 5000;
server.headersTimeout = 6000;

server.listen(PORT, HOST, () => {
  console.log(`Agent listening on http://${HOST}:${PORT}`);
});


