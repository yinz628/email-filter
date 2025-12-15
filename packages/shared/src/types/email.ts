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
}

/**
 * Filter decision returned from VPS API to Cloudflare Worker
 */
export interface FilterDecision {
  action: 'forward' | 'drop';
  forwardTo?: string;
  reason?: string;
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
