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
