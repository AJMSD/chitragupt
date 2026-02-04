import "dotenv/config";
import http from "node:http";
import os from "node:os";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const HOST = "127.0.0.1";
const PORT = Number.parseInt(process.env.AGENT_PORT ?? "7777", 10);
const VERSION = "0.1.0";
const DEBUG_DISKS = process.env.AGENT_DEBUG_DISKS === "1";
const DISK_TYPE_OVERRIDE = process.env.DISK_TYPE_OVERRIDE ?? "";
const AGENT_TOKEN = process.env.AGENT_TOKEN ?? "";
const AGENT_TOKEN_HEADER = (
  process.env.AGENT_TOKEN_HEADER ?? "x-agent-token"
).toLowerCase();
const AGENT_PRIVATE_HEADER = (
  process.env.AGENT_PRIVATE_HEADER ?? "x-ajmsd-private"
).toLowerCase();
const AGENT_PRIVATE_VALUE = process.env.AGENT_PRIVATE_VALUE ?? "1";

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

type GpuInfo = {
  name: string;
  utilizationPercent: number | null;
  temperatureC: number | null;
  memoryTotalBytes: number | null;
  memoryUsedBytes: number | null;
  source: "nvidia-smi" | "lspci" | "unknown";
};

type SystemdUnit = {
  name: string;
  loadState: string;
  activeState: string;
  subState: string;
  description: string;
};

type SystemdResult =
  | { ok: true; units: SystemdUnit[] }
  | { ok: false; status: number; error: string };

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

function toMiBBytes(value: string): number | null {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed * 1024 * 1024 : null;
}

