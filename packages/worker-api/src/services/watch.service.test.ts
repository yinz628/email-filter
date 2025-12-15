import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import type { WatchItem, WatchStats, MatchMode, IncomingEmail } from '@email-filter/shared';

// In-memory mock implementation of D1Database for testing
class MockD1Database {
  private watchItems: Map<string, WatchItem> = new Map();
  private watchHits: Array<{ id: string; watchId: string; recipient: string; hitAt: Date }> = [];
  private nextId = 1;

  prepare(sql: string): MockD1PreparedStatement {
    return new MockD1PreparedStatement(sql, this);
  }

  // Expose for test verification
  getWatchItems(): Map<string, WatchItem> {
    return this.watchItems;
  }

  getWatchHits(): Array<{ id: string; watchId: string; recipient: string; hitAt: Date }> {
    return this.watchHits;
  }

  generateId(): string {
    return `watch-${this.nextId++}`;
  }

  clear(): void {
    this.watchItems.clear();
    this.watchHits = [];
    this.nextId = 1;
  }
}

class MockD1PreparedStatement {
  private boundValues: (string | number | null)[] = [];

  constructor(
    private sql: string,
    private db: MockD1Database
  ) {}

  bind(...values: (string | number | null)[]): MockD1PreparedStatement {
    this.boundValues = values;
    return this;
  }

  async run(): Promise<{ success: boolean; meta: { changes: number } }> {
    const sqlLower = this.sql.toLowerCase();
    const watchItems = this.db.getWatchItems();
    const watchHits = this.db.getWatchHits();


    if (sqlLower.includes('insert into watch_items')) {
      const [id, subjectPattern, matchMode, createdAt] = this.boundValues;
      const item: WatchItem = {
        id: id as string,
        subjectPattern: subjectPattern as string,
        matchMode: matchMode as MatchMode,
        createdAt: new Date(createdAt as string),
      };
      watchItems.set(id as string, item);
    } else if (sqlLower.includes('insert into watch_hits')) {
      const [id, watchId, recipient, hitAt] = this.boundValues;
      watchHits.push({
        id: id as string,
        watchId: watchId as string,
        recipient: recipient as string,
        hitAt: new Date(hitAt as string),
      });
    } else if (sqlLower.includes('delete from watch_hits where watch_id')) {
      const watchId = this.boundValues[0] as string;
      const toRemove = watchHits.filter(h => h.watchId === watchId);
      for (const hit of toRemove) {
        const idx = watchHits.indexOf(hit);
        if (idx >= 0) watchHits.splice(idx, 1);
      }
    } else if (sqlLower.includes('delete from watch_items')) {
      const id = this.boundValues[0] as string;
      watchItems.delete(id);
    }

    return { success: true, meta: { changes: 1 } };
  }

  async first<T>(): Promise<T | null> {
    const sqlLower = this.sql.toLowerCase();
    const watchItems = this.db.getWatchItems();
    const watchHits = this.db.getWatchHits();

    if (sqlLower.includes('select * from watch_items where id =')) {
      const id = this.boundValues[0] as string;
      const item = watchItems.get(id);
      if (!item) return null;
      return {
        id: item.id,
        subject_pattern: item.subjectPattern,
        match_mode: item.matchMode,
        created_at: item.createdAt.toISOString(),
      } as T;
    }

    if (sqlLower.includes('select * from watch_items where subject_pattern =')) {
      const pattern = this.boundValues[0] as string;
      for (const item of watchItems.values()) {
        if (item.subjectPattern === pattern) {
          return {
            id: item.id,
            subject_pattern: item.subjectPattern,
            match_mode: item.matchMode,
            created_at: item.createdAt.toISOString(),
          } as T;
        }
      }
      return null;
    }

    if (sqlLower.includes('count(*) as count from watch_hits where watch_id =')) {
      const watchId = this.boundValues[0] as string;
      
      if (sqlLower.includes('and hit_at >=')) {
        const cutoff = new Date(this.boundValues[1] as string);
        const count = watchHits.filter(h => 
          h.watchId === watchId && h.hitAt >= cutoff
        ).length;
        return { count } as T;
      }
      
      const count = watchHits.filter(h => h.watchId === watchId).length;
      return { count } as T;
    }

    return null;
  }


