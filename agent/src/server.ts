import "dotenv/config";
import http from "node:http";
import os from "node:os";
import { execFile } from "node:child_process";
import { createReadStream, promises as fs } from "node:fs";
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
const ALLOWLIST_ROOTS_RAW = process.env.ALLOWLIST_ROOTS ?? "[]";
const LOG_SOURCES_RAW = process.env.LOG_SOURCES ?? "[]";
const LOG_DEFAULT_LINES_RAW = Number.parseInt(
  process.env.LOG_DEFAULT_LINES ?? "200",
  10
);
const LOG_MAX_LINES_RAW = Number.parseInt(
  process.env.LOG_MAX_LINES ?? "500",
  10
);
const LOG_DEFAULT_LINES = Number.isFinite(LOG_DEFAULT_LINES_RAW)
  ? LOG_DEFAULT_LINES_RAW
  : 200;
const LOG_MAX_LINES = Number.isFinite(LOG_MAX_LINES_RAW)
  ? LOG_MAX_LINES_RAW
  : 500;
const LOG_REDACT_KEYS = [
  "AUTH_PASSWORD",
  "AUTH_SECRET",
  "AGENT_TOKEN",
  "AGENT_PRIVATE_VALUE",
] as const;
const LOG_REDACT_MIN_LENGTH = 6;

const LOG_REDACT_VALUES = LOG_REDACT_KEYS.flatMap((key) => {
  const value = process.env[key];
  if (!value) return [];
  if (value.length < LOG_REDACT_MIN_LENGTH) return [];
  return [value];
}).sort((a, b) => b.length - a.length);

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

type DockerContainer = {
  id: string;
  name: string;
  image: string;
  status: string;
  state: "running" | "exited" | "paused" | "restarting" | "created" | "dead" | "unknown";
  health: "healthy" | "unhealthy" | "starting" | "none" | "unknown";
  ports: string[];
};

type DockerResult =
  | { ok: true; containers: DockerContainer[] }
  | { ok: false; status: number; error: string };

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

type AllowlistRoot = {
  id: string;
  path: string;
  label: string;
};

type FileEntry = {
  name: string;
  type: "file" | "dir" | "other";
  sizeBytes: number | null;
  modifiedMs: number | null;
};

type AllowlistRootResponse = {
  id: string;
  label: string;
  path: string;
};

type LogSource = {
  id: string;
  label: string;
  type: "docker" | "systemd" | "file";
  target: string;
};

type LogResult =
  | { ok: true; content: string }
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

