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
