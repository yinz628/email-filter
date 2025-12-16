/**
 * Worker Instance Repository
 * Manages multiple Email Worker instances
 */

import type Database from 'better-sqlite3';

export interface WorkerInstance {
  id: string;
  name: string;
  domain: string;
  defaultForwardTo: string;
  workerUrl: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWorkerInput {
  name: string;
  domain?: string;
  defaultForwardTo: string;
  workerUrl?: string;
}

export interface UpdateWorkerInput {
  name?: string;
  domain?: string;
  defaultForwardTo?: string;
  workerUrl?: string;
  enabled?: boolean;
}

export class WorkerRepository {
  constructor(private db: Database.Database) {}

  /**
   * Get all worker instances
   */
  findAll(): WorkerInstance[] {
    const rows = this.db.prepare(`
      SELECT id, name, domain, default_forward_to, worker_url, enabled, created_at, updated_at
      FROM worker_instances
      ORDER BY created_at DESC
    `).all() as any[];

    return rows.map(this.mapRow);
  }

  /**
   * Get enabled worker instances
   */
  findEnabled(): WorkerInstance[] {
    const rows = this.db.prepare(`
      SELECT id, name, domain, default_forward_to, worker_url, enabled, created_at, updated_at
      FROM worker_instances
      WHERE enabled = 1
      ORDER BY created_at DESC
    `).all() as any[];

    return rows.map(this.mapRow);
  }

  /**
   * Get worker by ID
   */
  findById(id: string): WorkerInstance | null {
    const row = this.db.prepare(`
      SELECT id, name, domain, default_forward_to, worker_url, enabled, created_at, updated_at
      FROM worker_instances
      WHERE id = ?
    `).get(id) as any;

    return row ? this.mapRow(row) : null;
  }

  /**
   * Get worker by name (for webhook routing)
   */
  findByName(name: string): WorkerInstance | null {
    const row = this.db.prepare(`
      SELECT id, name, domain, default_forward_to, worker_url, enabled, created_at, updated_at
      FROM worker_instances
      WHERE name = ? AND enabled = 1
    `).get(name) as any;

    return row ? this.mapRow(row) : null;
  }

  /**
   * Get worker by domain
   */
  findByDomain(domain: string): WorkerInstance | null {
    const row = this.db.prepare(`
      SELECT id, name, domain, default_forward_to, worker_url, enabled, created_at, updated_at
      FROM worker_instances
      WHERE domain = ? AND enabled = 1
    `).get(domain) as any;

    return row ? this.mapRow(row) : null;
  }

  /**
   * Create a new worker instance
   */
  create(input: CreateWorkerInput): WorkerInstance {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO worker_instances (id, name, domain, default_forward_to, worker_url, enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?)
    `).run(id, input.name, input.domain || null, input.defaultForwardTo, input.workerUrl || null, now, now);

    return this.findById(id)!;
  }

  /**
   * Update a worker instance
   */
  update(id: string, input: UpdateWorkerInput): WorkerInstance | null {
    const existing = this.findById(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const updates: string[] = ['updated_at = ?'];
    const values: any[] = [now];

    if (input.name !== undefined) {
      updates.push('name = ?');
      values.push(input.name);
    }
    if (input.domain !== undefined) {
      updates.push('domain = ?');
      values.push(input.domain);
    }
    if (input.defaultForwardTo !== undefined) {
      updates.push('default_forward_to = ?');
      values.push(input.defaultForwardTo);
    }
    if (input.workerUrl !== undefined) {
      updates.push('worker_url = ?');
      values.push(input.workerUrl || null);
    }
    if (input.enabled !== undefined) {
      updates.push('enabled = ?');
      values.push(input.enabled ? 1 : 0);
    }

    values.push(id);

    this.db.prepare(`
      UPDATE worker_instances
      SET ${updates.join(', ')}
      WHERE id = ?
    `).run(...values);

    return this.findById(id);
  }

  /**
   * Delete a worker instance (cascades to rules and stats)
   */
  delete(id: string): boolean {
    const result = this.db.prepare('DELETE FROM worker_instances WHERE id = ?').run(id);
    return result.changes > 0;
  }

  /**
   * Toggle worker enabled status
   */
  toggle(id: string): WorkerInstance | null {
    const existing = this.findById(id);
    if (!existing) return null;

    return this.update(id, { enabled: !existing.enabled });
  }

  private mapRow(row: any): WorkerInstance {
    return {
      id: row.id,
      name: row.name,
      domain: row.domain,
      defaultForwardTo: row.default_forward_to,
      workerUrl: row.worker_url,
      enabled: row.enabled === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Check if a worker is online by calling its health endpoint
   */
  async checkWorkerHealth(workerUrl: string): Promise<{ 
    online: boolean; 
    latency?: number; 
    error?: string;
    vpsConnection?: { success: boolean; latency: number; error?: string };
  }> {
    if (!workerUrl) {
      return { online: false, error: 'No worker URL configured' };
    }

    // Use test-connection endpoint for full connectivity test
    const testUrl = workerUrl.endsWith('/') ? `${workerUrl}test-connection` : `${workerUrl}/test-connection`;
    const startTime = Date.now();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout for full test

      const response = await fetch(testUrl, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const latency = Date.now() - startTime;

      if (response.ok) {
        const data = await response.json() as any;
        return { 
          online: true, 
          latency,
          vpsConnection: data.vpsConnection,
        };
      } else {
        return { online: false, latency, error: `HTTP ${response.status}` };
      }
    } catch (error: any) {
      const latency = Date.now() - startTime;
      if (error.name === 'AbortError') {
        return { online: false, latency, error: 'Timeout' };
      }
      return { online: false, latency, error: error.message || 'Unknown error' };
    }
  }
}