async function getIntelGpuInfo(): Promise<GpuInfo | null> {
  try {
    const { stdout } = await execFileAsync("lspci", ["-mm"], { timeout: 2000 });
    const lines = stdout.split(/\r?\n/).filter(Boolean);
    const intelLine = lines.find((line) => {
      if (!/\"(VGA compatible controller|3D controller|Display controller)\"/.test(line)) {
        return false;
      }
      return /\"Intel/i.test(line);
    });
    if (!intelLine) return null;
    const match = intelLine.match(
      /\"(?:VGA compatible controller|3D controller|Display controller)\"\\s+\"([^\"]+)\"\\s+\"([^\"]+)\"/
    );
    if (match) {
      const vendor = match[1].trim();
      const device = match[2].trim();
      return {
        name: `${vendor} ${device}`.trim() || "Intel Graphics",
        utilizationPercent: null,
        temperatureC: null,
        memoryTotalBytes: null,
        memoryUsedBytes: null,
        source: "lspci",
      };
    }
    return {
      name: "Intel Graphics",
      utilizationPercent: null,
      temperatureC: null,
      memoryTotalBytes: null,
      memoryUsedBytes: null,
      source: "lspci",
    };
  } catch {}

  return null;
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

const WINDOWS_DRIVE_REGEX = /^[A-Za-z]:[\\/]/;

function isWindowsPath(value: string): boolean {
  return WINDOWS_DRIVE_REGEX.test(value);
}

function getPathModule(rootPath: string) {
  return isWindowsPath(rootPath) ? path.win32 : path.posix;
}

function parseAllowlistRoots(raw: string): AllowlistRoot[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed
        .map((entry) => {
          if (
            !entry ||
            typeof entry !== "object" ||
            typeof (entry as AllowlistRoot).id !== "string" ||
            typeof (entry as AllowlistRoot).path !== "string"
          ) {
            return null;
          }
          const id = (entry as AllowlistRoot).id.trim();
          const filePath = (entry as AllowlistRoot).path.trim();
          if (!id || !filePath) return null;
          const label =
            typeof (entry as AllowlistRoot).label === "string" &&
            (entry as AllowlistRoot).label.trim().length > 0
              ? (entry as AllowlistRoot).label.trim()
              : id;
          return { id, path: filePath, label };
        })
        .filter((entry): entry is AllowlistRoot => Boolean(entry));
    }

    if (parsed && typeof parsed === "object") {
      return Object.entries(parsed as Record<string, string>)
        .map(([id, filePath]) => {
          if (typeof filePath !== "string") return null;
          const trimmedId = id.trim();
          const trimmedPath = filePath.trim();
          if (!trimmedId || !trimmedPath) return null;
          return { id: trimmedId, path: trimmedPath, label: trimmedId };
        })
        .filter((entry): entry is AllowlistRoot => Boolean(entry));
    }
  } catch (error) {
    console.warn("Failed to parse ALLOWLIST_ROOTS", error);
  }

  return [];
}

function parseLogSources(raw: string): LogSource[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed
        .map((entry) => {
          if (
            !entry ||
            typeof entry !== "object" ||
            typeof (entry as LogSource).id !== "string" ||
            typeof (entry as LogSource).target !== "string" ||
            typeof (entry as LogSource).type !== "string"
          ) {
            return null;
          }
          const id = (entry as LogSource).id.trim();
          const target = (entry as LogSource).target.trim();
          const type = (entry as LogSource).type as LogSource["type"];
          if (!id || !target) return null;
          if (type !== "docker" && type !== "systemd" && type !== "file") {
            return null;
          }
          const label =
            typeof (entry as LogSource).label === "string" &&
            (entry as LogSource).label.trim().length > 0
              ? (entry as LogSource).label.trim()
              : id;
          return { id, label, type, target };
        })
        .filter((entry): entry is LogSource => Boolean(entry));
    }
  } catch (error) {
    console.warn("Failed to parse LOG_SOURCES", error);
  }

  return [];
}

const allowlistRoots = parseAllowlistRoots(ALLOWLIST_ROOTS_RAW);
const allowlistMap = new Map(
  allowlistRoots.map((root) => [root.id, root])
);
const logSources = parseLogSources(LOG_SOURCES_RAW);
const logSourceMap = new Map(logSources.map((source) => [source.id, source]));

function clampLines(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return LOG_DEFAULT_LINES;
  }
  const max = Number.isFinite(LOG_MAX_LINES) ? LOG_MAX_LINES : 500;
  return Math.min(value, max);
}

function redactLogContent(content: string): string {
  if (!content || LOG_REDACT_VALUES.length === 0) {
    return content;
  }
  let redacted = content;
  for (const value of LOG_REDACT_VALUES) {
    redacted = redacted.split(value).join("[redacted]");
  }
  return redacted;
}

function sanitizeRelativePath(raw: string | null): string | null {
  const value = raw?.trim() ?? "";
  if (!value) return "";
  if (value.startsWith("/") || value.startsWith("\\")) return null;
  if (WINDOWS_DRIVE_REGEX.test(value)) return null;
  const parts = value.split(/[\\/]+/).filter(Boolean);
  if (parts.some((segment) => segment === "..")) {
    return null;
  }
  return value;
}

