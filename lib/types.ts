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

export type DisksResponse = {
  timestamp: string;
  disks: DiskInfo[];
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
