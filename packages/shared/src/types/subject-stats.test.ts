import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { extractDomainFromEmail } from './subject-stats.js';

describe('Subject Stats Utils', () => {
  /**
   * **Feature: email-subject-display, Property 4: Domain Extraction Consistency**
   * *For any* valid email address, extracting the domain should return the root domain 
   * portion after the @ symbol in lowercase.
   * **Validates: Requirements 1.4**
   */
  describe('Property 4: Domain Extraction Consistency', () => {
    it('should extract domain from valid email addresses', () => {
      fc.assert(
        fc.property(
          fc.emailAddress(),
          (email) => {
            const domain = extractDomainFromEmail(email);
            const atIndex = email.lastIndexOf('@');
            const expectedDomain = email.substring(atIndex + 1).toLowerCase();
            
            expect(domain).toBe(expectedDomain);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should always return lowercase domain', () => {
      fc.assert(
        fc.property(
          fc.emailAddress(),
          (email) => {
            const domain = extractDomainFromEmail(email);
            expect(domain).toBe(domain.toLowerCase());
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle mixed case email addresses', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z0-9._-]+$/.test(s)),
            fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z0-9.-]+$/.test(s))
          ),
          ([localPart, domainPart]) => {
            const email = `${localPart}@${domainPart.toUpperCase()}`;
            const domain = extractDomainFromEmail(email);
            expect(domain).toBe(domainPart.toLowerCase());
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return empty string for invalid emails without @', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 0, maxLength: 50 }).filter(s => !s.includes('@')),
          (invalidEmail) => {
            const domain = extractDomainFromEmail(invalidEmail);
            expect(domain).toBe('');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return empty string for emails ending with @', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }).filter(s => !s.includes('@')),
          (localPart) => {
            const email = `${localPart}@`;
            const domain = extractDomainFromEmail(email);
            expect(domain).toBe('');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle empty and null-like inputs', () => {
      expect(extractDomainFromEmail('')).toBe('');
      expect(extractDomainFromEmail(null as unknown as string)).toBe('');
      expect(extractDomainFromEmail(undefined as unknown as string)).toBe('');
    });

    it('should use last @ symbol for emails with multiple @', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.string({ minLength: 1, maxLength: 10 }).filter(s => /^[a-zA-Z0-9]+$/.test(s)),
            fc.string({ minLength: 1, maxLength: 10 }).filter(s => /^[a-zA-Z0-9]+$/.test(s)),
            fc.string({ minLength: 1, maxLength: 10 }).filter(s => /^[a-zA-Z0-9.]+$/.test(s))
          ),
          ([part1, part2, domain]) => {
            const email = `${part1}@${part2}@${domain}`;
            const extractedDomain = extractDomainFromEmail(email);
            expect(extractedDomain).toBe(domain.toLowerCase());
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should trim whitespace from extracted domain', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.string({ minLength: 1, maxLength: 10 }).filter(s => /^[a-zA-Z0-9]+$/.test(s)),
            fc.string({ minLength: 1, maxLength: 10 }).filter(s => /^[a-zA-Z0-9.]+$/.test(s))
          ),
          ([localPart, domain]) => {
            const email = `${localPart}@${domain}  `;
            const extractedDomain = extractDomainFromEmail(email);
            expect(extractedDomain).toBe(domain.toLowerCase());
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
