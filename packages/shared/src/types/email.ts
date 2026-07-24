import type { RuleCategory } from './filter-rule.js';

/**
 * Incoming email to be processed
 */
export interface IncomingEmail {
  recipient: string;
  sender: string;
  senderEmail: string;
  subject: string;
  receivedAt: Date;
}

/**
 * Email webhook payload sent from Cloudflare Worker to VPS API
 * Contains only essential fields to minimize bandwidth
 */
export interface EmailWebhookPayload {
  from: string;
  to: string;
  subject: string;
  messageId: string;
  timestamp: number;
  /** Worker name for routing to correct configuration */
  workerName?: string;
  /** How the worker obtained the subject value */
  subjectSource?: 'header' | 'raw-header-fallback' | 'missing';
  /** Raw subject header value before MIME decoding */
  subjectRawHeader?: string;
}

/**
 * Filter decision returned from VPS API to Cloudflare Worker
 */
export interface FilterDecision {
  action: 'forward' | 'drop';
  forwardTo?: string;
  reason?: string;
  /**
   * When true, the email-worker should extract a verification code/link from
   * the message body via the extraction-worker service binding. Set only when
   * the matched forward rule has extractVerification=true.
   * Mutually exclusive with discountRequired.
   */
  verificationRequired?: boolean;
  /**
   * When true, the email-worker should extract a discount code/link.
   * Set only when the matched forward rule has extractDiscount=true.
   * Mutually exclusive with verificationRequired.
   */
  discountRequired?: boolean;
  /**
   * The matched forward rule's ID, passed to extraction-worker so it can
   * look up the extraction config (code_pattern, link_anchor_pattern) from D1.
   */
  ruleId?: string;
}

/**
 * Result of email processing
 */
export interface ProcessResult {
  action: 'passed' | 'deleted';
  forwardTo?: string;  // Forwarding address for passed emails
  matchedRule?: {
    id: string;
    category: RuleCategory;
    pattern: string;
  };
}
