import { getDatabase, generateId } from './index.js';

export interface WorkerInstance {
  id: string;
  name: string;
  apiUrl: string;
  apiKey: string | null;
  status: 'active' | 'inactive' | 'error';
  createdAt: string;
  updatedAt: string;
}

export interface CreateInstanceInput {
  name: string;
  apiUrl: string;
  apiKey?: string;
}

export interface UpdateInstanceInput {
  name?: string;
  apiUrl?: string;
  apiKey?: string;
  status?: 'active' | 'inactive' | 'error';
}

/**
 * Get all worker instances
 */
export function getAllInstances(): WorkerInstance[] {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT id, name, api_url, api_key, status, created_at, updated_at
    FROM worker_instances
    ORDER BY created_at DESC
  `).all() as any[];
  
  return rows.map(row => ({
    id: row.id,
    name: row.name,
    apiUrl: row.api_url,
    apiKey: row.api_key,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

/**
 * Get instance by ID
 */
export function getInstanceById(id: string): WorkerInstance | null {
  const db = getDatabase();
  const row = db.prepare(`
    SELECT id, name, api_url, api_key, status, created_at, updated_at
    FROM worker_instances
    WHERE id = ?
  `).get(id) as any;
  
  if (!row) return null;
  
  return {
    id: row.id,
    name: row.name,
    apiUrl: row.api_url,
    apiKey: row.api_key,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Create a new instance
 */
export function createInstance(input: CreateInstanceInput): WorkerInstance {
  const db = getDatabase();
  const id = generateId();
  const now = new Date().toISOString();
  
  db.prepare(`
    INSERT INTO worker_instances (id, name, api_url, api_key, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'active', ?, ?)
  `).run(id, input.name, input.apiUrl, input.apiKey || null, now, now);
  
  return getInstanceById(id)!;
}

/**
 * Update an instance
 */
export function updateInstance(id: string, input: UpdateInstanceInput): WorkerInstance | null {
  const db = getDatabase();
  const existing = getInstanceById(id);
  if (!existing) return null;
  
  const now = new Date().toISOString();
  const updates: string[] = ['updated_at = ?'];
  const values: any[] = [now];
  
  if (input.name !== undefined) {
    updates.push('name = ?');
    values.push(input.name);
  }
  if (input.apiUrl !== undefined) {
    updates.push('api_url = ?');
    values.push(input.apiUrl);
  }
  if (input.apiKey !== undefined) {
    updates.push('api_key = ?');
    values.push(input.apiKey);
  }
  if (input.status !== undefined) {
    updates.push('status = ?');
    values.push(input.status);
  }
  
  values.push(id);
  
  db.prepare(`
    UPDATE worker_instances
    SET ${updates.join(', ')}
    WHERE id = ?
  `).run(...values);
  
  return getInstanceById(id);
}

/**
 * Delete an instance
 */
export function deleteInstance(id: string): boolean {
  const db = getDatabase();
  const result = db.prepare('DELETE FROM worker_instances WHERE id = ?').run(id);
  return result.changes > 0;
}