function isWithinRoot(
  rootPath: string,
  candidatePath: string,
  pathModule: typeof path.posix | typeof path.win32
): boolean {
  const needsCaseFold = isWindowsPath(rootPath);
  const rootNormalized = rootPath.endsWith(pathModule.sep)
    ? rootPath.slice(0, -1)
    : rootPath;
  const rootCompare = needsCaseFold
    ? rootNormalized.toLowerCase()
    : rootNormalized;
  const candidateCompare = needsCaseFold
    ? candidatePath.toLowerCase()
    : candidatePath;
  return (
    candidateCompare === rootCompare ||
    candidateCompare.startsWith(rootCompare + pathModule.sep)
  );
}

async function resolveAllowlistPath(
  rootId: string | null,
  relativePath: string | null
): Promise<
  | {
      ok: true;
      root: AllowlistRoot;
      rootPath: string;
      resolvedPath: string;
      pathModule: typeof path.posix | typeof path.win32;
    }
  | { ok: false; status: number; error: string }
> {
  if (!rootId) {
    return { ok: false, status: 400, error: "Missing root" };
  }

  const root = allowlistMap.get(rootId);
  if (!root) {
    return { ok: false, status: 404, error: "Unknown root" };
  }

  const pathModule = getPathModule(root.path);
  const rootResolved = pathModule.resolve(root.path);
  if (!pathModule.isAbsolute(rootResolved)) {
    return { ok: false, status: 500, error: "Invalid allowlist root" };
  }

  const safeRelative = sanitizeRelativePath(relativePath);
  if (safeRelative === null) {
    return { ok: false, status: 400, error: "Invalid path" };
  }

  const candidatePath = pathModule.resolve(rootResolved, safeRelative);
  if (!isWithinRoot(rootResolved, candidatePath, pathModule)) {
    return { ok: false, status: 403, error: "Path outside allowlist" };
  }

  return {
    ok: true,
    root,
    rootPath: rootResolved,
    resolvedPath: candidatePath,
    pathModule,
  };
}

async function verifyRealPath(
  rootPath: string,
  candidatePath: string,
  pathModule: typeof path.posix | typeof path.win32
): Promise<boolean> {
  try {
    const [rootRealPath, candidateRealPath] = await Promise.all([
      fs.realpath(rootPath),
      fs.realpath(candidatePath),
    ]);
    return isWithinRoot(rootRealPath, candidateRealPath, pathModule);
  } catch {
    return false;
  }
}

