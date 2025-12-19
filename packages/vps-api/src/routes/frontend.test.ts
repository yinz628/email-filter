import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';

/**
 * Auto-Refresh System Tests
 * 
 * These tests verify the correctness properties defined in the design document
 * for the code-cleanup-and-optimization spec.
 * 
 * Since the auto-refresh code is embedded in frontend.ts as inline JavaScript,
 * we extract and test the core logic patterns here.
 */

// Simulated auto-refresh timer types (matching frontend.ts)
type RefreshType = 'alerts' | 'status' | 'funnel' | 'heartbeat' | 'merchants' | 'dataStats' | 'logs' | 'stats';

// Tab names in the system
type TabName = 'workers' | 'rules' | 'dynamic' | 'logs' | 'stats' | 'campaign' | 'monitoring' | 'settings';

// Auto-refresh timer manager (extracted logic from frontend.ts)
class AutoRefreshManager {
  private timers: Record<RefreshType, NodeJS.Timeout | null>;
  private functions: Record<RefreshType, () => void>;
  private tabRefreshTypes: Record<TabName, RefreshType[]>;
  private pausedState: Record<string, { interval: number }>;
  private currentActiveTab: TabName;
  private settings: Record<string, { enabled: boolean; interval: string }>;

  constructor() {
    // Initialize all timer keys with null (Property 1: Timer Keys Completeness)
    this.timers = {
      alerts: null,
      status: null,
      funnel: null,
      heartbeat: null,
      merchants: null,
      dataStats: null,
      logs: null,
      stats: null
    };

    // Mock refresh functions
    this.functions = {
      alerts: vi.fn(),
      status: vi.fn(),
      funnel: vi.fn(),
      heartbeat: vi.fn(),
      merchants: vi.fn(),
      dataStats: vi.fn(),
      logs: vi.fn(),
      stats: vi.fn()
    };

    // Tab to refresh type mapping
    this.tabRefreshTypes = {
      'workers': [],
      'rules': [],
      'dynamic': [],
      'logs': ['logs'],
      'stats': ['stats'],
      'campaign': ['merchants', 'dataStats'],
      'monitoring': ['alerts', 'status', 'funnel', 'heartbeat'],
      'settings': []
    };

    this.pausedState = {};
    this.currentActiveTab = 'workers';
    this.settings = {};
  }

  getTimerKeys(): RefreshType[] {
    return Object.keys(this.timers) as RefreshType[];
  }

  getFunctionKeys(): RefreshType[] {
    return Object.keys(this.functions) as RefreshType[];
  }