  async all<T>(): Promise<{ results: T[] }> {
    const sqlLower = this.sql.toLowerCase();
    const watchItems = this.db.getWatchItems();
    const watchHits = this.db.getWatchHits();

    if (sqlLower.includes('select * from watch_items')) {
      const rows = Array.from(watchItems.values()).map(item => ({
        id: item.id,
        subject_pattern: item.subjectPattern,
        match_mode: item.matchMode,
        created_at: item.createdAt.toISOString(),
      }));
      return { results: rows as T[] };
    }

    if (sqlLower.includes('select distinct recipient from watch_hits')) {
      const watchId = this.boundValues[0] as string;
      const recipients = new Set<string>();
      for (const hit of watchHits) {
        if (hit.watchId === watchId) {
          recipients.add(hit.recipient);
        }
      }
      const rows = Array.from(recipients).map(r => ({ recipient: r }));
      return { results: rows as T[] };
    }

    if (sqlLower.includes('select recipient, hit_at from watch_hits')) {
      const watchId = this.boundValues[0] as string;
      const rows = watchHits
        .filter(h => h.watchId === watchId)
        .map(h => ({ recipient: h.recipient, hit_at: h.hitAt.toISOString() }));
      return { results: rows as T[] };
    }

    return { results: [] };
  }
}

// Mock crypto.randomUUID for testing
let mockUuidCounter = 0;
const originalRandomUUID = crypto.randomUUID;
function mockRandomUUID(): string {
  return `mock-uuid-${++mockUuidCounter}`;
}

// Import the service and repository after mock is defined
import { WatchRepository } from '../db/watch-repository.js';
import { WatchService } from './watch.service.js';

// Arbitraries for generating test data
const matchModeArbitrary = fc.constantFrom<MatchMode>('regex', 'contains');

const subjectPatternArbitrary = fc.string({ minLength: 1, maxLength: 50 })
  .filter(s => s.trim().length > 0)
  .map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '')); // Remove regex special chars for safety

const emailArbitrary = fc.emailAddress();

const incomingEmailArbitrary = fc.record({
  recipient: emailArbitrary,
  sender: fc.string({ minLength: 1, maxLength: 50 }),
  senderEmail: emailArbitrary,
  subject: fc.string({ minLength: 1, maxLength: 100 }),
  receivedAt: fc.date(),
});

const createWatchDTOArbitrary = fc.record({
  subjectPattern: subjectPatternArbitrary,
  matchMode: matchModeArbitrary,
});


