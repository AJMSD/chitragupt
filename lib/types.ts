export type MetricsResponse = {
  timestamp: string;
  hostname: string;
  uptimeSeconds: number;
  cpu: {
    name: string;
    usagePercent: number;
    loadAverages: number[];
    cores: number;
  };
  memory: {
    totalBytes: number;
    usedBytes: number;
    freeBytes: number;
    usedPercent: number;
  };
  gpu: {
    name: string;
    utilizationPercent: number | null;
    temperatureC: number | null;
    memoryTotalBytes: number | null;
    memoryUsedBytes: number | null;
    source: "nvidia-smi" | "lspci" | "unknown";
  };
  gpuIntel?: {
    name: string;
    utilizationPercent: number | null;
    temperatureC: number | null;
    memoryTotalBytes: number | null;
    memoryUsedBytes: number | null;
    source: "nvidia-smi" | "lspci" | "unknown";
  };
};

export type DiskInfo = {
  filesystem: string;
  type: string;
  sizeBytes: number;
  usedBytes: number;
  availableBytes: number;
  usedPercent: number;
  mount: string;
  driveType: "ssd" | "hdd" | "unknown";
};

export type ExternalDriveValidationStatus = "ok" | "missing" | "mismatch";

export type ExternalDriveValidationTarget = {
  mount: string;
  expectedDriveType: DiskInfo["driveType"];
  actualDriveType: DiskInfo["driveType"] | null;
  status: ExternalDriveValidationStatus;
  filesystem: string | null;
  sizeBytes: number | null;
};

export type ExternalDriveValidation = {
  ok: boolean;
  targets: ExternalDriveValidationTarget[];
};

export type DisksResponse = {
  timestamp: string;
  disks: DiskInfo[];
  validation?: ExternalDriveValidation;
};

export type DockerContainerInfo = {
  id: string;
  name: string;
  image: string;
  status: string;
  state: "running" | "exited" | "paused" | "restarting" | "created" | "dead" | "unknown";
  health: "healthy" | "unhealthy" | "starting" | "none" | "unknown";
  ports: string[];
};

export type DockerContainersResponse = {
  timestamp: string;
  containers: DockerContainerInfo[];
};

export type SystemdUnitInfo = {
  name: string;
  loadState: string;
  activeState: string;
  subState: string;
  description: string;
};

export type SystemdUnitsResponse = {
  timestamp: string;
  units: SystemdUnitInfo[];
};

export type FileEntry = {
  name: string;
  type: "file" | "dir" | "other";
  sizeBytes: number | null;
  modifiedMs: number | null;
};

export type FileListResponse = {
  timestamp: string;
  root: string;
  path: string;
  entries: FileEntry[];
};

export type FileRootInfo = {
  id: string;
  label: string;
  path: string;
};

export type FileRootsResponse = {
  timestamp: string;
  roots: FileRootInfo[];
};

export type LogSourceInfo = {
  id: string;
  label: string;
  type: "docker" | "systemd" | "file";
};

export type LogSourcesResponse = {
  timestamp: string;
  sources: LogSourceInfo[];
};

export type LogTailResponse = {
  timestamp: string;
  source: string;
  lines: number;
  content: string;
};

export type TerminalSessionCreateRequest = {
  cols?: number;
  rows?: number;
};

export type TerminalSessionCreateResponse = {
  timestamp: string;
  sessionId: string;
  cols: number;
  rows: number;
  cwd: string;
  shell: string;
  mode: "pty" | "fallback";
  fallbackClientEcho?: boolean;
  createdAt: string;
  user?: string;
  host?: string;
};

export type TerminalInputRequest = {
  sessionId: string;
  input: string;
};

export type TerminalInputResponse = {
  timestamp: string;
  sessionId: string;
  acceptedBytes: number;
};

export type TerminalResizeRequest = {
  sessionId: string;
  cols: number;
  rows: number;
};

export type TerminalResizeResponse = {
  timestamp: string;
  sessionId: string;
  cols: number;
  rows: number;
};

export type TerminalOutputRequest = {
  sessionId: string;
  cursor?: number;
};

export type TerminalOutputChunk = {
  index: number;
  data: string;
};

export type TerminalOutputResponse = {
  timestamp: string;
  sessionId: string;
  cursor: number;
  chunks: TerminalOutputChunk[];
  cwd?: string;
  sensitiveInputExpected?: boolean;
  closed: boolean;
  exitCode: number | null;
  closeReason: string | null;
};

export type TerminalCloseRequest = {
  sessionId: string;
};

export type TerminalCloseResponse = {
  timestamp: string;
  sessionId: string;
  closed: boolean;
};