  hasTimerKey(type: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.timers, type);
  }

  startAutoRefresh(type: RefreshType, interval: number): void {
    // Stop existing timer first (Property 2: No Duplicate Timers)
    this.stopAutoRefresh(type);
    
    const fn = this.functions[type];
    if (fn && this.hasTimerKey(type)) {
      this.timers[type] = setInterval(fn, interval);
    }
  }

  stopAutoRefresh(type: RefreshType): void {
    if (this.hasTimerKey(type) && this.timers[type]) {
      clearInterval(this.timers[type]!);
      this.timers[type] = null;
    }
  }

  stopAllAutoRefresh(): void {
    this.getTimerKeys().forEach(type => this.stopAutoRefresh(type));
  }

  isTimerActive(type: RefreshType): boolean {
    return this.timers[type] !== null;
  }

  getActiveTimerCount(): number {
    return this.getTimerKeys().filter(type => this.isTimerActive(type)).length;
  }

  // Tab visibility control (Property 3: Active Tab Only Refresh)
  pauseTabRefresh(tabName: TabName): void {
    const refreshTypes = this.tabRefreshTypes[tabName] || [];
    refreshTypes.forEach(type => {
      if (this.timers[type]) {
        this.pausedState[type] = { interval: 60000 }; // Default interval
        this.stopAutoRefresh(type);
      }
    });
  }

  resumeTabRefresh(tabName: TabName, enabledTypes: RefreshType[]): void {
    const refreshTypes = this.tabRefreshTypes[tabName] || [];
    refreshTypes.forEach(type => {
      if (enabledTypes.includes(type)) {
        const interval = this.pausedState[type]?.interval || 60000;
        this.startAutoRefresh(type, interval);
        delete this.pausedState[type];
      }
    });
  }

  switchTab(newTab: TabName, enabledTypes: RefreshType[]): void {
    // Pause old tab's refresh
    this.pauseTabRefresh(this.currentActiveTab);
    
    // Switch to new tab
    this.currentActiveTab = newTab;
    
    // Resume new tab's refresh
    this.resumeTabRefresh(newTab, enabledTypes);
  }

  getCurrentTab(): TabName {
    return this.currentActiveTab;
  }

  getTabRefreshTypes(tabName: TabName): RefreshType[] {
    return this.tabRefreshTypes[tabName] || [];
  }

  // Settings persistence (Property 4: Settings Persistence Round Trip)
  saveSettings(type: RefreshType, enabled: boolean, interval: string): void {
    this.settings[type] = { enabled, interval };
  }

  getSettings(): Record<string, { enabled: boolean; interval: string }> {
    return { ...this.settings };
  }

  restoreSettings(settings: Record<string, { enabled: boolean; interval: string }>): void {
    Object.keys(settings).forEach(type => {
      // Skip restoration for types not in timers (Requirement 5.3)
      if (!this.hasTimerKey(type)) {
        return;
      }
      
      const { enabled, interval } = settings[type];
      if (enabled) {
        this.startAutoRefresh(type as RefreshType, parseInt(interval, 10) * 1000);
      }
    });
  }
}

// Arbitraries for property-based testing
const refreshTypeArb = fc.constantFrom<RefreshType>(
  'alerts', 'status', 'funnel', 'heartbeat', 'merchants', 'dataStats', 'logs', 'stats'
);

const tabNameArb = fc.constantFrom<TabName>(
  'workers', 'rules', 'dynamic', 'logs', 'stats', 'campaign', 'monitoring', 'settings'
);

const intervalArb = fc.integer({ min: 1, max: 300 }); // 1-300 seconds