async function getGpuInfo(): Promise<GpuInfo> {
  const unknown: GpuInfo = {
    name: "Not detected",
    utilizationPercent: null,
    temperatureC: null,
    memoryTotalBytes: null,
    memoryUsedBytes: null,
    source: "unknown",
  };

  try {
    const { stdout } = await execFileAsync(
      "nvidia-smi",
      [
        "--query-gpu=name,utilization.gpu,temperature.gpu,memory.total,memory.used",
        "--format=csv,noheader,nounits",
      ],
      { timeout: 2000 }
    );

    const rows = stdout.trim().split(/\r?\n/).filter(Boolean);
    if (rows.length > 0) {
      const [nameRaw, utilRaw, tempRaw, memTotalRaw, memUsedRaw] = rows[0]
        .split(",")
        .map((value) => value.trim());
      const gpuCount = rows.length;
      const name =
        gpuCount > 1 ? `${nameRaw} (+${gpuCount - 1})` : nameRaw;
      const utilization = Number.parseFloat(utilRaw);
      const temperature = Number.parseFloat(tempRaw);
      return {
        name: name || "NVIDIA GPU",
        utilizationPercent: Number.isFinite(utilization) ? utilization : null,
        temperatureC: Number.isFinite(temperature) ? temperature : null,
        memoryTotalBytes: toMiBBytes(memTotalRaw),
        memoryUsedBytes: toMiBBytes(memUsedRaw),
        source: "nvidia-smi",
      };
    }
  } catch {}

  try {
    const { stdout } = await execFileAsync("lspci", ["-mm"], { timeout: 2000 });
    const lines = stdout.split(/\r?\n/);
    const gpuLine = lines.find((line) =>
      /(VGA compatible controller|3D controller|Display controller)/.test(line)
    );
    if (gpuLine) {
      const match = gpuLine.match(
        /\"(?:VGA compatible controller|3D controller|Display controller)\"\\s+\"([^\"]+)\"\\s+\"([^\"]+)\"/
      );
      if (match) {
        return {
          name: `${match[1]} ${match[2]}`,
          utilizationPercent: null,
          temperatureC: null,
          memoryTotalBytes: null,
          memoryUsedBytes: null,
          source: "lspci",
        };
      }
    }
  } catch {}

  return unknown;
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
  const sourceTypeCache = new Map<string, "ssd" | "hdd" | "unknown">();
  const overrideMap = new Map<string, "ssd" | "hdd">();

  const parseOverrides = () => {
    for (const entry of DISK_TYPE_OVERRIDE.split(",")) {
      const trimmed = entry.trim();
      if (!trimmed) continue;
      const [rawKey, rawValue] = trimmed.split("=").map((value) => value.trim());
      if (!rawKey || !rawValue) continue;
      if (rawValue !== "ssd" && rawValue !== "hdd") continue;
      overrideMap.set(rawKey, rawValue);
    }
  };

  parseOverrides();

  const getKernelName = async (source: string): Promise<string> => {
    try {
      const { stdout: nameRaw } = await execFileAsync("lsblk", [
        "-no",
        "KNAME",
        source,
      ]);
      const name = nameRaw.trim().split(/\s+/)[0];
      if (name) return name;
    } catch {}

    try {
      const { stdout: nameRaw } = await execFileAsync("lsblk", [
        "-no",
        "NAME",
        source,
      ]);
      const name = nameRaw.trim().split(/\s+/)[0];
      if (name) return name;
    } catch {}

    return path.basename(source);
  };

  const getParentName = async (source: string): Promise<string | null> => {
    try {
      const { stdout: parentRaw } = await execFileAsync("lsblk", [
        "-no",
        "PKNAME",
        source,
      ]);
      const parent = parentRaw.trim().split(/\s+/)[0];
      return parent || null;
    } catch {
      return null;
    }
  };

  const baseDeviceName = (name: string): string => {
    if (name.startsWith("dm-")) return name;
    if (name.startsWith("nvme") || name.startsWith("mmcblk")) {
      return name.replace(/p\\d+$/, "");
    }
    return name.replace(/\\d+$/, "");
  };

  const readRotational = async (deviceName: string): Promise<number | null> => {
    const cached = driveTypeCache.get(deviceName);
    if (cached) {
      return cached === "ssd" ? 0 : cached === "hdd" ? 1 : null;
    }

    try {
      const rotaRaw = await fs.readFile(
        `/sys/block/${deviceName}/queue/rotational`,
        "utf8"
      );
      const rota = Number.parseInt(rotaRaw.trim(), 10);
      if (rota === 0 || rota === 1) {
        driveTypeCache.set(deviceName, rota === 0 ? "ssd" : "hdd");
        return rota;
      }
    } catch {}

    driveTypeCache.set(deviceName, "unknown");
    return null;
  };

  const readDiscard = async (deviceName: string): Promise<number | null> => {
    try {
      const discardRaw = await fs.readFile(
        `/sys/block/${deviceName}/queue/discard_max_bytes`,
        "utf8"
      );
      const discard = Number.parseInt(discardRaw.trim(), 10);
      return Number.isFinite(discard) ? discard : null;
    } catch {
      return null;
    }
  };

  const getDmSlaves = async (deviceName: string): Promise<string[]> => {
    try {
      const entries = await fs.readdir(
        `/sys/class/block/${deviceName}/slaves`
      );
      return entries.filter(Boolean);
    } catch {
      return [];
    }
  };

  const classifyLeaf = async (
    deviceName: string
  ): Promise<"ssd" | "hdd" | "unknown"> => {
    const rota = await readRotational(deviceName);
    const discard = await readDiscard(deviceName);

    if (rota === 0) return "ssd";
    if (rota === 1) {
      if (discard !== null && discard > 0) {
        return "ssd";
      }
      return "hdd";
    }

    if (discard !== null && discard > 0) {
      return "ssd";
    }

    return "unknown";
  };

  const getDriveType = async (
    source: string
  ): Promise<"ssd" | "hdd" | "unknown"> => {
    if (!source.startsWith("/dev/")) {
      return "unknown";
    }

    const cached = sourceTypeCache.get(source);
    if (cached) {
      return cached;
    }

    const kernelName = await getKernelName(source);
    const parentName = await getParentName(source);
    const candidates = new Set([kernelName, baseDeviceName(kernelName)]);

    if (parentName) {
      candidates.add(parentName);
      candidates.add(baseDeviceName(parentName));
    }

    for (const candidate of candidates) {
      if (!candidate) continue;
      if (candidate.startsWith("dm-")) {
        const slaves = await getDmSlaves(candidate);
        const leafTypes = await Promise.all(
          slaves.map((slave) => classifyLeaf(baseDeviceName(slave)))
        );
        const hasHdd = leafTypes.includes("hdd");
        const hasSsd = leafTypes.includes("ssd");
        if (hasHdd) {
          sourceTypeCache.set(source, "hdd");
          if (DEBUG_DISKS) {
            console.log(
              `[disks] ${source} kernel=${kernelName} parent=${parentName ?? "-"} -> hdd via ${candidate} slaves=${slaves.join(",")}`
            );
          }
          return "hdd";
        }
        if (hasSsd) {
          sourceTypeCache.set(source, "ssd");
          if (DEBUG_DISKS) {
            console.log(
              `[disks] ${source} kernel=${kernelName} parent=${parentName ?? "-"} -> ssd via ${candidate} slaves=${slaves.join(",")}`
            );
          }
          return "ssd";
        }
      } else {
        const leafType = await classifyLeaf(candidate);
        if (leafType !== "unknown") {
          sourceTypeCache.set(source, leafType);
          if (DEBUG_DISKS) {
            console.log(
              `[disks] ${source} kernel=${kernelName} parent=${parentName ?? "-"} -> ${leafType} via ${candidate}`
            );
          }
          return leafType;
        }
      }
    }

    sourceTypeCache.set(source, "unknown");
    if (DEBUG_DISKS) {
      console.log(
        `[disks] ${source} kernel=${kernelName} parent=${parentName ?? "-"} -> unknown (candidates: ${[...candidates].join(", ")})`
      );
    }
    return "unknown";
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
    let driveType = await getDriveType(filesystem);
    const mountOverride = overrideMap.get(mount);
    const deviceOverride = overrideMap.get(filesystem);
    if (mountOverride || deviceOverride) {
      driveType = mountOverride ?? deviceOverride ?? driveType;
    }

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

function getHeaderValue(
  req: http.IncomingMessage,
  headerName: string
): string | null {
  const value = req.headers[headerName];
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function isPrivatePath(pathname: string): boolean {
  return (
    pathname.startsWith("/docker") ||
    pathname.startsWith("/systemd") ||
    pathname.startsWith("/files") ||
    pathname.startsWith("/logs")
  );
}

function hasPrivateAccess(req: http.IncomingMessage): boolean {
  if (!AGENT_TOKEN) return false;
  const token = getHeaderValue(req, AGENT_TOKEN_HEADER);
  const claim = getHeaderValue(req, AGENT_PRIVATE_HEADER);
  if (!token || !claim) return false;
  return token === AGENT_TOKEN && claim === AGENT_PRIVATE_VALUE;
}

async function getSystemdUnits(): Promise<SystemdResult> {
  try {
    const { stdout } = await execFileAsync(
      "systemctl",
      [
        "list-units",
        "--type=service",
        "--state=running,failed",
        "--no-legend",
        "--no-pager",
        "--all",
      ],
      { timeout: 4000 }
    );

    const units: SystemdUnit[] = [];
    const lines = stdout.split(/\r?\n/).filter(Boolean);

    for (const line of lines) {
      const match = line.match(/^(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(.*)$/);
      if (!match) continue;
      const [, name, loadState, activeState, subState, description] = match;
      units.push({ name, loadState, activeState, subState, description });
    }

    return { ok: true, units };
  } catch (error) {
    const raw =
      typeof error === "object" && error
        ? String(
            (error as { stderr?: string; message?: string }).stderr ??
              (error as { message?: string }).message ??
              ""
          )
        : "";
    const lowered = raw.toLowerCase();

    if (
      lowered.includes("system has not been booted with systemd") ||
      lowered.includes("failed to connect to bus")
    ) {
      return { ok: false, status: 503, error: "systemd unavailable" };
    }

    if (lowered.includes("access denied") || lowered.includes("permission")) {
      return { ok: false, status: 403, error: "systemd access denied" };
    }

    return { ok: false, status: 500, error: "systemd error" };
  }
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

    if (isPrivatePath(url.pathname) && !hasPrivateAccess(req)) {
      sendError(res, 401, "Unauthorized");
      logRequest(method, url.pathname, 401, startTime);
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
      const cpuSnapshot = calculateCpuUsagePercent();
      const cpuName = os.cpus()[0]?.model?.trim() || "Unknown CPU";
      const memoryTotal = os.totalmem();
      const memoryFree = os.freemem();
      const memoryUsed = Math.max(0, memoryTotal - memoryFree);
      const memoryPercent =
        memoryTotal > 0 ? roundTo((memoryUsed / memoryTotal) * 100) : 0;
      const gpu = await getGpuInfo();

      sendJson(res, 200, {
        timestamp: new Date().toISOString(),
        hostname: os.hostname(),
        uptimeSeconds: Math.floor(os.uptime()),
        cpu: {
          name: cpuName,
          usagePercent: cpuSnapshot.usagePercent,
          loadAverages: os.loadavg(),
          cores: cpuSnapshot.cores,
        },
        memory: {
          totalBytes: memoryTotal,
          usedBytes: memoryUsed,
          freeBytes: memoryFree,
          usedPercent: memoryPercent,
        },
        gpu,
      });
      logRequest(method, url.pathname, 200, startTime);
      return;
    }

    if (url.pathname === "/systemd/units") {
      const result = await getSystemdUnits();
      if (!result.ok) {
        sendError(res, result.status, result.error);
        logRequest(method, url.pathname, result.status, startTime);
        return;
      }

      sendJson(res, 200, {
        timestamp: new Date().toISOString(),
        units: result.units,
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