function getLogSource(id: string | null): LogSource | null {
  if (!id) return null;
  return logSourceMap.get(id) ?? null;
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

function parseDockerStatus(statusText: string): {
  state: DockerContainer["state"];
  health: DockerContainer["health"];
} {
  const lowered = statusText.toLowerCase();
  let state: DockerContainer["state"] = "unknown";

  if (lowered.startsWith("up")) {
    state = "running";
  } else if (lowered.startsWith("exited")) {
    state = "exited";
  } else if (lowered.startsWith("restarting")) {
    state = "restarting";
  } else if (lowered.startsWith("paused")) {
    state = "paused";
  } else if (lowered.startsWith("created")) {
    state = "created";
  } else if (lowered.startsWith("dead")) {
    state = "dead";
  }

  let health: DockerContainer["health"] = "none";
  if (lowered.includes("(healthy)")) {
    health = "healthy";
  } else if (lowered.includes("(unhealthy)")) {
    health = "unhealthy";
  } else if (lowered.includes("(starting)")) {
    health = "starting";
  } else if (lowered.includes("(health:")) {
    health = "unknown";
  }

  return { state, health };
}

async function getDockerContainers(): Promise<DockerResult> {
  try {
    const { stdout } = await execFileAsync(
      "docker",
      [
        "ps",
        "--all",
        "--no-trunc",
        "--format",
        "{{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}",
      ],
      { timeout: 4000 }
    );

    const containers: DockerContainer[] = [];
    const lines = stdout.split(/\r?\n/).filter(Boolean);

    for (const line of lines) {
      const [id, name, image, statusText, portsText = ""] = line.split("\t");
      if (!id || !name) continue;
      const { state, health } = parseDockerStatus(statusText ?? "");
      const ports = portsText
        ? portsText.split(",").map((entry) => entry.trim()).filter(Boolean)
        : [];

      containers.push({
        id,
        name,
        image: image ?? "",
        status: statusText ?? "",
        state,
        health,
        ports,
      });
    }

    return { ok: true, containers };
  } catch (error) {
    const rawMessage =
      typeof error === "object" && error
        ? String(
            (error as { stderr?: string; message?: string }).stderr ??
              (error as { message?: string }).message ??
              ""
          )
        : "";

    const lowered = rawMessage.toLowerCase();
    if (
      lowered.includes("cannot connect to the docker daemon") ||
      lowered.includes("is the docker daemon running") ||
      lowered.includes("error during connect")
    ) {
      return { ok: false, status: 503, error: "docker unavailable" };
    }

    if (lowered.includes("permission denied")) {
      return { ok: false, status: 403, error: "docker access denied" };
    }

    if (
      lowered.includes("not found") ||
      lowered.includes("executable file not found") ||
      lowered.includes("enoent")
    ) {
      return { ok: false, status: 503, error: "docker unavailable" };
    }

    return { ok: false, status: 500, error: "docker error" };
  }
}

async function listDirectoryEntries(
  directoryPath: string,
  pathModule: typeof path.posix | typeof path.win32
): Promise<FileEntry[]> {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });
  const results: FileEntry[] = [];

  for (const entry of entries) {
    const entryPath = pathModule.join(directoryPath, entry.name);
    let stats: { size: number; mtimeMs: number } | null = null;
    try {
      const info = await fs.lstat(entryPath);
      stats = { size: info.size, mtimeMs: info.mtimeMs };
    } catch {
      stats = null;
    }

    const type = entry.isDirectory()
      ? "dir"
      : entry.isFile()
      ? "file"
      : "other";

    results.push({
      name: entry.name,
      type,
      sizeBytes: stats ? stats.size : null,
      modifiedMs: stats ? stats.mtimeMs : null,
    });
  }

  return results.sort((a, b) => {
    if (a.type !== b.type) {
      if (a.type === "dir") return -1;
      if (b.type === "dir") return 1;
      if (a.type === "file") return -1;
      if (b.type === "file") return 1;
    }
    return a.name.localeCompare(b.name);
  });
}

async function tailFile(
  filePath: string,
  lines: number
): Promise<LogResult> {
  try {
    const { stdout } = await execFileAsync(
      "tail",
      ["-n", String(lines), filePath],
      { timeout: 4000 }
    );
    return { ok: true, content: stdout };
  } catch (error) {
    const message =
      typeof error === "object" && error
        ? String(
            (error as { stderr?: string; message?: string }).stderr ??
              (error as { message?: string }).message ??
              ""
          )
        : "";
    const lowered = message.toLowerCase();
    if (lowered.includes("no such file") || lowered.includes("enoent")) {
      return { ok: false, status: 404, error: "log file not found" };
    }
    if (lowered.includes("permission denied") || lowered.includes("eacces")) {
      return { ok: false, status: 403, error: "log access denied" };
    }
    return { ok: false, status: 500, error: "log tail error" };
  }
}

