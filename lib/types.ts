export type MetricsResponse = {
  timestamp: string;
  hostname: string;
  uptimeSeconds: number;
  cpu: {
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
};

export type DiskInfo = {
  filesystem: string;
  type: string;
  sizeBytes: number;
  usedBytes: number;
  availableBytes: number;
  usedPercent: number;
  mount: string;
};

export type DisksResponse = {
  timestamp: string;
  disks: DiskInfo[];
};