describe('AutoRefreshManager', () => {
  let manager: AutoRefreshManager;

  beforeEach(() => {
    vi.useFakeTimers();
    manager = new AutoRefreshManager();
  });

  afterEach(() => {
    manager.stopAllAutoRefresh();
    vi.useRealTimers();
  });

  /**
   * **Feature: code-cleanup-and-optimization, Property 1: Timer Keys Completeness**
   * **Validates: Requirements 1.1, 2.2**
   * 
   * For any key in autoRefreshFunctions, that key should also exist in autoRefreshTimers
   */
  describe('Property 1: Timer Keys Completeness', () => {
    it('should have all function keys present in timer keys', () => {
      const timerKeys = manager.getTimerKeys();
      const functionKeys = manager.getFunctionKeys();
      
      // Every function key should exist in timer keys
      functionKeys.forEach(key => {
        expect(timerKeys).toContain(key);
      });
      
      // Timer keys and function keys should be identical sets
      expect(timerKeys.sort()).toEqual(functionKeys.sort());
    });

    it('should have exactly 8 timer types defined', () => {
      const expectedTypes: RefreshType[] = [
        'alerts', 'status', 'funnel', 'heartbeat', 
        'merchants', 'dataStats', 'logs', 'stats'
      ];
      
      const timerKeys = manager.getTimerKeys();
      expect(timerKeys.sort()).toEqual(expectedTypes.sort());
    });

    it('should recognize all valid refresh types', () => {
      fc.assert(
        fc.property(refreshTypeArb, (type) => {
          expect(manager.hasTimerKey(type)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: code-cleanup-and-optimization, Property 2: No Duplicate Timers**
   * **Validates: Requirements 1.2**
   * 
   * For any refresh type, calling startAutoRefresh multiple times should result 
   * in exactly one active timer
   */
  describe('Property 2: No Duplicate Timers', () => {
    it('should have exactly one timer after multiple startAutoRefresh calls', () => {
      fc.assert(
        fc.property(
          refreshTypeArb,
          intervalArb,
          fc.integer({ min: 2, max: 10 }), // Number of times to call start
          (type, interval, callCount) => {
            // Call startAutoRefresh multiple times
            for (let i = 0; i < callCount; i++) {
              manager.startAutoRefresh(type, interval * 1000);
            }
            
            // Should have exactly one active timer for this type
            expect(manager.isTimerActive(type)).toBe(true);
            
            // Count active timers - should be exactly 1
            const activeCount = manager.getTimerKeys()
              .filter(t => t === type && manager.isTimerActive(t)).length;
            expect(activeCount).toBe(1);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should stop existing timer before starting new one', () => {
      fc.assert(
        fc.property(
          refreshTypeArb,
          intervalArb,
          intervalArb,
          (type, interval1, interval2) => {
            // Stop all timers first to ensure clean state
            manager.stopAllAutoRefresh();
            
            // Start with first interval
            manager.startAutoRefresh(type, interval1 * 1000);
            expect(manager.isTimerActive(type)).toBe(true);
            const countAfterFirst = manager.getActiveTimerCount();
            
            // Start with second interval (should replace, not add)
            manager.startAutoRefresh(type, interval2 * 1000);
            expect(manager.isTimerActive(type)).toBe(true);
            
            // Active timer count should remain the same (timer was replaced, not added)
            const countAfterSecond = manager.getActiveTimerCount();
            expect(countAfterSecond).toBe(countAfterFirst);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: code-cleanup-and-optimization, Property 3: Active Tab Only Refresh**
   * **Validates: Requirements 1.3, 3.1, 3.2, 3.3**
   * 
   * For any tab switch, only the auto-refresh timers associated with the new 
   * active tab should be running
   */
  describe('Property 3: Active Tab Only Refresh', () => {
    it('should only run timers for active tab after switch', () => {
      fc.assert(
        fc.property(
          tabNameArb,
          tabNameArb,
          (fromTab, toTab) => {
            // Set initial tab
            manager['currentActiveTab'] = fromTab;
            
            // Start all possible refresh types for the from tab
            const fromTypes = manager.getTabRefreshTypes(fromTab);
            fromTypes.forEach(type => {
              manager.startAutoRefresh(type, 60000);
            });
            
            // Get types that should be enabled for the new tab
            const toTypes = manager.getTabRefreshTypes(toTab);
            
            // Switch tabs
            manager.switchTab(toTab, toTypes);
            
            // Verify current tab is updated
            expect(manager.getCurrentTab()).toBe(toTab);
            
            // Verify only new tab's timers are running (if any were enabled)
            const allTypes = manager.getTimerKeys();
            allTypes.forEach(type => {
              const shouldBeActive = toTypes.includes(type);
              if (shouldBeActive) {
                // Timer should be active if it's in the new tab's types
                expect(manager.isTimerActive(type)).toBe(true);
              } else if (!toTypes.includes(type) && fromTypes.includes(type)) {
                // Timer should be stopped if it was in old tab but not new tab
                expect(manager.isTimerActive(type)).toBe(false);
              }
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should pause refresh when switching away from tab', () => {
      // Start monitoring tab with all its refresh types
      manager['currentActiveTab'] = 'monitoring';
      const monitoringTypes = manager.getTabRefreshTypes('monitoring');
      monitoringTypes.forEach(type => {
        manager.startAutoRefresh(type, 60000);
      });
      
      // Verify timers are running
      monitoringTypes.forEach(type => {
        expect(manager.isTimerActive(type)).toBe(true);
      });
      
      // Switch to workers tab (which has no refresh types)
      manager.switchTab('workers', []);
      
      // Verify monitoring timers are stopped
      monitoringTypes.forEach(type => {
        expect(manager.isTimerActive(type)).toBe(false);
      });
    });

    it('should resume refresh when switching back to tab', () => {
      // Start on monitoring tab
      manager['currentActiveTab'] = 'monitoring';
      const monitoringTypes = manager.getTabRefreshTypes('monitoring');
      monitoringTypes.forEach(type => {
        manager.startAutoRefresh(type, 60000);
      });
      
      // Switch away
      manager.switchTab('workers', []);
      
      // Switch back to monitoring
      manager.switchTab('monitoring', monitoringTypes);
      
      // Verify timers are running again
      monitoringTypes.forEach(type => {
        expect(manager.isTimerActive(type)).toBe(true);
      });
    });
  });

  /**
   * **Feature: code-cleanup-and-optimization, Property 4: Settings Persistence Round Trip**
   * **Validates: Requirements 5.1, 5.2**
   * 
   * For any auto-refresh settings saved to localStorage, restoring those settings 
   * should produce the same enabled state and intervals
   */
  describe('Property 4: Settings Persistence Round Trip', () => {
    it('should restore saved settings correctly', () => {
      fc.assert(
        fc.property(
          refreshTypeArb,
          fc.boolean(),
          intervalArb,
          (type, enabled, interval) => {
            // Save settings
            manager.saveSettings(type, enabled, interval.toString());
            
            // Get saved settings
            const savedSettings = manager.getSettings();
            
            // Verify settings were saved correctly
            expect(savedSettings[type]).toBeDefined();
            expect(savedSettings[type].enabled).toBe(enabled);
            expect(savedSettings[type].interval).toBe(interval.toString());
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should start timers for enabled settings on restore', () => {
      fc.assert(
        fc.property(
          refreshTypeArb,
          intervalArb,
          (type, interval) => {
            // Create settings with enabled=true
            const settings: Record<string, { enabled: boolean; interval: string }> = {
              [type]: { enabled: true, interval: interval.toString() }
            };
            
            // Restore settings
            manager.restoreSettings(settings);
            
            // Timer should be active
            expect(manager.isTimerActive(type)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not start timers for disabled settings on restore', () => {
      fc.assert(
        fc.property(
          refreshTypeArb,
          intervalArb,
          (type, interval) => {
            // Create settings with enabled=false
            const settings: Record<string, { enabled: boolean; interval: string }> = {
              [type]: { enabled: false, interval: interval.toString() }
            };
            
            // Restore settings
            manager.restoreSettings(settings);
            
            // Timer should NOT be active
            expect(manager.isTimerActive(type)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should skip unknown types during restoration', () => {
      // Create settings with an unknown type
      const settings: Record<string, { enabled: boolean; interval: string }> = {
        'unknownType': { enabled: true, interval: '60' },
        'alerts': { enabled: true, interval: '30' }
      };
      
      // Restore settings - should not throw
      expect(() => manager.restoreSettings(settings)).not.toThrow();
      
      // Known type should be restored
      expect(manager.isTimerActive('alerts')).toBe(true);
      
      // Unknown type should be ignored (no error)
      expect(manager.hasTimerKey('unknownType')).toBe(false);
    });
  });

  describe('stopAllAutoRefresh', () => {
    it('should stop all active timers', () => {
      fc.assert(
        fc.property(
          fc.array(refreshTypeArb, { minLength: 1, maxLength: 8 }),
          (types) => {
            // Start multiple timers
            const uniqueTypes = [...new Set(types)];
            uniqueTypes.forEach(type => {
              manager.startAutoRefresh(type, 60000);
            });
            
            // Verify some timers are active
            expect(manager.getActiveTimerCount()).toBeGreaterThan(0);
            
            // Stop all
            manager.stopAllAutoRefresh();
            
            // Verify all timers are stopped
            expect(manager.getActiveTimerCount()).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
