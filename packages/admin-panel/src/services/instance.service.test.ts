import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { InstanceService } from './instance.service.js';
import type { CreateInstanceDTO, UpdateInstanceDTO, InstanceStatus } from '@email-filter/shared';

/**
 * Mock D1Database for testing
 * Implements an in-memory SQLite-like storage
 */
class MockD1Database {
  private data: Map<string, Record<string, unknown>> = new Map();
  private idCounter = 0;

  prepare(sql: string) {
    return new MockStatement(this, sql);
  }

  batch(statements: MockStatement[]) {
    return Promise.all(statements.map(s => s.run()));
  }

  // Internal methods for MockStatement
  _insert(table: string, row: Record<string, unknown>) {
    this.data.set(`${table}:${row.id}`, row);
  }

  _update(table: string, id: string, updates: Record<string, unknown>) {
    const key = `${table}:${id}`;
    const existing = this.data.get(key);
    if (existing) {
      this.data.set(key, { ...existing, ...updates });
    }
  }

  _delete(table: string, id: string) {
    this.data.delete(`${table}:${id}`);
  }

  _findById(table: string, id: string): Record<string, unknown> | null {
    return this.data.get(`${table}:${id}`) as Record<string, unknown> || null;
  }

  _findAll(table: string): Record<string, unknown>[] {
    const results: Record<string, unknown>[] = [];
    for (const [key, value] of this.data.entries()) {
      if (key.startsWith(`${table}:`)) {
        results.push(value);
      }
    }
    return results.sort((a, b) => 
      new Date(b.created_at as string).getTime() - new Date(a.created_at as string).getTime()
    );
  }

  _findByStatus(table: string, status: string): Record<string, unknown>[] {
    return this._findAll(table).filter(row => row.status === status);
  }

  _clear() {
    this.data.clear();
  }
}


class MockStatement {
  private bindings: unknown[] = [];

  constructor(private db: MockD1Database, private sql: string) {}

  bind(...values: unknown[]) {
    this.bindings = values;
    return this;
  }

  async run() {
    const sql = this.sql.toLowerCase();
    
    if (sql.includes('insert into worker_instances')) {
      const [id, name, api_url, api_key, status, created_at, updated_at] = this.bindings;
      this.db._insert('worker_instances', {
        id, name, api_url, api_key, status, created_at, updated_at
      });
    } else if (sql.includes('update worker_instances')) {
      // Parse update statement by extracting field names in order
      const id = this.bindings[this.bindings.length - 1] as string;
      const updates: Record<string, unknown> = {};
      
      // Extract field assignments from SQL in order
      const setClause = sql.substring(sql.indexOf('set ') + 4, sql.indexOf(' where'));
      const fields = setClause.split(',').map(f => f.trim().split(' = ')[0].trim());
      
      // Map bindings to fields in order
      fields.forEach((field, idx) => {
        if (idx < this.bindings.length - 1) {
          updates[field] = this.bindings[idx];
        }
      });
      
      this.db._update('worker_instances', id, updates);
    } else if (sql.includes('delete from worker_instances')) {
      const id = this.bindings[0] as string;
      this.db._delete('worker_instances', id);
    }
    
    return { success: true };
  }

  async first<T>(): Promise<T | null> {
    const sql = this.sql.toLowerCase();
    
    if (sql.includes('from worker_instances where id = ?')) {
      const id = this.bindings[0] as string;
      return this.db._findById('worker_instances', id) as T | null;
    }
    
    return null;
  }

  async all<T>(): Promise<{ results: T[] }> {
    const sql = this.sql.toLowerCase();
    
    if (sql.includes('from worker_instances where status = ?')) {
      const status = this.bindings[0] as string;
      return { results: this.db._findByStatus('worker_instances', status) as T[] };
    }
    
    if (sql.includes('from worker_instances')) {
      return { results: this.db._findAll('worker_instances') as T[] };
    }
    
    return { results: [] };
  }
}


// Arbitrary for generating valid instance names
const instanceNameArbitrary = fc.string({ minLength: 1, maxLength: 50 })
  .filter(s => s.trim().length > 0);

// Arbitrary for generating valid API URLs
const apiUrlArbitrary = fc.webUrl();

// Arbitrary for generating optional API keys
const apiKeyArbitrary = fc.option(
  fc.string({ minLength: 32, maxLength: 64 }).filter(s => s.trim().length > 0),
  { nil: undefined }
);

// Arbitrary for generating CreateInstanceDTO
const createInstanceDTOArbitrary = fc.record({
  name: instanceNameArbitrary,
  apiUrl: apiUrlArbitrary,
  apiKey: apiKeyArbitrary,
});

// Arbitrary for generating UpdateInstanceDTO
const updateInstanceDTOArbitrary = fc.record({
  name: fc.option(instanceNameArbitrary, { nil: undefined }),
  apiUrl: fc.option(apiUrlArbitrary, { nil: undefined }),
  apiKey: fc.option(
    fc.option(fc.string({ minLength: 32, maxLength: 64 }), { nil: undefined }),
    { nil: undefined }
  ),
  status: fc.option(fc.constantFrom<InstanceStatus>('active', 'inactive', 'error'), { nil: undefined }),
});

// Arbitrary for instance status
const instanceStatusArbitrary = fc.constantFrom<InstanceStatus>('active', 'inactive', 'error');

