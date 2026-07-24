/**
 * Extraction types — contract between email-worker and extraction-worker.
 *
 * In the worker-centric architecture, extraction results are stored in the
 * extraction-worker's D1 database (not VPS). These types define the
 * service-binding request/response between email-worker and extraction-worker.
 */

/**
 * Request body sent from email-worker to extraction-worker via service binding
 * (POST /extract). JSON format; rawMime is the full RFC822 MIME source.
 */
export interface ExtractionRequest {
  /** Raw RFC 822 MIME source of the email */
  rawMime: string;
  /** Matched forward rule ID, so worker can look up extraction config from D1 */
  ruleId?: string;
}

/**
 * Where a code was found.
 */
export type ExtractionSource = 'subject' | 'text-body' | 'html-body';

/**
 * An extracted code with provenance.
 */
export interface ExtractedCode {
  /** The code value (digits, alphanumeric, etc.) */
  value: string;
  /** Where it was found */
  source: ExtractionSource;
}

/**
 * Result returned by extraction-worker. Either a code or a link (or both)
 * may be present; both absent means no artifact was detected.
 */
export interface ExtractionResult {
  code?: ExtractedCode;
  link?: string;
  /** Discount value (e.g. "20% OFF"), only for discount extraction */
  discountValue?: string;
  /** ISO timestamp of extraction attempt */
  extractedAt: string;
}