async function tailDockerLogs(
  container: string,
  lines: number
): Promise<LogResult> {
  try {
    const { stdout } = await execFileAsync(
      "docker",
      ["logs", "--tail", String(lines), container],
      { timeout: 4000 }
    );
    return { ok: true, content: stdout };
  } catch (error) {
    const message =
      typeof error === "object" && error
        ? String(
            (error as { stderr?: string; message?: string }).stderr ??
              (error as { message?: string }).message ??
              ""
          )
        : "";
    const lowered = message.toLowerCase();

    if (
      lowered.includes("cannot connect to the docker daemon") ||
      lowered.includes("is the docker daemon running") ||
      lowered.includes("error during connect") ||
      lowered.includes("executable file not found") ||
      lowered.includes("enoent")
    ) {
      return { ok: false, status: 503, error: "docker unavailable" };
    }
    if (lowered.includes("no such container")) {
      return { ok: false, status: 404, error: "container not found" };
    }
    if (lowered.includes("permission denied")) {
      return { ok: false, status: 403, error: "docker access denied" };
    }
    return { ok: false, status: 500, error: "docker logs error" };
  }
}

async function tailSystemdLogs(
  unit: string,
  lines: number
): Promise<LogResult> {
  try {
    const { stdout, stderr } = await execFileAsync(
      "journalctl",
      [
        "-u",
        unit,
        "-n",
        String(lines),
        "--no-pager",
        "--output",
        "short-iso",
      ],
      { timeout: 4000 }
    );
    if (stderr && stderr.toLowerCase().includes("no entries")) {
      return { ok: true, content: "" };
    }
    return { ok: true, content: stdout };
  } catch (error) {
    const message =
      typeof error === "object" && error
        ? String(
            (error as { stderr?: string; message?: string }).stderr ??
              (error as { message?: string }).message ??
              ""
          )
        : "";
    const lowered = message.toLowerCase();

    if (
      lowered.includes("failed to connect to bus") ||
      lowered.includes("system has not been booted with systemd")
    ) {
      return { ok: false, status: 503, error: "systemd unavailable" };
    }
    if (lowered.includes("permission denied") || lowered.includes("access denied")) {
      return { ok: false, status: 403, error: "systemd access denied" };
    }
    if (lowered.includes("unit") && lowered.includes("could not be found")) {
      return { ok: false, status: 404, error: "unit not found" };
    }
    return { ok: false, status: 500, error: "systemd log error" };
  }
}

