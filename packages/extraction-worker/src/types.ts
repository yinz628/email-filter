/**
 * Local type definitions for extraction-worker.
 *
 * This worker is deployed standalone and must NOT bundle the @email-filter/shared
 * package (it would bloat the Worker and create a build-time dependency on a
 * package that itself needs tsc compilation). The shapes here mirror the
 * corresponding interfaces in packages/shared/src/types/extraction.ts — keep
 * them in sync when the contract changes.
 *
 * Reference (single source of truth):
 *   packages/shared/src/types/extraction.ts
 */

export type ExtractionSource = 'subject' | 'text-body' | 'html-body';

export interface ExtractedCode {
  value: string;
  source: ExtractionSource;
}

export interface ExtractionResult {
  code?: ExtractedCode;
  link?: string;
  /** Discount value (e.g. "20% OFF", "$10"), only for discount extraction */
  discountValue?: string;
  extractedAt: string;
}

/**
 * Request body for POST /extract (service binding from email-worker).
 * JSON format; rawMime is the full RFC822 MIME source.
 * ruleId lets the worker look up the extraction config from D1.
 */
export interface ExtractRequest {
  rawMime: string;
  ruleId?: string;
}

/**
 * What type of extraction to perform, derived from the rule's extract_type.
 */
export type ExtractType = 'verification' | 'discount';
