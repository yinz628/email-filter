/**
 * Worker instance status
 */
export type InstanceStatus = 'active' | 'inactive' | 'error';

/**
 * Worker instance configuration
 */
export interface WorkerInstance {
  id: string;
  name: string;
  apiUrl: string;
  apiKey?: string;
  createdAt: Date;
  updatedAt: Date;
  status: InstanceStatus;
}

/**
 * DTO for creating a worker instance
 */
export interface CreateInstanceDTO {
  name: string;
  apiUrl: string;
  apiKey?: string;
}

/**
 * DTO for updating a worker instance
 */
export interface UpdateInstanceDTO {
  name?: string;
  apiUrl?: string;
  apiKey?: string;
  status?: InstanceStatus;
}

/**
 * Aggregated statistics from all worker instances
 */
export interface AggregatedStats {
  instances: InstanceStats[];
  totalProcessed: number;
  totalDeleted: number;
  totalErrors: number;
}

/**
 * Statistics for a single worker instance
 */
export interface InstanceStats {
  instanceId: string;
  instanceName: string;
  ruleStats: {
    ruleId: string;
    category: string;
    pattern: string;
    totalProcessed: number;
    deletedCount: number;
    errorCount: number;
  }[];
  watchStats: {
    watchId: string;
    subjectPattern: string;
    totalCount: number;
    last24hCount: number;
    last1hCount: number;
    recipients: string[];
  }[];
}