describe('Instance Service', () => {
  let mockDb: MockD1Database;
  let service: InstanceService;

  beforeEach(() => {
    mockDb = new MockD1Database();
    service = new InstanceService(mockDb as unknown as D1Database);
  });


  /**
   * **Feature: vps-email-filter, Property 14: 实例管理**
   * *For any* 有效的 Worker 实例数据，注册后应能查询到该实例。
   * **Validates: Requirements 7.2**
   */
  describe('Property 14: 实例管理', () => {
    /**
     * Test: Create instance then query should return same data
     * Validates: Requirements 1.1, 1.4
     */
    it('create instance then query should return same data', async () => {
      await fc.assert(
        fc.asyncProperty(createInstanceDTOArbitrary, async (dto) => {
          // Reset database for each test
          mockDb._clear();
          
          // Create instance
          const created = await service.createInstance(dto);
          
          // Query by ID
          const queried = await service.getInstanceById(created.id);
          
          // Verify data consistency
          expect(queried).not.toBeNull();
          expect(queried!.id).toBe(created.id);
          expect(queried!.name).toBe(dto.name.trim());
          expect(queried!.apiUrl).toBe(dto.apiUrl.trim());
          expect(queried!.apiKey).toBe(dto.apiKey?.trim());
          expect(queried!.status).toBe('active'); // Default status
        }),
        { numRuns: 100 }
      );
    });

    /**
     * Test: Update instance then query should return updated data
     * Validates: Requirements 1.3
     */
    it('update instance then query should return updated data', async () => {
      await fc.assert(
        fc.asyncProperty(
          createInstanceDTOArbitrary,
          updateInstanceDTOArbitrary,
          async (createDto, updateDto) => {
            // Reset database for each test
            mockDb._clear();
            
            // Create instance first
            const created = await service.createInstance(createDto);
            
            // Update instance
            const updated = await service.updateInstance(created.id, updateDto);
            
            // Query by ID
            const queried = await service.getInstanceById(created.id);
            
            // Verify update was applied
            expect(queried).not.toBeNull();
            
            // Check each field - should be updated if provided, otherwise original
            if (updateDto.name !== undefined) {
              expect(queried!.name).toBe(updateDto.name.trim());
            } else {
              expect(queried!.name).toBe(createDto.name.trim());
            }
            
            if (updateDto.apiUrl !== undefined) {
              expect(queried!.apiUrl).toBe(updateDto.apiUrl.trim());
            } else {
              expect(queried!.apiUrl).toBe(createDto.apiUrl.trim());
            }
            
            if (updateDto.status !== undefined) {
              expect(queried!.status).toBe(updateDto.status);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Test: Delete instance then query should return null
     * Validates: Requirements 1.2
     */
    it('delete instance then query should return null', async () => {
      await fc.assert(
        fc.asyncProperty(createInstanceDTOArbitrary, async (dto) => {
          // Reset database for each test
          mockDb._clear();
          
          // Create instance
          const created = await service.createInstance(dto);
          
          // Verify it exists
          const beforeDelete = await service.getInstanceById(created.id);
          expect(beforeDelete).not.toBeNull();
          
          // Delete instance
          const deleted = await service.deleteInstance(created.id);
          expect(deleted).toBe(true);
          
          // Query should return null
          const afterDelete = await service.getInstanceById(created.id);
          expect(afterDelete).toBeNull();
        }),
        { numRuns: 100 }
      );
    });

    /**
     * Test: Get all instances should return all created instances
     * Validates: Requirements 1.4
     */
    it('get all instances should return all created instances', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(createInstanceDTOArbitrary, { minLength: 1, maxLength: 5 }),
          async (dtos) => {
            // Reset database for each test
            mockDb._clear();
            
            // Create all instances
            const createdIds: string[] = [];
            for (const dto of dtos) {
              const created = await service.createInstance(dto);
              createdIds.push(created.id);
            }
            
            // Get all instances
            const allInstances = await service.getAllInstances();
            
            // Verify all created instances are returned
            expect(allInstances.length).toBe(dtos.length);
            for (const id of createdIds) {
              expect(allInstances.some(i => i.id === id)).toBe(true);
            }
          }
        ),
        { numRuns: 50 }
      );
    });
  });


  describe('Validation', () => {
    it('should reject empty instance name', async () => {
      await expect(service.createInstance({
        name: '',
        apiUrl: 'https://example.com',
      })).rejects.toThrow('Instance name is required');
      
      await expect(service.createInstance({
        name: '   ',
        apiUrl: 'https://example.com',
      })).rejects.toThrow('Instance name is required');
    });

    it('should reject empty API URL', async () => {
      await expect(service.createInstance({
        name: 'Test Instance',
        apiUrl: '',
      })).rejects.toThrow('API URL is required');
    });

    it('should reject invalid API URL format', async () => {
      await expect(service.createInstance({
        name: 'Test Instance',
        apiUrl: 'not-a-valid-url',
      })).rejects.toThrow('Invalid API URL format');
    });
  });

  describe('Status Management', () => {
    it('should update instance status', async () => {
      mockDb._clear();
      
      const created = await service.createInstance({
        name: 'Test Instance',
        apiUrl: 'https://example.com',
      });
      
      expect(created.status).toBe('active');
      
      const updated = await service.setInstanceStatus(created.id, 'inactive');
      expect(updated?.status).toBe('inactive');
      
      const queried = await service.getInstanceById(created.id);
      expect(queried?.status).toBe('inactive');
    });
  });
});