describe('WatchService', () => {
  let mockDb: MockD1Database;
  let watchRepository: WatchRepository;
  let watchService: WatchService;

  beforeEach(() => {
    mockDb = new MockD1Database();
    watchRepository = new WatchRepository(mockDb as unknown as D1Database);
    watchService = new WatchService(watchRepository);
    mockUuidCounter = 0;
    // Mock crypto.randomUUID
    (crypto as any).randomUUID = mockRandomUUID;
  });

  afterEach(() => {
    // Restore original randomUUID
    (crypto as any).randomUUID = originalRandomUUID;
  });

  /**
   * **Feature: email-filter-management, Property 15: 重点关注CRUD一致性**
   * *For any* 重点关注项，添加后应可查询到，删除后应查询不到。
   * **Validates: Requirements 9.1**
   */
  describe('Property 15: 重点关注CRUD一致性', () => {
    it('CREATE: 添加重点关注项后应可查询到', async () => {
      await fc.assert(
        fc.asyncProperty(createWatchDTOArbitrary, async (dto) => {
          // Clear database before each test
          mockDb.clear();

          // Create the watch item
          const created = await watchService.addWatchItem(dto);

          // Query the watch item
          const found = await watchService.getWatchItem(created.id);

          // Verify the data matches
          expect(found).not.toBeNull();
          expect(found!.subjectPattern).toBe(dto.subjectPattern);
          expect(found!.matchMode).toBe(dto.matchMode);
          expect(found!.id).toBe(created.id);
        }),
        { numRuns: 100 }
      );
    });

    it('DELETE: 删除重点关注项后应查询不到', async () => {
      await fc.assert(
        fc.asyncProperty(createWatchDTOArbitrary, async (dto) => {
          // Clear database before each test
          mockDb.clear();

          // Create the watch item
          const created = await watchService.addWatchItem(dto);

          // Verify it exists
          const beforeDelete = await watchService.getWatchItem(created.id);
          expect(beforeDelete).not.toBeNull();

          // Delete the watch item
          const deleted = await watchService.deleteWatchItem(created.id);
          expect(deleted).toBe(true);

          // Query should return null
          const afterDelete = await watchService.getWatchItem(created.id);
          expect(afterDelete).toBeNull();
        }),
        { numRuns: 100 }
      );
    });

    it('DELETE: 删除不存在的重点关注项应返回false', async () => {
      await fc.assert(
        fc.asyncProperty(fc.uuid(), async (nonExistentId) => {
          // Clear database before each test
          mockDb.clear();

          // Try to delete non-existent item
          const deleted = await watchService.deleteWatchItem(nonExistentId);
          expect(deleted).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it('LIST: 添加多个重点关注项后应全部可查询到', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(createWatchDTOArbitrary, { minLength: 1, maxLength: 10 }),
          async (dtos) => {
            // Clear database before each test
            mockDb.clear();

            // Create all watch items
            const createdItems: WatchItem[] = [];
            for (const dto of dtos) {
              const created = await watchService.addWatchItem(dto);
              createdItems.push(created);
            }

            // Get all watch items
            const allItems = await watchService.getAllWatchItems();

            // Verify count matches
            expect(allItems.length).toBe(dtos.length);

            // Verify all created items are in the list
            for (const created of createdItems) {
              const found = allItems.find(item => item.id === created.id);
              expect(found).toBeDefined();
              expect(found!.subjectPattern).toBe(created.subjectPattern);
              expect(found!.matchMode).toBe(created.matchMode);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('DELETE: 删除重点关注项时应同时删除关联的命中记录', async () => {
      await fc.assert(
        fc.asyncProperty(
          createWatchDTOArbitrary,
          fc.array(emailArbitrary, { minLength: 1, maxLength: 5 }),
          async (dto, recipients) => {
            // Clear database before each test
            mockDb.clear();

            // Create the watch item
            const created = await watchService.addWatchItem(dto);

            // Record some hits
            for (const recipient of recipients) {
              await watchService.recordHit(created.id, recipient);
            }

            // Verify hits exist
            const hitsBefore = mockDb.getWatchHits();
            const hitsForWatch = hitsBefore.filter(h => h.watchId === created.id);
            expect(hitsForWatch.length).toBe(recipients.length);

            // Delete the watch item
            await watchService.deleteWatchItem(created.id);

            // Verify hits are also deleted
            const hitsAfter = mockDb.getWatchHits();
            const hitsForWatchAfter = hitsAfter.filter(h => h.watchId === created.id);
            expect(hitsForWatchAfter.length).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });
  });


  /**
   * **Feature: email-filter-management, Property 16: 重点关注统计准确性**
   * *For any* 匹配重点关注主题的邮件，统计数据应正确更新，包括totalCount递增和recipients列表包含该邮件的收件人。
   * **Validates: Requirements 9.2, 9.3, 9.4**
   */
  describe('Property 16: 重点关注统计准确性', () => {
    it('记录命中后totalCount应正确递增', async () => {
      await fc.assert(
        fc.asyncProperty(
          createWatchDTOArbitrary,
          fc.array(emailArbitrary, { minLength: 1, maxLength: 20 }),
          async (dto, recipients) => {
            // Clear database before each test
            mockDb.clear();

            // Create the watch item
            const created = await watchService.addWatchItem(dto);

            // Record hits
            for (const recipient of recipients) {
              await watchService.recordHit(created.id, recipient);
            }

            // Get stats
            const stats = await watchService.getWatchStats(created.id);

            // Verify totalCount matches number of hits
            expect(stats).not.toBeNull();
            expect(stats!.totalCount).toBe(recipients.length);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('记录命中后recipients列表应包含所有收件人', async () => {
      await fc.assert(
        fc.asyncProperty(
          createWatchDTOArbitrary,
          fc.array(emailArbitrary, { minLength: 1, maxLength: 10 }),
          async (dto, recipients) => {
            // Clear database before each test
            mockDb.clear();

            // Create the watch item
            const created = await watchService.addWatchItem(dto);

            // Record hits
            for (const recipient of recipients) {
              await watchService.recordHit(created.id, recipient);
            }

            // Get stats
            const stats = await watchService.getWatchStats(created.id);

            // Verify all unique recipients are in the list
            expect(stats).not.toBeNull();
            const uniqueRecipients = [...new Set(recipients)];
            expect(stats!.recipients.length).toBe(uniqueRecipients.length);
            for (const recipient of uniqueRecipients) {
              expect(stats!.recipients).toContain(recipient);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('重复的收件人应只在recipients列表中出现一次', async () => {
      await fc.assert(
        fc.asyncProperty(
          createWatchDTOArbitrary,
          emailArbitrary,
          fc.integer({ min: 2, max: 10 }),
          async (dto, recipient, hitCount) => {
            // Clear database before each test
            mockDb.clear();

            // Create the watch item
            const created = await watchService.addWatchItem(dto);

            // Record multiple hits from same recipient
            for (let i = 0; i < hitCount; i++) {
              await watchService.recordHit(created.id, recipient);
            }

            // Get stats
            const stats = await watchService.getWatchStats(created.id);

            // Verify totalCount is correct
            expect(stats).not.toBeNull();
            expect(stats!.totalCount).toBe(hitCount);

            // Verify recipient appears only once in list
            expect(stats!.recipients.length).toBe(1);
            expect(stats!.recipients[0]).toBe(recipient);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('checkAndRecordMatches应正确匹配并记录命中', async () => {
      await fc.assert(
        fc.asyncProperty(
          subjectPatternArbitrary,
          emailArbitrary,
          async (pattern, recipient) => {
            // Clear database before each test
            mockDb.clear();

            // Create a watch item with 'contains' mode
            const created = await watchService.addWatchItem({
              subjectPattern: pattern,
              matchMode: 'contains',
            });

            // Create an email that contains the pattern in subject
            const email: IncomingEmail = {
              recipient,
              sender: 'Test Sender',
              senderEmail: 'sender@test.com',
              subject: `This email contains ${pattern} in the subject`,
              receivedAt: new Date(),
            };

            // Check and record matches
            const matchedItems = await watchService.checkAndRecordMatches(email);

            // Verify the watch item was matched
            expect(matchedItems.length).toBe(1);
            expect(matchedItems[0].id).toBe(created.id);

            // Verify hit was recorded
            const stats = await watchService.getWatchStats(created.id);
            expect(stats).not.toBeNull();
            expect(stats!.totalCount).toBe(1);
            expect(stats!.recipients).toContain(recipient);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('不匹配的邮件不应记录命中', async () => {
      await fc.assert(
        fc.asyncProperty(
          emailArbitrary,
          async (recipient) => {
            // Clear database before each test
            mockDb.clear();

            // Create a watch item with a specific pattern
            const created = await watchService.addWatchItem({
              subjectPattern: 'UNIQUE_PATTERN_XYZ123',
              matchMode: 'contains',
            });

            // Create an email that does NOT contain the pattern
            const email: IncomingEmail = {
              recipient,
              sender: 'Test Sender',
              senderEmail: 'sender@test.com',
              subject: 'This email has a completely different subject',
              receivedAt: new Date(),
            };

            // Check and record matches
            const matchedItems = await watchService.checkAndRecordMatches(email);

            // Verify no match
            expect(matchedItems.length).toBe(0);

            // Verify no hit was recorded
            const stats = await watchService.getWatchStats(created.id);
            expect(stats).not.toBeNull();
            expect(stats!.totalCount).toBe(0);
            expect(stats!.recipients.length).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('getAllWatchStats应返回所有重点关注项的统计', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(createWatchDTOArbitrary, { minLength: 1, maxLength: 5 }),
          fc.array(emailArbitrary, { minLength: 1, maxLength: 5 }),
          async (dtos, recipients) => {
            // Clear database before each test
            mockDb.clear();

            // Create watch items and record hits
            const createdItems: WatchItem[] = [];
            for (const dto of dtos) {
              const created = await watchService.addWatchItem(dto);
              createdItems.push(created);

              // Record some hits for each item
              for (const recipient of recipients) {
                await watchService.recordHit(created.id, recipient);
              }
            }

            // Get all stats
            const allStats = await watchService.getAllWatchStats();

            // Verify count matches
            expect(allStats.length).toBe(dtos.length);

            // Verify each item has correct stats
            for (const created of createdItems) {
              const stats = allStats.find(s => s.watchId === created.id);
              expect(stats).toBeDefined();
              expect(stats!.totalCount).toBe(recipients.length);
              expect(stats!.subjectPattern).toBe(created.subjectPattern);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
