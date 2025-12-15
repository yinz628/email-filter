/**
 * Instance Management Service
 * Handles Worker instance CRUD operations and status detection
 * Requirements: 1.1, 1.2, 1.3
 */

import type {
  WorkerInstance,
  CreateInstanceDTO,
  UpdateInstanceDTO,
  InstanceStatus,
} from '@email-filter/shared';
import { InstanceRepository } from '../db/instance-repository.js';

/**
 * Health check response from Worker instance
 */
interface HealthCheckResponse {
  status: 'ok' | 'error';
  timestamp?: string;
}

/**
 * Instance Service class for managing worker instances
 */
export class InstanceService {
  private repository: InstanceRepository;

  constructor(db: D1Database) {
    this.repository = new InstanceRepository(db);
  }

  /**
   * Get all worker instances
   * Requirements: 1.4
   */
  async getAllInstances(): Promise<WorkerInstance[]> {
    return this.repository.findAll();
  }

  /**
   * Get a single worker instance by ID
   */
  async getInstanceById(id: string): Promise<WorkerInstance | null> {
    return this.repository.findById(id);
  }

  /**
   * Get worker instances by status
   */
  async getInstancesByStatus(status: InstanceStatus): Promise<WorkerInstance[]> {
    return this.repository.findByStatus(status);
  }


  /**
   * Create a new worker instance
   * Requirements: 1.1
   */
  async createInstance(dto: CreateInstanceDTO): Promise<WorkerInstance> {
    // Validate required fields
    if (!dto.name || dto.name.trim() === '') {
      throw new Error('Instance name is required');
    }
    if (!dto.apiUrl || dto.apiUrl.trim() === '') {
      throw new Error('API URL is required');
    }

    // Validate URL format
    try {
      new URL(dto.apiUrl);
    } catch {
      throw new Error('Invalid API URL format');
    }

    return this.repository.create({
      name: dto.name.trim(),
      apiUrl: dto.apiUrl.trim(),
      apiKey: dto.apiKey?.trim(),
    });
  }

  /**
   * Update an existing worker instance
   * Requirements: 1.3
   */
  async updateInstance(id: string, dto: UpdateInstanceDTO): Promise<WorkerInstance | null> {
    // Validate URL format if provided
    if (dto.apiUrl !== undefined) {
      if (!dto.apiUrl || dto.apiUrl.trim() === '') {
        throw new Error('API URL cannot be empty');
      }
      try {
        new URL(dto.apiUrl);
      } catch {
        throw new Error('Invalid API URL format');
      }
    }

    // Validate name if provided
    if (dto.name !== undefined && (!dto.name || dto.name.trim() === '')) {
      throw new Error('Instance name cannot be empty');
    }

    const updateDto: UpdateInstanceDTO = {};
    if (dto.name !== undefined) updateDto.name = dto.name.trim();
    if (dto.apiUrl !== undefined) updateDto.apiUrl = dto.apiUrl.trim();
    if (dto.apiKey !== undefined) updateDto.apiKey = dto.apiKey?.trim();
    if (dto.status !== undefined) updateDto.status = dto.status;

    return this.repository.update(id, updateDto);
  }

  /**
   * Delete a worker instance
   * Requirements: 1.2
   */
  async deleteInstance(id: string): Promise<boolean> {
    return this.repository.delete(id);
  }

  /**
   * Check the health status of a worker instance
   * Updates the instance status based on the health check result
   */
  async checkInstanceHealth(id: string): Promise<InstanceStatus> {
    const instance = await this.repository.findById(id);
    if (!instance) {
      throw new Error('Instance not found');
    }

    const status = await this.performHealthCheck(instance);
    
    // Update status if changed
    if (status !== instance.status) {
      await this.repository.updateStatus(id, status);
    }

    return status;
  }

  /**
   * Check health of all instances and update their statuses
   */
  async checkAllInstancesHealth(): Promise<Map<string, InstanceStatus>> {
    const instances = await this.repository.findAll();
    const results = new Map<string, InstanceStatus>();

    for (const instance of instances) {
      const status = await this.performHealthCheck(instance);
      results.set(instance.id, status);

      // Update status if changed
      if (status !== instance.status) {
        await this.repository.updateStatus(instance.id, status);
      }
    }

    return results;
  }

  /**
   * Perform health check on a worker instance
   */
  private async performHealthCheck(instance: WorkerInstance): Promise<InstanceStatus> {
    // If instance is manually set to inactive, don't change it
    if (instance.status === 'inactive') {
      return 'inactive';
    }

    try {
      const healthUrl = new URL('/api/health', instance.apiUrl).toString();
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };

      if (instance.apiKey) {
        headers['Authorization'] = `Bearer ${instance.apiKey}`;
      }

      const response = await fetch(healthUrl, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });

      if (response.ok) {
        const data = await response.json() as HealthCheckResponse;
        return data.status === 'ok' ? 'active' : 'error';
      }

      return 'error';
    } catch {
      return 'error';
    }
  }

  /**
   * Update instance status manually
   */
  async setInstanceStatus(id: string, status: InstanceStatus): Promise<WorkerInstance | null> {
    return this.repository.updateStatus(id, status);
  }
}