async function getLogTail(
  source: LogSource,
  lines: number
): Promise<LogResult> {
  if (source.type === "docker") {
    return tailDockerLogs(source.target, lines);
  }
  if (source.type === "systemd") {
    return tailSystemdLogs(source.target, lines);
  }
  return tailFile(source.target, lines);
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
      const intelGpu = await getIntelGpuInfo();
      const hasIntelAlready =
        gpu.source === "lspci" && gpu.name.toLowerCase().includes("intel");

      const payload: Record<string, unknown> = {
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
      };

      if (intelGpu && !hasIntelAlready) {
        payload.gpuIntel = intelGpu;
      }

      sendJson(res, 200, payload);
      logRequest(method, url.pathname, 200, startTime);
      return;
    }

    if (url.pathname === "/docker/containers") {
      const result = await getDockerContainers();
      if (!result.ok) {
        sendError(res, result.status, result.error);
        logRequest(method, url.pathname, result.status, startTime);
        return;
      }

      sendJson(res, 200, {
        timestamp: new Date().toISOString(),
        containers: result.containers,
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

    if (url.pathname === "/files/list") {
      const rootId = url.searchParams.get("root");
      const relativePath = url.searchParams.get("path");
      const resolved = await resolveAllowlistPath(rootId, relativePath);

      if (!resolved.ok) {
        sendError(res, resolved.status, resolved.error);
        logRequest(method, url.pathname, resolved.status, startTime);
        return;
      }

      let stat: Awaited<ReturnType<typeof fs.stat>>;
      try {
        stat = await fs.stat(resolved.resolvedPath);
      } catch {
        sendError(res, 404, "Path not found");
        logRequest(method, url.pathname, 404, startTime);
        return;
      }

      if (!stat.isDirectory()) {
        sendError(res, 400, "Path is not a directory");
        logRequest(method, url.pathname, 400, startTime);
        return;
      }

      const isAllowed = await verifyRealPath(
        resolved.rootPath,
        resolved.resolvedPath,
        resolved.pathModule
      );
      if (!isAllowed) {
        sendError(res, 403, "Path outside allowlist");
        logRequest(method, url.pathname, 403, startTime);
        return;
      }

      const entries = await listDirectoryEntries(
        resolved.resolvedPath,
        resolved.pathModule
      );

      sendJson(res, 200, {
        timestamp: new Date().toISOString(),
        root: resolved.root.id,
        path: relativePath ?? "",
        entries,
      });
      logRequest(method, url.pathname, 200, startTime);
      return;
    }

    if (url.pathname === "/files/roots") {
      const roots: AllowlistRootResponse[] = allowlistRoots.map((root) => ({
        id: root.id,
        label: root.label,
        path: root.path,
      }));

      sendJson(res, 200, {
        timestamp: new Date().toISOString(),
        roots,
      });
      logRequest(method, url.pathname, 200, startTime);
      return;
    }

    if (url.pathname === "/files/download") {
      const rootId = url.searchParams.get("root");
      const relativePath = url.searchParams.get("path");
      const resolved = await resolveAllowlistPath(rootId, relativePath);

      if (!resolved.ok) {
        sendError(res, resolved.status, resolved.error);
        logRequest(method, url.pathname, resolved.status, startTime);
        return;
      }

      let stat: Awaited<ReturnType<typeof fs.stat>>;
      try {
        stat = await fs.stat(resolved.resolvedPath);
      } catch {
        sendError(res, 404, "Path not found");
        logRequest(method, url.pathname, 404, startTime);
        return;
      }

      if (!stat.isFile()) {
        sendError(res, 400, "Path is not a file");
        logRequest(method, url.pathname, 400, startTime);
        return;
      }

      const isAllowed = await verifyRealPath(
        resolved.rootPath,
        resolved.resolvedPath,
        resolved.pathModule
      );
      if (!isAllowed) {
        sendError(res, 403, "Path outside allowlist");
        logRequest(method, url.pathname, 403, startTime);
        return;
      }

      const fileName = resolved.pathModule.basename(resolved.resolvedPath);
      res.writeHead(200, {
        "Content-Type": "application/octet-stream",
        "Content-Length": stat.size,
        "Content-Disposition": `attachment; filename=\"${fileName}\"`,
        "Cache-Control": "no-store",
      });

      const stream = createReadStream(resolved.resolvedPath);
      stream.on("error", () => {
        if (!res.headersSent) {
          sendError(res, 500, "File read error");
        } else {
          res.destroy();
        }
      });
      stream.pipe(res);
      logRequest(method, url.pathname, 200, startTime);
      return;
    }

    if (url.pathname === "/logs/sources") {
      const sources = logSources.map((source) => ({
        id: source.id,
        label: source.label,
        type: source.type,
      }));

      sendJson(res, 200, {
        timestamp: new Date().toISOString(),
        sources,
      });
      logRequest(method, url.pathname, 200, startTime);
      return;
    }

    if (url.pathname === "/logs/tail") {
      const sourceId = url.searchParams.get("source");
      const source = getLogSource(sourceId);
      if (!source) {
        sendError(res, 404, "Unknown log source");
        logRequest(method, url.pathname, 404, startTime);
        return;
      }

      const rawLines = url.searchParams.get("lines");
      const parsedLines = rawLines ? Number.parseInt(rawLines, 10) : NaN;
      const lines = clampLines(Number.isFinite(parsedLines) ? parsedLines : LOG_DEFAULT_LINES);

      const result = await getLogTail(source, lines);
      if (!result.ok) {
        sendError(res, result.status, result.error);
        logRequest(method, url.pathname, result.status, startTime);
        return;
      }

      const content = redactLogContent(result.content);
      sendJson(res, 200, {
        timestamp: new Date().toISOString(),
        source: source.id,
        lines,
        content,
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


