/**
 * Instance Repository
 * Handles CRUD operations for worker instances in D1 database
 */

import type {
  WorkerInstance,
  CreateInstanceDTO,
  UpdateInstanceDTO,
  InstanceStatus,
} from '@email-filter/shared';
import { generateId } from './index.js';

/**
 * Database row type for worker_instances table
 */
interface WorkerInstanceRow {
  id: string;
  name: string;
  api_url: string;
  api_key: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

/**
 * Convert database row to WorkerInstance object
 */
function rowToWorkerInstance(row: WorkerInstanceRow): WorkerInstance {
  return {
    id: row.id,
    name: row.name,
    apiUrl: row.api_url,
    apiKey: row.api_key || undefined,
    status: row.status as InstanceStatus,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

/**
 * Instance Repository class for managing worker instances
 */
export class InstanceRepository {
  constructor(private db: D1Database) {}

  /**
   * Get all worker instances
   */
  async findAll(): Promise<WorkerInstance[]> {
    const result = await this.db
      .prepare('SELECT * FROM worker_instances ORDER BY created_at DESC')
      .all<WorkerInstanceRow>();

    return (result.results || []).map(rowToWorkerInstance);
  }


  /**
   * Get worker instances by status
   */
  async findByStatus(status: InstanceStatus): Promise<WorkerInstance[]> {
    const result = await this.db
      .prepare('SELECT * FROM worker_instances WHERE status = ? ORDER BY created_at DESC')
      .bind(status)
      .all<WorkerInstanceRow>();

    return (result.results || []).map(rowToWorkerInstance);
  }

  /**
   * Get a single worker instance by ID
   */
  async findById(id: string): Promise<WorkerInstance | null> {
    const result = await this.db
      .prepare('SELECT * FROM worker_instances WHERE id = ?')
      .bind(id)
      .first<WorkerInstanceRow>();

    return result ? rowToWorkerInstance(result) : null;
  }

  /**
   * Create a new worker instance
   */
  async create(dto: CreateInstanceDTO): Promise<WorkerInstance> {
    const id = generateId();
    const now = new Date().toISOString();
    const status: InstanceStatus = 'active';

    await this.db
      .prepare(
        `INSERT INTO worker_instances (id, name, api_url, api_key, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(id, dto.name, dto.apiUrl, dto.apiKey || null, status, now, now)
      .run();

    return {
      id,
      name: dto.name,
      apiUrl: dto.apiUrl,
      apiKey: dto.apiKey,
      status,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    };
  }

  /**
   * Update an existing worker instance
   */
  async update(id: string, dto: UpdateInstanceDTO): Promise<WorkerInstance | null> {
    const existing = await this.findById(id);
    if (!existing) {
      return null;
    }

    const now = new Date().toISOString();
    const updates: string[] = [];
    const values: (string | null)[] = [];

    if (dto.name !== undefined) {
      updates.push('name = ?');
      values.push(dto.name);
    }
    if (dto.apiUrl !== undefined) {
      updates.push('api_url = ?');
      values.push(dto.apiUrl);
    }
    if (dto.apiKey !== undefined) {
      updates.push('api_key = ?');
      values.push(dto.apiKey || null);
    }
    if (dto.status !== undefined) {
      updates.push('status = ?');
      values.push(dto.status);
    }

    if (updates.length === 0) {
      return existing;
    }

    updates.push('updated_at = ?');
    values.push(now);
    values.push(id);

    await this.db
      .prepare(`UPDATE worker_instances SET ${updates.join(', ')} WHERE id = ?`)
      .bind(...values)
      .run();

    return this.findById(id);
  }

  /**
   * Update the status of a worker instance
   */
  async updateStatus(id: string, status: InstanceStatus): Promise<WorkerInstance | null> {
    const existing = await this.findById(id);
    if (!existing) {
      return null;
    }

    const now = new Date().toISOString();

    await this.db
      .prepare('UPDATE worker_instances SET status = ?, updated_at = ? WHERE id = ?')
      .bind(status, now, id)
      .run();

    return this.findById(id);
  }

  /**
   * Delete a worker instance
   */
  async delete(id: string): Promise<boolean> {
    const existing = await this.findById(id);
    if (!existing) {
      return false;
    }

    await this.db
      .prepare('DELETE FROM worker_instances WHERE id = ?')
      .bind(id)
      .run();

    return true;
  }
}
