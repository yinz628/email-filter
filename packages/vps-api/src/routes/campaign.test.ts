/**
 * Campaign Routes Tests
 * 
 * Property-based tests for campaign API route validation
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { validateTrackEmail } from './campaign.js';

// ============================================
// Arbitraries for generating test data
// ============================================

// Generate valid domain parts (no spaces, at least one character)
const domainPartArb = fc.stringOf(
  fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-'.split('')),
  { minLength: 1, maxLength: 20 }
).filter(s => !s.startsWith('-') && !s.endsWith('-'));

// Generate valid TLDs
const tldArb = fc.constantFrom('com', 'org', 'net', 'io', 'co', 'edu', 'gov');

// Generate valid domain (e.g., "example.com")
const validDomainArb = fc.tuple(domainPartArb, tldArb)
  .map(([name, tld]) => `${name}.${tld}`);

// Generate valid local part of email (before @)
const localPartArb = fc.stringOf(
  fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789._+-'.split('')),
  { minLength: 1, maxLength: 30 }
).filter(s => s.length > 0 && !s.startsWith('.') && !s.endsWith('.'));

// Generate valid email address
const validEmailArb = fc.tuple(localPartArb, validDomainArb)
  .map(([local, domain]) => `${local}@${domain}`);

// Generate non-empty string for subject
const validSubjectArb = fc.string({ minLength: 1, maxLength: 200 })
  .filter(s => s.trim().length > 0);

// Generate valid TrackEmailDTO
const validTrackEmailDTOArb = fc.record({
  sender: validEmailArb,
  subject: validSubjectArb,
  recipient: validEmailArb,
});

// Generate whitespace-only strings
const whitespaceOnlyArb = fc.stringOf(fc.constantFrom(' ', '\t', '\n', '\r'), { minLength: 0, maxLength: 10 });

describe('Campaign Routes Validation', () => {
  /**
   * **Feature: campaign-analytics, Property 12: Data Validation**
   * **Validates: Requirements 8.2**
   * 
   * For any track request with missing required fields (sender, subject, recipient),
   * the API should return a validation error.
   */
  describe('Property 12: Data Validation', () => {
    it('should accept valid TrackEmailDTO with all required fields', () => {
      fc.assert(
        fc.property(
          validTrackEmailDTOArb,
          (dto) => {
            const result = validateTrackEmail(dto);
            
            expect(result.valid).toBe(true);
            expect(result.error).toBeUndefined();
            expect(result.data).toBeDefined();
            expect(result.data!.sender).toBe(dto.sender.trim());
            expect(result.data!.subject).toBe(dto.subject.trim());
            expect(result.data!.recipient).toBe(dto.recipient.trim());
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject requests with missing sender', () => {
      fc.assert(
        fc.property(
          validSubjectArb,
          validEmailArb,
          (subject, recipient) => {
            // Missing sender entirely
            const result1 = validateTrackEmail({ subject, recipient });
            expect(result1.valid).toBe(false);
            expect(result1.error).toContain('sender');

            // Null sender
            const result2 = validateTrackEmail({ sender: null, subject, recipient });
            expect(result2.valid).toBe(false);
            expect(result2.error).toContain('sender');

            // Undefined sender
            const result3 = validateTrackEmail({ sender: undefined, subject, recipient });
            expect(result3.valid).toBe(false);
            expect(result3.error).toContain('sender');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject requests with empty or whitespace-only sender', () => {
      fc.assert(
        fc.property(
          whitespaceOnlyArb,
          validSubjectArb,
          validEmailArb,
          (emptySender, subject, recipient) => {
            const result = validateTrackEmail({ sender: emptySender, subject, recipient });
            expect(result.valid).toBe(false);
            expect(result.error).toContain('sender');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject requests with missing subject', () => {
      fc.assert(
        fc.property(
          validEmailArb,
          validEmailArb,
          (sender, recipient) => {
            // Missing subject entirely
            const result1 = validateTrackEmail({ sender, recipient });
            expect(result1.valid).toBe(false);
            expect(result1.error).toContain('subject');

            // Null subject
            const result2 = validateTrackEmail({ sender, subject: null, recipient });
            expect(result2.valid).toBe(false);
            expect(result2.error).toContain('subject');

            // Undefined subject
            const result3 = validateTrackEmail({ sender, subject: undefined, recipient });
            expect(result3.valid).toBe(false);
            expect(result3.error).toContain('subject');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject requests with empty or whitespace-only subject', () => {
      fc.assert(
        fc.property(
          validEmailArb,
          whitespaceOnlyArb,
          validEmailArb,
          (sender, emptySubject, recipient) => {
            const result = validateTrackEmail({ sender, subject: emptySubject, recipient });
            expect(result.valid).toBe(false);
            expect(result.error).toContain('subject');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject requests with missing recipient', () => {
      fc.assert(
        fc.property(
          validEmailArb,
          validSubjectArb,
          (sender, subject) => {
            // Missing recipient entirely
            const result1 = validateTrackEmail({ sender, subject });
            expect(result1.valid).toBe(false);
            expect(result1.error).toContain('recipient');

            // Null recipient
            const result2 = validateTrackEmail({ sender, subject, recipient: null });
            expect(result2.valid).toBe(false);
            expect(result2.error).toContain('recipient');

            // Undefined recipient
            const result3 = validateTrackEmail({ sender, subject, recipient: undefined });
            expect(result3.valid).toBe(false);
            expect(result3.error).toContain('recipient');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject requests with empty or whitespace-only recipient', () => {
      fc.assert(
        fc.property(
          validEmailArb,
          validSubjectArb,
          whitespaceOnlyArb,
          (sender, subject, emptyRecipient) => {
            const result = validateTrackEmail({ sender, subject, recipient: emptyRecipient });
            expect(result.valid).toBe(false);
            expect(result.error).toContain('recipient');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject null or undefined request body', () => {
      const result1 = validateTrackEmail(null);
      expect(result1.valid).toBe(false);
      expect(result1.error).toBeDefined();

      const result2 = validateTrackEmail(undefined);
      expect(result2.valid).toBe(false);
      expect(result2.error).toBeDefined();
    });

    it('should reject non-object request body', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.string(),
            fc.integer(),
            fc.boolean(),
            fc.array(fc.anything())
          ),
          (invalidBody) => {
            const result = validateTrackEmail(invalidBody);
            expect(result.valid).toBe(false);
            expect(result.error).toBeDefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should accept optional receivedAt field when valid', () => {
      fc.assert(
        fc.property(
          validTrackEmailDTOArb,
          fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01') }),
          (dto, date) => {
            const dtoWithDate = { ...dto, receivedAt: date.toISOString() };
            const result = validateTrackEmail(dtoWithDate);
            
            expect(result.valid).toBe(true);
            expect(result.data).toBeDefined();
            expect(result.data!.receivedAt).toBe(date.toISOString());
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject non-string receivedAt field', () => {
      fc.assert(
        fc.property(
          validTrackEmailDTOArb,
          fc.oneof(fc.integer(), fc.boolean(), fc.object()),
          (dto, invalidReceivedAt) => {
            const dtoWithInvalidDate = { ...dto, receivedAt: invalidReceivedAt };
            const result = validateTrackEmail(dtoWithInvalidDate);
            
            expect(result.valid).toBe(false);
            expect(result.error).toContain('receivedAt');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should trim whitespace from valid fields', () => {
      // Use subjects without leading/trailing whitespace for this test
      const trimmedSubjectArb = fc.string({ minLength: 1, maxLength: 200 })
        .map(s => s.trim())
        .filter(s => s.length > 0);
      
      fc.assert(
        fc.property(
          validEmailArb,
          trimmedSubjectArb,
          validEmailArb,
          (sender, subject, recipient) => {
            // Add whitespace around values
            const dtoWithWhitespace = {
              sender: `  ${sender}  `,
              subject: `  ${subject}  `,
              recipient: `  ${recipient}  `,
            };
            
            const result = validateTrackEmail(dtoWithWhitespace);
            
            expect(result.valid).toBe(true);
            expect(result.data!.sender).toBe(sender);
            expect(result.data!.subject).toBe(subject);
            expect(result.data!.recipient).toBe(recipient);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
